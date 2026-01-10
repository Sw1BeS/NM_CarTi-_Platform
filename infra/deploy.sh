#!/usr/bin/env bash
set -euo pipefail
git config --global --add safe.directory /srv/cartie/repo >/dev/null 2>&1 || true

REPO_DIR="${REPO_DIR:-/srv/cartie/repo}"
COMPOSE_FILE="${COMPOSE_FILE:-infra/docker-compose.prod.yml}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:3001/health}"
WEB_HEALTH_URL="${WEB_HEALTH_URL:-http://127.0.0.1:8080/health}"

say(){ echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

cd "$REPO_DIR" || { echo "ERR: no REPO_DIR=$REPO_DIR"; exit 1; }
say "PWD=$(pwd)"; ls -la >/dev/null

say "git fetch/reset to origin/main"
git fetch origin
git checkout main
git reset --hard origin/main

say "validate compose"
docker compose -f "$COMPOSE_FILE" config -q

say "build+recreate api+web"
docker compose -f "$COMPOSE_FILE" up -d --build --force-recreate api web

say "wait api health (max 60s): $API_HEALTH_URL"
for i in $(seq 1 60); do
  if curl -fsS "$API_HEALTH_URL" >/dev/null 2>&1; then
    say "OK api up on try=$i"
    break
  fi
  sleep 1
done
curl -fsS "$API_HEALTH_URL" >/dev/null 2>&1 || { say "ERR api health failed"; docker logs --tail 200 infra-api-1 || true; exit 1; }

say "wait web health (max 60s): $WEB_HEALTH_URL"
for i in $(seq 1 60); do
  if curl -fsS "$WEB_HEALTH_URL" >/dev/null 2>&1; then
    say "OK web up on try=$i"
    break
  fi
  sleep 1
done
curl -fsS "$WEB_HEALTH_URL" >/dev/null 2>&1 || { say "ERR web health failed"; docker logs --tail 200 infra-web-1 || true; exit 1; }

say "final checks"
curl -fsS "$API_HEALTH_URL"; echo
curl -fsS "$WEB_HEALTH_URL"; echo

say "restarts"
docker inspect infra-api-1 --format "api: Status={{.State.Status}} Restarts={{.RestartCount}}"
docker inspect infra-web-1 --format "web: Status={{.State.Status}} Restarts={{.RestartCount}}"
