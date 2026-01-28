#!/bin/bash
# verification/check_showcase.sh

set -euo pipefail

API_URL=${1:-"http://localhost:3001/api/showcase/public"}
SLUG=${2:-"system"}

echo "Testing Showcase API for slug: $SLUG"

# Fetch Inventory
RESPONSE=$(curl -sS "$API_URL/$SLUG/inventory" || true)
if [[ -z "$RESPONSE" ]]; then
    echo "❌ Empty response from $API_URL/$SLUG/inventory"
    exit 1
fi

# Check if response contains "items" array
if ! echo "$RESPONSE" | grep -q "\"items\""; then
    echo "❌ Response missing 'items'"
    echo "Response: $RESPONSE"
    exit 1
fi

echo "✅ Response contains 'items'"

# Check if response contains "total"
if echo "$RESPONSE" | grep -q "\"total\""; then
    echo "✅ Response contains 'total'"
else
    echo "⚠️ Response missing 'total'"
fi

# Check for sensitive data leak (e.g. internal notes, cost price if any)
if echo "$RESPONSE" | grep -q "internalNotes"; then
    echo "❌ SECURITY FAIL: Internal notes detected in public response!"
    exit 1
else
    echo "✅ Security Check: No 'internalNotes' found."
fi

if echo "$RESPONSE" | grep -q "costPrice"; then
    echo "❌ SECURITY FAIL: costPrice detected in public response!"
    exit 1
else
    echo "✅ Security Check: No 'costPrice' found."
fi

echo "Showcase Test Complete"
