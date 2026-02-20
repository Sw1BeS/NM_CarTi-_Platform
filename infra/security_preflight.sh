#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"
RUN_SEED="${RUN_SEED:-1}"

while [ $# -gt 0 ]; do
  case "$1" in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --run-seed)
      RUN_SEED="$2"
      shift 2
      ;;
    *)
      echo "[SECURITY_PREFLIGHT] Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [ ! -f "$ENV_FILE" ]; then
  echo "[SECURITY_PREFLIGHT] ENV file not found: $ENV_FILE" >&2
  exit 1
fi

read_var() {
  local key="$1"
  if [ -n "${!key:-}" ]; then
    printf '%s' "${!key}"
    return
  fi

  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n1 || true)"
  line="${line#*=}"
  line="${line%$'\r'}"

  # trim surrounding quotes
  if [[ "$line" =~ ^\".*\"$ ]]; then
    line="${line:1:${#line}-2}"
  elif [[ "$line" =~ ^\'.*\'$ ]]; then
    line="${line:1:${#line}-2}"
  fi

  printf '%s' "$line"
}

fail() {
  echo "[SECURITY_PREFLIGHT] ERROR: $1" >&2
  exit 1
}

ensure_non_empty() {
  local key="$1"
  local value
  value="$(read_var "$key")"
  [ -n "$value" ] || fail "$key is required"
}

ensure_not_in() {
  local key="$1"
  local value="$2"
  shift 2
  local bad
  for bad in "$@"; do
    if [ "$value" = "$bad" ]; then
      fail "$key uses insecure default value '$bad'"
    fi
  done
}

JWT_SECRET="$(read_var JWT_SECRET)"
[ -n "$JWT_SECRET" ] || fail "JWT_SECRET is required"

if [ "${#JWT_SECRET}" -lt 32 ]; then
  fail "JWT_SECRET must be at least 32 characters"
fi
ensure_not_in JWT_SECRET "$JWT_SECRET" "dev_secret_key_123" "secret" "changeme" "jwt_secret" "password"

TELEGRAM_BOT_TOKEN="$(read_var TELEGRAM_BOT_TOKEN)"
TELEGRAM_WEBHOOK_SECRET="$(read_var TELEGRAM_WEBHOOK_SECRET)"
if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -z "$TELEGRAM_WEBHOOK_SECRET" ]; then
  fail "TELEGRAM_WEBHOOK_SECRET is required when TELEGRAM_BOT_TOKEN is configured"
fi

if [ "$RUN_SEED" = "1" ]; then
  ensure_non_empty SEED_ADMIN_PASSWORD
  ensure_non_empty SEED_SUPERADMIN_PASSWORD

  SEED_ADMIN_PASSWORD="$(read_var SEED_ADMIN_PASSWORD)"
  SEED_SUPERADMIN_PASSWORD="$(read_var SEED_SUPERADMIN_PASSWORD)"

  if [ "${#SEED_ADMIN_PASSWORD}" -lt 10 ]; then
    fail "SEED_ADMIN_PASSWORD must be at least 10 characters"
  fi
  if [ "${#SEED_SUPERADMIN_PASSWORD}" -lt 10 ]; then
    fail "SEED_SUPERADMIN_PASSWORD must be at least 10 characters"
  fi

  ensure_not_in SEED_ADMIN_PASSWORD "$SEED_ADMIN_PASSWORD" "admin" "password" "123456" "qwerty"
  ensure_not_in SEED_SUPERADMIN_PASSWORD "$SEED_SUPERADMIN_PASSWORD" "superadmin" "password" "123456" "qwerty"
fi

echo "[SECURITY_PREFLIGHT] OK"
