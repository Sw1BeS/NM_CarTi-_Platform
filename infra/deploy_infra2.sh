#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"

# Canonical deployment path: delegate to deploy_prod.sh to avoid script drift.
BRANCH="${BRANCH:-main}"
ALLOW_DIRTY="${ALLOW_DIRTY:-0}"
SKIP_PULL="${SKIP_PULL:-0}"
RUN_SEED="${RUN_SEED:-1}"

echo "[DEPLOY] delegating to infra/deploy_prod.sh (branch=$BRANCH, skip_pull=$SKIP_PULL, run_seed=$RUN_SEED)"

exec env \
  REPO_DIR="$REPO_DIR" \
  BRANCH="$BRANCH" \
  ALLOW_DIRTY="$ALLOW_DIRTY" \
  SKIP_PULL="$SKIP_PULL" \
  RUN_SEED="$RUN_SEED" \
  bash "$SCRIPT_DIR/deploy_prod.sh"
