#!/usr/bin/env bash
set -euo pipefail

# ========================================
# CARTIE PRODUCTION DEPLOYMENT SCRIPT
# Idempotent, zero-downtime deployment
# ========================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

REPO_DIR="${REPO_DIR:-$DEFAULT_REPO_DIR}"
PROJECT="${PROJECT:-infra2}"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_DIR/infra/docker-compose.cartie2.prod.yml}"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env}"
LOG_DIR="/srv/cartie/_logs"
TS=$(date -u +%Y-%m-%d_%H%M%S)
LOG_FILE="$LOG_DIR/deploy_${TS}.log"
ASSET_MANIFEST_FILE="${ASSET_MANIFEST_FILE:-$LOG_DIR/web_assets_last.txt}"
ALLOW_DIRTY="${ALLOW_DIRTY:-0}"
BRANCH="${BRANCH:-main}"
SKIP_PULL="${SKIP_PULL:-0}"
RUN_SEED="${RUN_SEED:-1}"
SYNC_PRESETS="${SYNC_PRESETS:-1}"

# Ensure log directory exists before the first log() call (set -e safe).
mkdir -p "$LOG_DIR"

# Build metadata (computed in preflight)
BUILD_SHA="${BUILD_SHA:-}"
BUILD_TIME="${BUILD_TIME:-}"

# Colors
RED='\033[0:31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[DEPLOY]${NC} $*" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "$LOG_FILE"; }
die() { echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE"; exit 1; }

# ========================================
# STEP 0: Pre-Flight Checks
# ========================================
preflight() {
  log "Pre-flight checks..."
  
  [ -d "$REPO_DIR" ] || die "Repo directory not found: $REPO_DIR"
  [ -f "$COMPOSE_FILE" ] || die "Compose file not found: $COMPOSE_FILE"
  [ -f "$ENV_FILE" ] || die "ENV file not found: $ENV_FILE"
  
  cd "$REPO_DIR" || die "Cannot cd to $REPO_DIR"
  
  # Check git status
  local dirty
  dirty="$(git status --porcelain 2>/dev/null || true)"
  if [ -n "$dirty" ] && [ "$ALLOW_DIRTY" != "1" ]; then
    die "Repo has uncommitted changes. Commit/stash them or run with ALLOW_DIRTY=1."
  elif [ -n "$dirty" ]; then
    warn "Repo has uncommitted changes. Continuing because ALLOW_DIRTY=1."
  fi

  local base_sha
  base_sha="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
  local dirty_stamp
  dirty_stamp="$(date -u +%Y%m%d%H%M%S)"
  if [ -n "$dirty" ]; then
    BUILD_SHA="${base_sha}-dirty-${dirty_stamp}"
  else
    BUILD_SHA="$base_sha"
  fi
  BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  export BUILD_SHA BUILD_TIME
  log "Build metadata: sha=$BUILD_SHA time=$BUILD_TIME"
  
  # Create log dir
  mkdir -p "$LOG_DIR"

  log "Running security preflight..."
  bash "$REPO_DIR/infra/security_preflight.sh" --env-file "$ENV_FILE" --run-seed "$RUN_SEED" \
    || die "Security preflight failed"
  
  log "✅ Pre-flight OK"
}

# ========================================
# STEP 1: Cleanup Old Containers/Networks
# ========================================
# ========================================
# STEP 1: Rolling Update
# ========================================
cleanup_and_restart() {
  log "Using rolling update (no downtime)..."
  log "✅ Skipping 'down' to keep services running"
}

# ========================================
# STEP 2: Pull Latest Code (optional)
# ========================================
pull_code() {
  if [ "$SKIP_PULL" = "1" ]; then
    warn "SKIP_PULL=1, skipping git fetch/merge."
    return
  fi

  log "Pulling latest code..."
  
  if git remote get-url origin &>/dev/null; then
    log "Fetching origin/$BRANCH..."
    git fetch origin "$BRANCH" || warn "Git fetch failed (offline?)"
    
    log "Merging origin/$BRANCH (fast-forward only)..."
    git merge --ff-only "origin/$BRANCH" || warn "Cannot fast-forward (manual merge needed?)"
  else
    warn "No git remote 'origin' found. Skipping pull."
  fi
  
  log "✅ Code updated"
}

# ========================================
# STEP 3: Build Images
# ========================================
build_images() {
  log "Building Docker images..."
  
  BUILD_SHA="$BUILD_SHA" BUILD_TIME="$BUILD_TIME" \
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" build api web \
    || die "Docker build failed"
  
  log "✅ Images built"
}

# ========================================
# Helper: wait for HTTP endpoint
# ========================================
wait_for_http() {
  local url="$1"
  local label="$2"
  local retries="${3:-40}"
  local sleep_sec="${4:-2}"

  while [ "$retries" -gt 0 ]; do
    if curl --fail --silent --show-error --max-time 3 -o /dev/null "$url"; then
      log "✅ ${label} is ready (${url})"
      return 0
    fi
    retries=$((retries - 1))
    sleep "$sleep_sec"
  done

  return 1
}

# ========================================
# STEP 4: Start Services
# ========================================
start_services() {
  log "Starting services (phased rolling update)..."

  # Keep DB warm and available.
  BUILD_SHA="$BUILD_SHA" BUILD_TIME="$BUILD_TIME" \
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d db \
    || die "Failed to ensure db service"

  # Update API first, wait for readiness, then update WEB.
  BUILD_SHA="$BUILD_SHA" BUILD_TIME="$BUILD_TIME" \
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d --no-deps api \
    || die "Failed to start api service"

  wait_for_http "http://127.0.0.1:3002/health" "API" 60 2 \
    || die "API did not become ready in time"

  BUILD_SHA="$BUILD_SHA" BUILD_TIME="$BUILD_TIME" \
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d --no-deps web \
    || die "Failed to start web service"

  wait_for_http "http://127.0.0.1:8082/api/health" "WEB proxy" 60 2 \
    || die "WEB did not become ready in time"

  BUILD_SHA="$BUILD_SHA" BUILD_TIME="$BUILD_TIME" \
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d --remove-orphans \
    || die "Final reconcile failed"

  log "✅ Services started"
}

# ========================================
# STEP 5: Run Migrations
# ========================================
run_migrations() {
  log "Running database migrations..."
  
  local api_container="${PROJECT}-api-1"
  
  # Wait for API container to be ready
  local retries=30
  while [ $retries -gt 0 ]; do
    if docker exec "$api_container" test -f package.json &>/dev/null; then
      break
    fi
    retries=$((retries - 1))
    sleep 1
  done
  
  [ $retries -eq 0 ] && die "API container not ready after 30s"
  
  docker exec "$api_container" npm run prisma:migrate \
    || die "Migration failed"
  
  log "✅ Migrations complete"
}

# ========================================
# STEP 6: Seed Production Data
# ========================================
seed_data() {
  if [ "$RUN_SEED" != "1" ]; then
    warn "RUN_SEED=$RUN_SEED, skipping seed step."
    return
  fi

  log "Seeding production data..."
  
  local api_container="${PROJECT}-api-1"
  
  # Run seed (idempotent - upserts only)
  docker exec "$api_container" npm run seed \
    || warn "Seed failed (might be OK if data already exists)"
  
  log "✅ Seed complete"
}

# ========================================
# STEP 6.5: Sync Bot Presets/Commands
# ========================================
sync_bot_presets() {
  if [ "$SYNC_PRESETS" != "1" ]; then
    warn "SYNC_PRESETS=$SYNC_PRESETS, skipping bot preset sync."
    return
  fi

  log "Syncing bot presets and Telegram commands..."

  local api_container="${PROJECT}-api-1"
  docker exec "$api_container" npm run preset:sync \
    || warn "Preset sync failed (continuing deploy)"

  log "✅ Preset sync step complete"
}

# ========================================
# STEP 7: Health Checks
# ========================================
health_checks() {
  log "Running health checks..."
  
  # Check containers
  for service in "db" "api" "web"; do
    local container="${PROJECT}-${service}-1"
    local status
    status=$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null || echo "missing")
    
    if [ "$status" != "running" ]; then
      die "Container $container is $status (expected running)"
    fi
    log "✅ $container is running"
  done
  
  # Check HTTP endpoints
  log "Checking API health..."
  if curl --fail --silent --show-error --retry 5 --retry-delay 2 --retry-connrefused \
    -o /dev/null http://127.0.0.1:3002/health; then
    log "✅ API health OK (http://127.0.0.1:3002/health)"
  else
    die "API health check failed"
  fi
  
  log "Checking WEB health..."
  if curl --fail --silent --show-error --retry 5 --retry-delay 2 --retry-connrefused \
    -o /dev/null http://127.0.0.1:8082/api/health; then
    log "✅ WEB health OK (http://127.0.0.1:8082/api/health)"
  else
    die "WEB health check failed"
  fi
  
  # Optional: Public health check (warning only)
  log "Checking public health (optional)..."
  if curl --fail --silent --show-error --max-time 5 \
    -o /dev/null https://cartie2.umanoff-analytics.space/api/health 2>/dev/null; then
    log "✅ Public health OK (https://cartie2.umanoff-analytics.space/api/health)"
  else
    warn "Public health check failed (DNS/SSL/firewall issue?)"
  fi
  
  log "✅ All health checks passed"
}

# ========================================
# STEP 7.1: Verify Asset Routing / Cache Safety
# ========================================
verify_asset_routing() {
  log "Verifying web asset routing (anti-stale)..."

  local index_html
  index_html="$(curl -fsS http://127.0.0.1:8082/)" || die "Failed to load web index page"

  local index_js
  index_js="$(printf "%s" "$index_html" | grep -o 'assets/index-[^\" ]*\.js' | head -n1 || true)"
  [ -n "$index_js" ] || die "Could not detect index asset from HTML"

  local index_headers
  index_headers="$(curl -sSI "http://127.0.0.1:8082/${index_js}")" || die "Failed to fetch index asset headers"
  echo "$index_headers" | grep -qi "content-type:.*javascript" || die "Index asset content-type is not javascript"

  # Missing assets must not fall back to index.html (should be 404)
  local missing_code
  missing_code="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:8082/assets/__missing_asset__.js")"
  if [ "$missing_code" = "200" ]; then
    die "Missing asset is returning 200 (SPA fallback misconfigured)"
  fi

  # Keep a rolling manifest of assets to ensure old hashed files are not served
  # from origin after deploy.
  local web_container="${PROJECT}-web-1"
  local current_assets
  current_assets="$(
    docker exec "$web_container" sh -lc 'ls -1 /srv/www/assets 2>/dev/null' \
      | sed 's#^#assets/#' \
      | sort -u \
      || true
  )"
  if [ -z "$current_assets" ]; then
    # Fallback parser from index if listing inside container is unavailable.
    current_assets="$(printf "%s" "$index_html" | grep -o 'assets/[A-Za-z0-9._-]*\.\(js\|css\)' | sort -u || true)"
  fi
  [ -n "$current_assets" ] || die "Could not parse current asset manifest from index"

  if [ -f "$ASSET_MANIFEST_FILE" ]; then
    while IFS= read -r old_asset; do
      [ -z "$old_asset" ] && continue
      if ! printf "%s\n" "$current_assets" | grep -Fx -- "$old_asset" >/dev/null; then
        local old_code
        old_code="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:8082/${old_asset}")"
        if [ "$old_code" = "200" ]; then
          die "Stale asset is still served from origin: /${old_asset}"
        fi

        # Best-effort public edge check: CDN may keep immutable files cached.
        local public_old_code
        public_old_code="$(curl -s -o /dev/null -w "%{http_code}" "https://cartie2.umanoff-analytics.space/${old_asset}" || true)"
        if [ "$public_old_code" = "200" ]; then
          warn "Public edge still serves stale asset /${old_asset} (likely CDN cache hit)"
        fi
      fi
    done < "$ASSET_MANIFEST_FILE"
  fi

  printf "%s\n" "$current_assets" > "$ASSET_MANIFEST_FILE"

  log "✅ Asset routing verified"
}

# ========================================
# STEP 7.25: Verify Running Build Metadata
# ========================================
verify_build_metadata() {
  log "Verifying running build metadata..."

  local api_container="${PROJECT}-api-1"
  local running_sha
  running_sha="$(docker exec "$api_container" sh -lc 'cat /app/server/BUILD_SHA 2>/dev/null || true' | tr -d '\r\n')"

  if [ -z "$running_sha" ]; then
    die "Running container has no /app/server/BUILD_SHA"
  fi

  if [ "$running_sha" != "$BUILD_SHA" ]; then
    die "Running BUILD_SHA ($running_sha) does not match expected ($BUILD_SHA)"
  fi

  # Verify health endpoint reports the same build SHA (no jq dependency).
  local health_sha
  local health_json
  health_json="$(curl -s http://127.0.0.1:3002/health)"
  health_sha="$(
    HEALTH_JSON="$health_json" node <<'NODE'
const raw = process.env.HEALTH_JSON || '';
try {
  const j = JSON.parse(raw);
  process.stdout.write(String(j.build?.buildSha || ''));
} catch (err) {
  process.stdout.write('');
}
NODE
  )"

  if [ "$health_sha" != "$BUILD_SHA" ]; then
    die "Health buildSha ($health_sha) does not match expected ($BUILD_SHA)"
  fi

  log "✅ Running build metadata verified"
}

# ========================================
# STEP 7.5: Telegram Smoke Check
# ========================================
telegram_smoke_check() {
  log "Running Telegram smoke check..."

  if [ -x "$REPO_DIR/infra/prod_verify.sh" ]; then
    bash "$REPO_DIR/infra/prod_verify.sh" \
      || die "Telegram smoke check failed"
    log "✅ Telegram smoke check passed"
  else
    warn "prod_verify.sh not found or not executable, skipping Telegram smoke check"
  fi
}

# ========================================
# STEP 8: Cleanup Docker Artifacts
# ========================================
cleanup_docker() {
  log "Cleaning up unused Docker images..."
  
  docker image prune -f --filter "label!=keep" || true
  
  log "✅ Docker cleanup complete"
}

# ========================================
# MAIN
# ========================================
main() {
  log "========================================="
  log "CARTIE PRODUCTION DEPLOYMENT"
  log "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  log "Project: $PROJECT"
  log "Branch: $BRANCH"
  log "SKIP_PULL: $SKIP_PULL"
  log "RUN_SEED: $RUN_SEED"
  log "Compose: $COMPOSE_FILE"
  log "Log: $LOG_FILE"
  log "========================================="
  
  preflight
  cleanup_and_restart
  pull_code
  build_images
  start_services
  run_migrations
  seed_data
  sync_bot_presets
  health_checks
  verify_asset_routing
  verify_build_metadata
  telegram_smoke_check
  cleanup_docker
  
  log "========================================="
  log "✅ DEPLOYMENT COMPLETE"
  log "========================================="
  log "Log saved to: $LOG_FILE"
  log ""
  log "Services:"
  log "  DB:  postgres://127.0.0.1:5433"
  log "  API: http://127.0.0.1:3002"
  log "  WEB: http://127.0.0.1:8082"
  log "  PROD: https://cartie2.umanoff-analytics.space"
  log ""
  log "Next steps:"
  log "  - Verify login: https://cartie2.umanoff-analytics.space/#/login"
  log "  - Check logs: docker logs ${PROJECT}-api-1 --tail 50"
  log "  - Monitor: docker ps --filter name=${PROJECT}"
}

main "$@"
