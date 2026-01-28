#!/bin/bash
# verification/routes_smoke_test.sh

FRONTEND_URL=${1:-"http://localhost:3000"}
BACKEND_URL=${2:-"http://localhost:3001"}

echo "Checking Routes..."

# 1. Frontend SPA Fallback (if served via Caddy/serve)
echo "Checking Frontend Root..."
curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL/" | grep "200" && echo "✅ Frontend Root OK" || echo "❌ Frontend Root FAIL"

echo "Checking Frontend Deep Link (SPA Fallback)..."
curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL/settings" | grep "200" && echo "✅ Frontend Deep Link OK" || echo "❌ Frontend Deep Link FAIL"

echo "Checking Frontend Mini App Route..."
curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL/p/app/system" | grep "200" && echo "✅ Frontend Mini App OK" || echo "❌ Frontend Mini App FAIL"

# 2. Backend Health
echo "Checking Backend Health..."
curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/health" | grep "200" && echo "✅ Backend Health OK" || echo "❌ Backend Health FAIL"

# 3. Public Inventory API
echo "Checking Public Inventory API..."
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/api/public/system/inventory")
if [ "$CODE" == "200" ] || [ "$CODE" == "404" ]; then
    echo "✅ Public Inventory API Reachable (Code: $CODE)"
else
    echo "❌ Public Inventory API FAIL (Code: $CODE)"
fi
