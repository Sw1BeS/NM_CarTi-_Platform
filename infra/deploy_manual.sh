#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT="infra2"
COMPOSE_FILE="$REPO_DIR/infra/docker-compose.cartie2.prod.yml"

ts_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }
die() { echo "[DEPLOY] ERROR: $*" >&2; exit 2; }

main() {
  echo "[DEPLOY] ts=$(ts_utc)"
  echo "[DEPLOY] Manual Deployment (Skipping Git Checks)"
  echo "[DEPLOY] Project: $PROJECT"
  echo "[DEPLOY] Compose: $COMPOSE_FILE"

  cd "$REPO_DIR" || die "missing repo dir: $REPO_DIR"

  echo
  echo "[DEPLOY] Building containers..."
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" build api web

  echo
  echo "[DEPLOY] Starting services..."
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d

  echo
  echo "[DEPLOY] Waiting for health checks (15s)..."
  sleep 15

  echo "[DEPLOY] Status:"
  docker compose -p "$PROJECT" -f "$COMPOSE_FILE" ps

  echo
  echo "[DEPLOY] Verifying endpoints..."
  if curl -fsS -o /dev/null -w "API Local: %{http_code}\n" http://127.0.0.1:3002/health; then
      echo "✅ API Local (3002) is UP"
  else
      echo "❌ API Local (3002) failed"
  fi

  if curl -fsS -o /dev/null -w "WEB Local: %{http_code}\n" http://127.0.0.1:8082/api/health; then
      echo "✅ WEB Local (8082) is UP"
  else
      echo "❌ WEB Local (8082) failed (or Caddy mismatch)"
  fi
  
  echo "[DEPLOY] Complete."
}

main "$@"
