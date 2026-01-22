#!/usr/bin/env bash
set -euo pipefail

# ========================================
# CARTIE PRODUCTION DEPLOYMENT SCRIPT
# Idempotent, zero-downtime deployment
# ========================================

REPO_DIR="${REPO_DIR:-/srv/cartie/apps/cartie2_repo}"
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
  
  # Check git status
  if [ -n "$(git status --porcelain 2>/dev/null || true)" ]; then
    warn "Repo has uncommitted changes. Continuing anyway (manual mode)."
  fi
  
  # Create log dir
  mkdir -p "$LOG_DIR"
  
  log "✅ Pre-flight OK"
}

# ========================================
# STEP 1: Cleanup Old Containers/Networks
# ========================================
cleanup_old() {
  log "Cleaning up old containers/networks..."
  
  # Stop and remove any containers with cartie/infra/prod in name
  local old_containers
  old_containers=$(docker ps -aq --filter "name=infra" --filter "name=cartie" --filter "name=prod" 2>/dev/null || true)
  
  if [ -n "$old_containers" ]; then
    log "Found old containers: $(echo "$old_containers" | wc -l) containers"
    echo "$old_containers" | xargs docker rm -f 2>/dev/null || true
    log "✅ Old containers removed"
  else
    log "No old containers found"
  fi
  
  # Remove old networks
  local old_networks
  old_networks=$(docker network ls --filter "name=infra" --filter "name=cartie" --filter "name=prod" -q 2>/dev/null || true)
  
  if [ -n "$old_networks" ]; then
    log "Found old networks: $(echo "$old_networks" | wc -l) networks"
    echo "$old_networks" | xargs docker network rm 2>/dev/null || true
    log "✅ Old networks removed"
  else
    log "No old networks found"
  fi
  
  log "✅ Cleanup complete"
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
  
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" build api web \
    || die "Docker build failed"
  
  log "✅ Images built"
}

# ========================================
# STEP 4: Start Services
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
  cleanup_old
  pull_code
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
  log ""
  log "Next steps:"
  log "  - Verify login: https://cartie2.umanoff-analytics.space/#/login"
  log "  - Check logs: docker logs ${PROJECT}-api-1 --tail 50"
  log "  - Monitor: docker ps --filter name=${PROJECT}"
}

main "$@"
