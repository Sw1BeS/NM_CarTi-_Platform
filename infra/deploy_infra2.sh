#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/cartie/apps/cartie2_repo}"
PROJECT="${PROJECT:-infra2}"
BRANCH="${BRANCH:-main}"

# Use label-derived compose if available; fallback to prod symlink path
COMPOSE_FALLBACK="${COMPOSE_FALLBACK:-/srv/cartie/infra/docker-compose.cartie2.prod.yml}"

ts_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }
die() { echo "[DEPLOY] ERROR: $*" >&2; exit 2; }

compose_from_labels() {
  local cid
  cid="$(docker ps -q --filter "name=${PROJECT}-web-1" | head -n1 || true)"
  if [ -n "${cid:-}" ]; then
    docker inspect "$cid" --format '{{ index .Config.Labels "com.docker.compose.project.config_files" }}' 2>/dev/null || true
  fi
}

main() {
  local compose log
  compose="$(compose_from_labels || true)"
  if [ -z "${compose:-}" ]; then
    compose="$COMPOSE_FALLBACK"
  fi
  [ -f "$compose" ] || die "COMPOSE file not found: $compose"

  mkdir -p /srv/cartie/_logs
  log="/srv/cartie/_logs/infra2_deploy_$(date -u +%Y-%m-%d_%H%M%S).log"

  {
    echo "[DEPLOY] ts=$(ts_utc)"
    echo "[DEPLOY] repo=$REPO_DIR branch=$BRANCH project=$PROJECT"
    echo "[DEPLOY] compose=$compose"
    echo

    cd "$REPO_DIR" || die "missing repo dir: $REPO_DIR"

    if [ -n "$(git status --porcelain || true)" ]; then
      die "repo has uncommitted changes (git status not clean). abort."
    fi

    echo "[DEPLOY] git fetch origin $BRANCH"
    git fetch origin "$BRANCH"

    echo "[DEPLOY] ff-only merge origin/$BRANCH"
    git merge --ff-only "origin/$BRANCH"

    echo
    echo "[DEPLOY] compose config -q"
    docker compose -p "$PROJECT" -f "$compose" config -q

    echo
    echo "[DEPLOY] build api+web"
    docker compose -p "$PROJECT" -f "$compose" build api web

    echo
    echo "[DEPLOY] up -d"
    docker compose -p "$PROJECT" -f "$compose" up -d

    echo
    echo "[DEPLOY] ps"
    docker compose -p "$PROJECT" -f "$compose" ps

    echo
    echo "[DEPLOY] health checks"
    curl -fsS -o /dev/null -w "API 127.0.0.1:3002/health => %{http_code}\n" http://127.0.0.1:3002/health
    curl -fsS -o /dev/null -w "WEB 127.0.0.1:8082/api/health => %{http_code}\n" http://127.0.0.1:8082/api/health
    curl -fsS -o /dev/null -w "PUBLIC /api/health => %{http_code}\n" https://cartie2.umanoff-analytics.space/api/health

    echo
    echo "[DEPLOY] OK"
  } | tee -a "$log"

  echo "[DEPLOY] log => $log"
}

main "$@"
