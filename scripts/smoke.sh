#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:3002}"
AUTH_TOKEN="${AUTH_TOKEN:-}"

PASSED=0
FAILED=0
SKIPPED=0

request() {
  local method="$1"
  local path="$2"
  local label="$3"
  local expected_codes="$4"
  local body="${5:-}"
  local needs_auth="${6:-false}"

  if [ "$needs_auth" = "true" ] && [ -z "$AUTH_TOKEN" ]; then
    echo "SKIP  $label (no AUTH_TOKEN)"
    SKIPPED=$((SKIPPED + 1))
    return
  fi

  local url="${API_BASE_URL}${path}"
  local headers=(-H "Content-Type: application/json")
  if [ "$needs_auth" = "true" ]; then
    headers+=(-H "Authorization: Bearer ${AUTH_TOKEN}")
  fi

  local status
  if [ "$method" = "GET" ]; then
    status=$(curl -sS -o /dev/null -w "%{http_code}" -X "$method" "$url" "${headers[@]}" || echo "000")
  else
    status=$(curl -sS -o /dev/null -w "%{http_code}" -X "$method" "$url" "${headers[@]}" -d "$body" || echo "000")
  fi

  if [[ " $expected_codes " == *" $status "* ]]; then
    echo "PASS  $label -> $status"
    PASSED=$((PASSED + 1))
    return
  fi

  echo "FAIL  $label -> $status (expected: $expected_codes)"
  FAILED=$((FAILED + 1))
}

echo "🔥 Cartie Smoke"
echo "API_BASE_URL=$API_BASE_URL"
if [ -n "$AUTH_TOKEN" ]; then
  echo "Mode: authenticated"
else
  echo "Mode: unauthenticated (protected routes are validated in auth-required mode)"
fi

request GET "/health" "health" "200"
request GET "/api/system/settings/public" "public-settings" "200"
request GET "/api/public/bots" "public-bots" "200"
request GET "/api/public/requests?limit=1" "public-requests" "200"
request POST "/api/public/leads" "public-lead-validation" "400 401" "{}"

if [ -n "$AUTH_TOKEN" ]; then
  request GET "/api/bots" "bots" "200" "" true
  request GET "/api/scenarios" "scenarios" "200" "" true
  request GET "/api/leads" "leads" "200" "" true
  request GET "/api/requests?limit=1" "requests" "200" "" true
  request GET "/api/inventory?page=1&limit=1" "inventory" "200" "" true
  request GET "/api/integrations" "integrations" "200" "" true
else
  request GET "/api/bots" "bots-auth-required" "401 403"
  request GET "/api/scenarios" "scenarios-auth-required" "401 403"
  request GET "/api/leads" "leads-auth-required" "401 403"
  request GET "/api/requests?limit=1" "requests-auth-required" "401 403"
  request GET "/api/inventory?page=1&limit=1" "inventory-auth-required" "401 403"
fi

echo "--- Summary: PASS=$PASSED FAIL=$FAILED SKIP=$SKIPPED ---"
if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
