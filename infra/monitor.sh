#!/usr/bin/env bash
# infra/monitor.sh
set -uo pipefail

# Configuration
PROJECT="infra2"
SERVICES=("infra2-web-1" "infra2-api-1" "infra2-db-1")
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker-compose.cartie2.prod.yml}"
LOG_FILE="${LOG_FILE:-$ROOT_DIR/_logs/monitor.log}"

# Ensure log dir exists
mkdir -p "$(dirname "$LOG_FILE")"

ts() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

log() {
  echo "[$(ts)] $*" | tee -a "$LOG_FILE"
}

check_container() {
  local container_name="$1"
  if [ "$(docker inspect -f '{{.State.Status}}' "$container_name" 2>/dev/null)" != "running" ]; then
    log "🚨 ALERT: Container $container_name is DOWN or MISSING."
    return 1
  fi
  return 0
}

restart_service() {
  local container_name="$1"
  # derived service name from container name (e.g., infra2-web-1 -> web)
  # using naive mapping or hardcoded logic
  local service_name=""
  if [[ "$container_name" == *"web"* ]]; then service_name="web"; fi
  if [[ "$container_name" == *"api"* ]]; then service_name="api"; fi
  if [[ "$container_name" == *"db"* ]]; then service_name="db"; fi

  if [ -n "$service_name" ]; then
    log "🛠️ Attempting to restart service: $service_name"
    cd "$ROOT_DIR" || exit 1
    # Using 'up -d' is idempotent and safe; it will recreate if missing
    docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d "$service_name" >> "$LOG_FILE" 2>&1
    
    if [ $? -eq 0 ]; then
        log "✅ Restart command sent successfully for $service_name."
    else
        log "❌ Failed to restart $service_name."
    fi
  else
    log "⚠️ Component name $container_name not recognized for restart logic."
  fi
}

main() {
  for container in "${SERVICES[@]}"; do
    if ! check_container "$container"; then
      restart_service "$container"
    fi
  done
}

main
