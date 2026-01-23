#!/usr/bin/env bash
set -euo pipefail

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

AUTH_TOKEN="${AUTH_TOKEN:-}"

PASSED=0
FAILED=0
AUTH_REQUIRED=0

TMP_BODY="/tmp/smoke_read_body.$$"
trap 'rm -f "$TMP_BODY"' EXIT

request() {
  local method="$1"
  local path="$2"
  local label="$3"

  local url="${BASE_URL}${path}"
  local headers=("-H" "Content-Type: application/json")
  if [ -n "$AUTH_TOKEN" ]; then
    headers+=("-H" "Authorization: Bearer ${AUTH_TOKEN}")
  fi

  local status
  status=$(curl -s -o "$TMP_BODY" -w "%{http_code}" -X "$method" "$url" "${headers[@]}" || echo "000")

  if [ "$status" = "200" ] || [ "$status" = "204" ]; then
    echo "PASS  $label ($method $path) -> $status"
    PASSED=$((PASSED + 1))
    return
  fi

  if [ "$status" = "401" ] || [ "$status" = "403" ]; then
    echo "AUTH  $label ($method $path) -> $status"
    AUTH_REQUIRED=$((AUTH_REQUIRED + 1))
    return
  fi

  echo "FAIL  $label ($method $path) -> $status"
  FAILED=$((FAILED + 1))
}

echo "Smoke Read"
echo "Base URL: $BASE_URL"
if [ -n "$AUTH_TOKEN" ]; then
  echo "Auth: token provided"
else
  echo "Auth: no token (401/403 treated as expected)"
fi

request GET "/health" "health"
request GET "/api/system/settings/public" "system settings (public)"
request GET "/api/public/bots" "public bots"
request GET "/api/public/requests?page=1&limit=1" "public requests"
request GET "/api/templates/marketplace" "templates marketplace (public)"

request GET "/api/bots" "bots (protected)"
request GET "/api/scenarios" "scenarios (protected)"
request GET "/api/leads" "leads (protected)"
request GET "/api/requests" "requests (protected)"
request GET "/api/inventory?page=1&limit=1" "inventory (protected)"
request GET "/api/companies/current" "company current (protected)"
request GET "/api/templates/installed/list" "templates installed (protected)"
request GET "/api/integrations" "integrations (protected)"
request GET "/api/entities/meta" "entity meta (protected)"


echo "Summary: PASS=$PASSED AUTH=$AUTH_REQUIRED FAIL=$FAILED"
if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
