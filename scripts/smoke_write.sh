#!/usr/bin/env bash
set -euo pipefail

if [ "${ENABLE_WRITE:-}" != "1" ]; then
  echo "ENABLE_WRITE=1 is required to run write smoke tests."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_PORT="3001"

if [ -z "${BASE_URL:-}" ]; then
  if [ -f "$ROOT_DIR/.env" ]; then
    PORT_LINE=$(grep -E '^PORT=' "$ROOT_DIR/.env" | tail -n1 || true)
    if [ -n "$PORT_LINE" ]; then
      DEFAULT_PORT="${PORT_LINE#PORT=}"
    fi
  fi
  BASE_URL="http://127.0.0.1:${DEFAULT_PORT}"
fi

if ! echo "$BASE_URL" | grep -Eq '^https?://(127\.0\.0\.1|localhost)'; then
  if [ "${ALLOW_PROD:-}" != "1" ]; then
    echo "Refusing to run against non-local BASE_URL: $BASE_URL"
    echo "Set ALLOW_PROD=1 to override if you really want this."
    exit 1
  fi
fi

AUTH_TOKEN="${AUTH_TOKEN:-}"

PASSED=0
FAILED=0

TMP_BODY="/tmp/smoke_write_body.$$"
trap 'rm -f "$TMP_BODY"' EXIT

post() {
  local path="$1"
  local label="$2"
  local data="$3"

  local url="${BASE_URL}${path}"
  local headers=("-H" "Content-Type: application/json")
  if [ -n "$AUTH_TOKEN" ]; then
    headers+=("-H" "Authorization: Bearer ${AUTH_TOKEN}")
  fi

  local status
  status=$(curl -s -o "$TMP_BODY" -w "%{http_code}" -X POST "$url" "${headers[@]}" -d "$data" || echo "000")

  if [ "$status" = "200" ] || [ "$status" = "201" ]; then
    echo "PASS  $label (POST $path) -> $status"
    PASSED=$((PASSED + 1))
    return
  fi

  echo "FAIL  $label (POST $path) -> $status"
  FAILED=$((FAILED + 1))
}

echo "Smoke Write (DEV ONLY)"
echo "Base URL: $BASE_URL"

post "/api/public/leads" "public lead" '{"clientName":"Smoke Test Lead","phone":"+10000000000","source":"smoke"}'
post "/api/public/requests" "public request" '{"title":"Smoke Test Request","budgetMax":12345,"city":"Test City"}'

echo "Summary: PASS=$PASSED FAIL=$FAILED"
if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
