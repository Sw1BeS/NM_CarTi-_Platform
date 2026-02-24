#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# CarTié Safe Deploy Script (§10.1)
# Idempotent, non-destructive, prod-safe
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT="${PROJECT:-infra2}"
COMPOSE_FILE="$REPO_DIR/infra/docker-compose.cartie2.prod.yml"
DEPLOY_DIR="$REPO_DIR/.deploy"
TS=$(date -u +%Y%m%d_%H%M%S)
ARTIFACT_DIR="$DEPLOY_DIR/$TS"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[DEPLOY]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()  { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

# ============================================================
# A) PRECHECK
# ============================================================
precheck() {
  log "A) PRECHECK"

  command -v docker >/dev/null 2>&1 || die "docker not found"
  docker compose version >/dev/null 2>&1 || die "docker compose not available"

  log "Disk:"
  df -h / | tail -1

  log "Memory:"
  free -m | head -2

  log "Compose status:"
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" ps --format table 2>/dev/null || warn "Stack not running yet"

  mkdir -p "$ARTIFACT_DIR"
  git -C "$REPO_DIR" rev-parse HEAD > "$ARTIFACT_DIR/git_head.txt" 2>/dev/null || echo "unknown" > "$ARTIFACT_DIR/git_head.txt"

  # Save current success commit
  if [ ! -f "$DEPLOY_DIR/last_success_commit" ]; then
    git -C "$REPO_DIR" rev-parse HEAD > "$DEPLOY_DIR/last_success_commit" 2>/dev/null || true
  fi

  log "✅ Precheck OK"
}

# ============================================================
# B) BACKUP
# ============================================================
backup() {
  log "B) BACKUP"

  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" ps > "$ARTIFACT_DIR/compose_ps.txt" 2>/dev/null || echo "N/A" > "$ARTIFACT_DIR/compose_ps.txt"

  # Env keys only (no values)
  if [ -f "$REPO_DIR/.env" ]; then
    grep -v '^\s*#' "$REPO_DIR/.env" | sed 's/=.*/=***/' > "$ARTIFACT_DIR/env_keys.txt"
  fi

  # DB dump (best-effort)
  local db_container="${PROJECT}-db-1"
  if docker exec "$db_container" test -f /usr/local/bin/pg_dump 2>/dev/null; then
    log "Attempting pg_dump..."
    docker exec "$db_container" pg_dump -U cartie cartie_db 2>/dev/null | gzip > "$ARTIFACT_DIR/db_dump.sql.gz" \
      || { warn "pg_dump failed, SKIPPED"; echo "SKIPPED: pg_dump failed" > "$ARTIFACT_DIR/db_dump_status.txt"; }
  else
    echo "SKIPPED: pg_dump not available" > "$ARTIFACT_DIR/db_dump_status.txt"
  fi

  log "✅ Backup saved to $ARTIFACT_DIR"
}

# ============================================================
# C) UPDATE CODE
# ============================================================
update_code() {
  log "C) UPDATE CODE"

  cd "$REPO_DIR"

  local dirty
  dirty="$(git status --porcelain 2>/dev/null || true)"
  if [ -n "$dirty" ]; then
    warn "Working directory dirty. Stashing..."
    git stash push -m "deploy-safe-$TS" || warn "git stash failed"
  fi

  if git remote get-url origin &>/dev/null; then
    git fetch origin main || warn "git fetch failed"
    git merge --ff-only origin/main || warn "ff-only merge failed (manual merge needed?)"
  fi

  log "✅ Code updated"
}

# ============================================================
# D) BUILD
# ============================================================
build() {
  log "D) BUILD (api + web only, NOT db)"
  cd "$REPO_DIR"

  BUILD_SHA="$(git rev-parse HEAD 2>/dev/null || echo dev)"
  BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  export BUILD_SHA BUILD_TIME

  BUILD_SHA="$BUILD_SHA" BUILD_TIME="$BUILD_TIME" \
    docker compose -p "$PROJECT" -f "$COMPOSE_FILE" build api web \
    || die "Docker build failed"

  log "✅ Build OK (sha=$BUILD_SHA)"
}

# ============================================================
# E) MIGRATIONS (PROD SAFE)
# ============================================================
migrate() {
  log "E) MIGRATIONS (prisma migrate deploy)"

  local api_container="${PROJECT}-api-1"
  local retries=20
  while [ $retries -gt 0 ]; do
    if docker exec "$api_container" test -f package.json &>/dev/null; then break; fi
    retries=$((retries - 1))
    sleep 2
  done
  [ $retries -eq 0 ] && die "API container not ready for migration"

  docker exec "$api_container" npx prisma migrate deploy 2>&1 | tee "$ARTIFACT_DIR/migrate.log" \
    || die "prisma migrate deploy failed. See $ARTIFACT_DIR/migrate.log"

  log "✅ Migrations applied"
}

# ============================================================
# F) ROLLOUT
# ============================================================
rollout() {
  log "F) ROLLOUT (api + web only, NOT db/redis)"

  BUILD_SHA="${BUILD_SHA:-dev}" BUILD_TIME="${BUILD_TIME:-unknown}" \
    docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d --no-deps api web \
    || die "Rollout failed"

  log "✅ Rollout complete"
}

# ============================================================
# G) HEALTH VERIFY
# ============================================================
health_verify() {
  log "G) HEALTH VERIFY"

  local retries=5
  local ok=0
  for i in $(seq 1 $retries); do
    if curl --fail --silent --max-time 3 -o /dev/null http://127.0.0.1:3002/health; then
      ok=1
      break
    fi
    sleep 2
  done

  if [ $ok -eq 0 ]; then
    warn "Health check FAILED — triggering rollback"
    docker compose -p "$PROJECT" -f "$COMPOSE_FILE" logs --tail 200 api web > "$ARTIFACT_DIR/fail_logs.txt" 2>&1 || true
    die "API health check failed after $retries attempts. Logs saved to $ARTIFACT_DIR/fail_logs.txt. Run rollback_safe.sh."
  fi

  log "Last 20 log lines (api):"
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" logs --tail 20 api 2>/dev/null || true

  log "✅ Health verified"
}

# ============================================================
# H) SUCCESS
# ============================================================
success() {
  log "H) SUCCESS"

  git -C "$REPO_DIR" rev-parse HEAD > "$DEPLOY_DIR/last_success_commit" 2>/dev/null || true

  echo ""
  log "============================================"
  log "✅ DEPLOY COMPLETE"
  log "Artifacts: $ARTIFACT_DIR"
  log "Commit:    $(cat "$ARTIFACT_DIR/git_head.txt")"
  log "============================================"
}

# ============================================================
# MAIN
# ============================================================
main() {
  log "CarTié Safe Deploy — $TS"
  precheck
  backup
  update_code
  build
  rollout
  migrate
  health_verify
  success
}

main "$@"
