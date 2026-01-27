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
LOG_DIR="/srv/cartie/_logs"
TS=$(date -u +%Y-%m-%d_%H%M%S)
LOG_FILE="$LOG_DIR/deploy_${TS}.log"
ALLOW_DIRTY="${ALLOW_DIRTY:-0}"

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
  if [ -n "$dirty" ]; then
    BUILD_SHA="${base_sha}-dirty"
  else
    BUILD_SHA="$base_sha"
  fi
  BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  export BUILD_SHA BUILD_TIME
  log "Build metadata: sha=$BUILD_SHA time=$BUILD_TIME"
  
  # Create log dir
  mkdir -p "$LOG_DIR"
  
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
  log "Pulling latest code..."
  
  if git remote get-url origin &>/dev/null; then
    log "Fetching origin/main..."
    git fetch origin main || warn "Git fetch failed (offline?)"
    
    log "Merging origin/main (fast-forward only)..."
    git merge --ff-only origin/main || warn "Cannot fast-forward (manual merge needed?)"
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
# STEP 4: Start Services
# ========================================
start_services() {
  log "Starting services (Rolling Update)..."
  
  BUILD_SHA="$BUILD_SHA" BUILD_TIME="$BUILD_TIME" \
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d --build --remove-orphans \
    || die "Docker compose up failed"
  
  log "Waiting for containers to initialize (10s)..."
  sleep 10
  
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
  log "Seeding production data..."
  
  local api_container="${PROJECT}-api-1"
  
  # Run seed (idempotent - upserts only)
  docker exec "$api_container" npm run seed \
    || warn "Seed failed (might be OK if data already exists)"
  
  log "✅ Seed complete"
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
  health_checks
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
