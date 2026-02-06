#!/bin/bash

# Configuration
API_URL="http://localhost:3000/api"
WEB_URL="http://localhost:3001"
# Use a minimal valid JWT structure if real authentication isn't easily scriptable without a complex login flow
# Or better, this script assumes specific env vars are set or uses curl to login first if needed.
# For now, we will just check public endpoints and health.

echo "--- CarTié Smoke Test ---"

# 1. System Health
echo "1. Checking System Health..."
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health")
if [ "$HEALTH_STATUS" == "200" ]; then
    echo "✅ API Health: OK"
else
    echo "❌ API Health: FAILED ($HEALTH_STATUS)"
fi

# 2. Public MiniApp Config
echo "2. Checking MiniApp Config..."
CONFIG_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/miniapp/config?slug=system")
if [ "$CONFIG_STATUS" == "200" ]; then
    echo "✅ MiniApp Config: OK"
else
    echo "❌ MiniApp Config: FAILED ($CONFIG_STATUS)"
fi

# 3. Public Inventory
echo "3. Checking Public Inventory..."
INVENTORY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/showcase/public/system/inventory")
if [ "$INVENTORY_STATUS" == "200" ]; then
    echo "✅ Public Inventory: OK"
else
    echo "❌ Public Inventory: FAILED ($INVENTORY_STATUS)"
fi

echo "--- Smoke Test Complete ---"
