#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/cartie/apps/cartie2_repo}"
PROJECT="${PROJECT:-infra2}"
BRANCH="${BRANCH:-main}"

# Use label-derived compose if available; fallback to repo prod compose
COMPOSE_FALLBACK="${COMPOSE_FALLBACK:-/srv/cartie/apps/cartie2_repo/infra/docker-compose.cartie2.prod.yml}"

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
    echo "[DEPLOY] up -d --force-recreate --remove-orphans"
    docker compose -p "$PROJECT" -f "$compose" up -d --force-recreate --remove-orphans

    echo
    echo "[DEPLOY] prune builds"
    docker image prune -f --filter "label!=keep"

    echo
    echo "[DEPLOY] Detailed Health Verification"

    # Verify Containers
    for service in "web" "api" "db"; do
      container_name="${PROJECT}-${service}-1"
      if [ "$(docker inspect -f '{{.State.Status}}' "$container_name" 2>/dev/null)" != "running" ]; then
        echo "❌ Container $container_name is NOT running!"
        docker logs "$container_name" --tail 10
        exit 1
      else
        echo "✅ Container $container_name is running."
      fi
    done

    # Verify Endpoints
    echo "[DEPLOY] Checking HTTP Endpoints..."
    if curl -fsS --retry 5 --retry-delay 2 --retry-connrefused -o /dev/null "http://127.0.0.1:3002/health"; then
        echo "✅ API Internal Health (3002) OK"
    else
        echo "❌ API Internal Health Failed"
        exit 1
    fi

    if curl -fsS --retry 5 --retry-delay 2 --retry-connrefused -o /dev/null "http://127.0.0.1:8082/api/health"; then
         echo "✅ WEB Proxy Health (8082) OK"
    else
         echo "❌ WEB Proxy Health Failed"
         exit 1
    fi
     
    # Optional: Public check (warning only)
    curl -fsS -o /dev/null -w "PUBLIC /api/health => %{http_code}\n" https://cartie2.umanoff-analytics.space/api/health || echo "⚠️ Public health check failed (DNS/SSL issue?)"

    echo
    echo "[DEPLOY] OK"
  } | tee -a "$log"

  echo "[DEPLOY] log => $log"
}

main "$@"
