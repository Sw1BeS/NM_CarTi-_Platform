#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"

# Manual mode keeps local checkout state and skips git pull checks.
ALLOW_DIRTY="${ALLOW_DIRTY:-1}"
SKIP_PULL="${SKIP_PULL:-1}"
RUN_SEED="${RUN_SEED:-1}"
BRANCH="${BRANCH:-main}"

echo "[DEPLOY] manual mode -> infra/deploy_prod.sh (allow_dirty=$ALLOW_DIRTY, skip_pull=$SKIP_PULL, run_seed=$RUN_SEED)"

exec env \
  REPO_DIR="$REPO_DIR" \
  BRANCH="$BRANCH" \
  ALLOW_DIRTY="$ALLOW_DIRTY" \
  SKIP_PULL="$SKIP_PULL" \
  RUN_SEED="$RUN_SEED" \
  bash "$SCRIPT_DIR/deploy_prod.sh"
