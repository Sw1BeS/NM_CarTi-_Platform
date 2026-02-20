#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:3002}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
ENABLE_WRITE="${ENABLE_WRITE:-0}"

PASSED=0
FAILED=0
SKIPPED=0

check() {
  local name="$1"
  local method="$2"
  local endpoint="$3"
  local expected_codes="$4"
  local body="${5:-}"
  local needs_auth="${6:-false}"

  if [ "$needs_auth" = "true" ] && [ -z "$AUTH_TOKEN" ]; then
    echo "SKIP  $name (no AUTH_TOKEN)"
    SKIPPED=$((SKIPPED + 1))
    return
  fi

  local headers=(-H "Content-Type: application/json")
  if [ "$needs_auth" = "true" ]; then
    headers+=(-H "Authorization: Bearer ${AUTH_TOKEN}")
  fi

  local status
  if [ "$method" = "GET" ]; then
    status=$(curl -sS -o /dev/null -w "%{http_code}" -X "$method" "$API_URL$endpoint" "${headers[@]}" || echo "000")
  else
    status=$(curl -sS -o /dev/null -w "%{http_code}" -X "$method" "$API_URL$endpoint" "${headers[@]}" -d "$body" || echo "000")
  fi

  if [[ " $expected_codes " == *" $status "* ]]; then
    echo "PASS  $name -> $status"
    PASSED=$((PASSED + 1))
    return
  fi

  echo "FAIL  $name -> $status (expected: $expected_codes)"
  FAILED=$((FAILED + 1))
}

echo "🔍 Cartie Deployment Verification"
echo "API_URL=$API_URL"
if [ -n "$AUTH_TOKEN" ]; then
  echo "Auth mode: token provided"
else
  echo "Auth mode: no token (protected checks will be skipped)"
fi
if [ "$ENABLE_WRITE" = "1" ]; then
  echo "Write checks: enabled"
else
  echo "Write checks: disabled (set ENABLE_WRITE=1 to enable)"
fi

check "health" GET "/health" "200"
check "api-health" GET "/api/health" "200"
check "public-settings" GET "/api/system/settings/public" "200"
check "public-bots" GET "/api/public/bots" "200"
check "public-requests" GET "/api/public/requests?limit=1" "200"

check "inventory-read" GET "/api/inventory?page=1&limit=1" "200" "" true
check "requests-read" GET "/api/requests?limit=1" "200" "" true
check "scenarios-read" GET "/api/scenarios" "200" "" true
check "bots-read" GET "/api/bots" "200" "" true
check "integrations-read" GET "/api/integrations" "200" "" true

if [ "$ENABLE_WRITE" = "1" ]; then
  check "public-lead-validation" POST "/api/public/leads" "400" "{}"
  check "messages-log-validation" POST "/api/messages/logs" "400" "{}" true
fi

echo "--- Summary: PASS=$PASSED FAIL=$FAILED SKIP=$SKIPPED ---"
if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
