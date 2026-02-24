#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# CarTié Rollback Script (§10.3)
# Restores last known good commit + rebuilds + verifies
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT="${PROJECT:-infra2}"
COMPOSE_FILE="$REPO_DIR/infra/docker-compose.cartie2.prod.yml"
DEPLOY_DIR="$REPO_DIR/.deploy"
TS=$(date -u +%Y%m%d_%H%M%S)
ARTIFACT_DIR="$DEPLOY_DIR/$TS"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[ROLLBACK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()  { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

main() {
  log "CarTié Safe Rollback — $TS"
  mkdir -p "$ARTIFACT_DIR"

  local commit_file="$DEPLOY_DIR/last_success_commit"
  [ -f "$commit_file" ] || die "No last_success_commit found at $commit_file"

  local target_commit
  target_commit="$(cat "$commit_file")"
  [ -n "$target_commit" ] || die "last_success_commit is empty"

  local current_commit
  current_commit="$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
  log "Current commit:  $current_commit"
  log "Rolling back to: $target_commit"

  if [ "$current_commit" = "$target_commit" ]; then
    log "Already at target commit. Just rebuilding."
  fi

  # Checkout
  cd "$REPO_DIR"
  git checkout "$target_commit" -- . 2>/dev/null || git checkout "$target_commit" || die "git checkout failed"

  # Build
  BUILD_SHA="$target_commit" BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    docker compose -p "$PROJECT" -f "$COMPOSE_FILE" build api web \
    || die "docker build failed"

  # Rollout (no db restart, no migration rollback)
  BUILD_SHA="$target_commit" BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    docker compose -p "$PROJECT" -f "$COMPOSE_FILE" up -d --no-deps api web \
    || die "Rollout failed"

  # Health verify
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
    docker compose -p "$PROJECT" -f "$COMPOSE_FILE" logs --tail 100 api web > "$ARTIFACT_DIR/rollback_fail_logs.txt" 2>&1 || true
    die "Health check failed after rollback. Logs: $ARTIFACT_DIR/rollback_fail_logs.txt"
  fi

  echo "$target_commit" > "$ARTIFACT_DIR/rollback_commit.txt"
  echo "Rolled back from $current_commit to $target_commit" > "$ARTIFACT_DIR/rollback.log"

  log "============================================"
  log "✅ ROLLBACK COMPLETE"
  log "Commit:    $target_commit"
  log "Artifacts: $ARTIFACT_DIR"
  log "============================================"
  log ""
  log "⚠️  DB migrations were NOT rolled back (forward-only)."
  log "   If schema changes are incompatible, manual intervention required."
}

main "$@"
