#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT="infra2"
COMPOSE_FILE="$REPO_DIR/infra/docker-compose.cartie2.prod.yml"

ts_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }
die() { echo "[DEPLOY] ERROR: $*" >&2; exit 2; }

main() {
  local build_sha build_time running_sha

  echo "[DEPLOY] ts=$(ts_utc)"
  echo "[DEPLOY] Manual Deployment (Skipping Git Checks)"
  echo "[DEPLOY] Project: $PROJECT"
  echo "[DEPLOY] Compose: $COMPOSE_FILE"

  cd "$REPO_DIR" || die "missing repo dir: $REPO_DIR"

  build_sha="$(git rev-parse HEAD 2>/dev/null || echo dev)"
  build_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  export BUILD_SHA="$build_sha" BUILD_TIME="$build_time"
  echo "[DEPLOY] build_sha=$BUILD_SHA"
  echo "[DEPLOY] build_time=$BUILD_TIME"

  echo
  echo "[DEPLOY] Building containers..."
  BUILD_SHA="$BUILD_SHA" BUILD_TIME="$BUILD_TIME" \
    docker compose -p "$PROJECT" -f "$COMPOSE_FILE" build api web

  echo
  echo "[DEPLOY] Starting services..."
  BUILD_SHA="$BUILD_SHA" BUILD_TIME="$BUILD_TIME" \
    docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d --remove-orphans

  echo
  echo "[DEPLOY] Running migrations..."
  docker exec "${PROJECT}-api-1" npm run prisma:migrate

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

  running_sha="$(docker exec "${PROJECT}-api-1" sh -lc 'cat /app/server/BUILD_SHA 2>/dev/null || true' | tr -d '\r\n')"
  if [ "$running_sha" = "$BUILD_SHA" ]; then
      echo "✅ BUILD_SHA verified in running container"
  else
      echo "❌ BUILD_SHA mismatch: expected=$BUILD_SHA actual=${running_sha:-<empty>}"
      exit 1
  fi
  
  echo "[DEPLOY] Complete."
}

main "$@"
