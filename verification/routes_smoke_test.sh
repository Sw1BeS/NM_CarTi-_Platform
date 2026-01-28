#!/bin/bash
# verification/routes_smoke_test.sh

set -euo pipefail

FRONTEND_URL=${1:-"http://localhost:3000"}
BACKEND_URL=${2:-"http://localhost:3001"}
AUTH_TOKEN=${AUTH_TOKEN:-""}

echo "Checking Routes..."

check_http() {
    local name="$1"
    local url="$2"
    local expected="$3"
    local code
    code=$(curl -sS -o /dev/null -w "%{http_code}" "$url" || true)
    if [[ "$code" != "$expected" ]]; then
        echo "❌ $name FAIL (Expected $expected, got $code) - $url"
        exit 1
    fi
    echo "✅ $name OK ($code)"
}

check_http_multi() {
    local name="$1"
    local url="$2"
    shift 2
    local code
    code=$(curl -sS -o /dev/null -w "%{http_code}" "$url" || true)
    for expected in "$@"; do
        if [[ "$code" == "$expected" ]]; then
            echo "✅ $name OK ($code)"
            return 0
        fi
    done
    echo "❌ $name FAIL (Expected one of: $*, got $code) - $url"
    exit 1
}

# 1. Frontend SPA Fallback (if served via Caddy/serve)
check_http "Frontend Root" "$FRONTEND_URL/" "200"
check_http "Frontend Deep Link (SPA Fallback)" "$FRONTEND_URL/settings" "200"
check_http "Frontend Mini App Route" "$FRONTEND_URL/p/app/system" "200"

# 2. Backend Health
check_http "Backend Health" "$BACKEND_URL/health" "200"

# 3. Auth-protected APIs (verify route protection or data)
if [[ -n "$AUTH_TOKEN" ]]; then
    check_http "API /bots (auth)" "$BACKEND_URL/api/bots" "200"
    check_http "API /showcase (auth)" "$BACKEND_URL/api/showcase" "200"
else
    check_http_multi "API /bots (auth protected)" "$BACKEND_URL/api/bots" "401" "403"
    check_http_multi "API /showcase (auth protected)" "$BACKEND_URL/api/showcase" "401" "403"
    echo "ℹ️  Set AUTH_TOKEN to validate 200 responses for /api/bots and /api/showcase."
fi

# 4. Public Showcase Inventory API (canonical)
check_http_multi "Public Showcase Inventory" "$BACKEND_URL/api/showcase/public/system/inventory" "200" "404"
