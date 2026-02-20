#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:3002}"
WEB_BASE_URL="${WEB_BASE_URL:-http://127.0.0.1:8082}"
PUBLIC_SLUG="${PUBLIC_SLUG:-system}"

PASSED=0
FAILED=0

status_check() {
  local label="$1"
  local url="$2"
  local expected="$3"

  local status
  status=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "$url" || echo "000")

  if [[ " $expected " == *" $status "* ]]; then
    echo "PASS  $label -> $status ($url)"
    PASSED=$((PASSED + 1))
    return
  fi

  echo "FAIL  $label -> $status ($url), expected: $expected"
  FAILED=$((FAILED + 1))
}

echo "--- Cartie Basic Smoke ---"
echo "API_BASE_URL=$API_BASE_URL"
echo "WEB_BASE_URL=$WEB_BASE_URL"
echo "PUBLIC_SLUG=$PUBLIC_SLUG"

status_check "api-health" "$API_BASE_URL/health" "200"
status_check "miniapp-config" "$API_BASE_URL/api/miniapp/config?slug=$PUBLIC_SLUG" "200"
status_check "showcase-inventory" "$API_BASE_URL/api/showcase/public/$PUBLIC_SLUG/inventory" "200"
status_check "web-root" "$WEB_BASE_URL/" "200 301 302 304"

# Protected endpoint without token should be denied (auth expected).
status_check "protected-auth-required" "$API_BASE_URL/api/requests" "401 403"

echo "--- Summary: PASS=$PASSED FAIL=$FAILED ---"
if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
