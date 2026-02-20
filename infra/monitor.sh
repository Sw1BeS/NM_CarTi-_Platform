#!/usr/bin/env bash
set -euo pipefail

PROJECT="${PROJECT:-infra2}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker-compose.cartie2.prod.yml}"
LOG_FILE="${LOG_FILE:-$ROOT_DIR/_logs/monitor.log}"
STATE_DIR="${STATE_DIR:-/tmp/cartie-monitor-state}"
LOCK_FILE="${LOCK_FILE:-/tmp/cartie-monitor.lock}"
COOLDOWN_SEC="${COOLDOWN_SEC:-120}"
HEALTH_RETRIES="${HEALTH_RETRIES:-12}"
HEALTH_SLEEP_SEC="${HEALTH_SLEEP_SEC:-5}"

SERVICES=("web" "api" "db")

mkdir -p "$(dirname "$LOG_FILE")" "$STATE_DIR"

ts() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log() { echo "[$(ts)] $*" | tee -a "$LOG_FILE"; }

with_lock() {
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$LOCK_FILE"
    flock -n 9 || {
      log "monitor already running, skip this cycle"
      exit 0
    }
  fi
}

container_name() {
  local service="$1"
  echo "${PROJECT}-${service}-1"
}

container_state() {
  local container="$1"
  docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null || echo "missing"
}

last_restart_file() {
  local service="$1"
  echo "${STATE_DIR}/${service}.last_restart"
}

can_restart() {
  local service="$1"
  local now
  now="$(date +%s)"
  local state_file
  state_file="$(last_restart_file "$service")"

  if [ ! -f "$state_file" ]; then
    return 0
  fi

  local last
  last="$(cat "$state_file" 2>/dev/null || echo 0)"
  local diff=$(( now - last ))
  if [ "$diff" -lt "$COOLDOWN_SEC" ]; then
    log "restart cooldown active for ${service}: ${diff}s < ${COOLDOWN_SEC}s"
    return 1
  fi

  return 0
}

mark_restart() {
  local service="$1"
  date +%s > "$(last_restart_file "$service")"
}

wait_running() {
  local service="$1"
  local container
  container="$(container_name "$service")"

  local retries="$HEALTH_RETRIES"
  while [ "$retries" -gt 0 ]; do
    local state
    state="$(container_state "$container")"
    if [ "$state" = "running" ]; then
      return 0
    fi
    retries=$((retries - 1))
    sleep "$HEALTH_SLEEP_SEC"
  done

  return 1
}

restart_service() {
  local service="$1"
  if ! can_restart "$service"; then
    return 1
  fi

  log "attempting restart for service=${service}"
  (
    cd "$ROOT_DIR"
    docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d --no-deps "$service"
  ) >> "$LOG_FILE" 2>&1 || {
    log "restart command failed for service=${service}"
    return 1
  }

  mark_restart "$service"

  if wait_running "$service"; then
    log "restart succeeded for service=${service}"
    return 0
  fi

  log "service did not become running after restart: service=${service}"
  return 1
}

main() {
  with_lock

  for service in "${SERVICES[@]}"; do
    local_container="$(container_name "$service")"
    state="$(container_state "$local_container")"

    if [ "$state" = "running" ]; then
      continue
    fi

    log "detected unhealthy container: ${local_container} state=${state}"
    restart_service "$service" || true
  done
}

main "$@"
