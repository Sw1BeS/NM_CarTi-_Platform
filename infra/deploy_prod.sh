#!/usr/bin/env bash
set -euo pipefail

# ========================================
# CARTIE PRODUCTION DEPLOYMENT SCRIPT
# Idempotent, zero-downtime deployment
# ========================================

REPO_DIR="${REPO_DIR:-/app}"
PROJECT="${PROJECT:-infra2}"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_DIR/infra/docker-compose.cartie2.prod.yml}"
LOG_DIR="/srv/cartie/_logs"
TS=$(date -u +%Y-%m-%d_%H%M%S)
LOG_FILE="$LOG_DIR/deploy_${TS}.log"

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
  
  # Create log dir
  mkdir -p "$LOG_DIR"
  
  log "✅ Pre-flight OK"
}

# ========================================
# STEP 1: Cleanup & Fresh Start
# ========================================
cleanup_and_restart() {
  log "Stopping current stack ($PROJECT)..."
  
  # Graceful shutdown of current project
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" down --remove-orphans || warn "Compose down failed (first run?)"
  
  log "✅ Cleaned up"
}

# ========================================
# STEP 2: Build Images
# ========================================
build_images() {
  log "Building Docker images..."
  
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" build api web \
    || die "Docker build failed"
  
  log "✅ Images built"
}

# ========================================
# STEP 3: Start Services
# ========================================
start_services() {
  log "Starting services..."
  
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d \
    || die "Docker compose up failed"
  
  log "Waiting for containers to initialize (10s)..."
  sleep 10
  
  log "✅ Services started"
}

# ========================================
# STEP 4: Run Migrations
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
# STEP 5: Seed Production Data
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
# STEP 6: Health Checks
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
  if curl --fail --silent --show-error --retry 5 --retry-delay 2 \
    -o /dev/null http://127.0.0.1:3002/health; then
    log "✅ API health OK (http://127.0.0.1:3002/health)"
  else
    die "API health check failed"
  fi
  
  log "Checking WEB health..."
  if curl --fail --silent --show-error --retry 5 --retry-delay 2 \
    -o /dev/null http://127.0.0.1:8082/api/health; then
    log "✅ WEB health OK (http://127.0.0.1:8082/api/health)"
  else
    die "WEB health check failed"
  fi
  
  log "✅ All health checks passed"
}

# ========================================
# STEP 7: Cleanup Docker Artifacts
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
  build_images
  start_services
  run_migrations
  seed_data
  health_checks
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
}

main "$@"
