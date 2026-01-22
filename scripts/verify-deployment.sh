#!/bin/bash
# Production Deployment Verification Script
# Run this after deploying to verify all critical endpoints

set -e

API_URL="${API_URL:-http://localhost:3001}"
TOKEN="${AUTH_TOKEN:-}"

echo "🔍 Cartie Platform Deployment Verification"
echo "=========================================="
echo "API URL: $API_URL"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if token is provided
if [ -z "$TOKEN" ]; then
  echo -e "${YELLOW}⚠️  Warning: No AUTH_TOKEN provided. Authenticated endpoints will fail.${NC}"
  echo "   Set AUTH_TOKEN environment variable to test authenticated endpoints."
  echo ""
fi

# Test counter
PASSED=0
FAILED=0

# Helper function to test endpoint
test_endpoint() {
  local name=$1
  local method=$2
  local endpoint=$3
  local data=$4
  local needs_auth=$5
  
  echo -n "Testing $name... "
  
  if [ "$needs_auth" = "true" ] && [ -z "$TOKEN" ]; then
    echo -e "${YELLOW}SKIPPED (no auth)${NC}"
    return
  fi
  
  local headers="-H 'Content-Type: application/json'"
  if [ "$needs_auth" = "true" ]; then
    headers="$headers -H 'Authorization: Bearer $TOKEN'"
  fi
  
  if [ "$method" = "GET" ]; then
    response=$(eval curl -s -w "\\n%{http_code}" -X GET "$API_URL$endpoint" $headers)
  else
    response=$(eval curl -s -w "\\n%{http_code}" -X $method "$API_URL$endpoint" $headers -d "'$data'")
  fi
  
  http_code=$(echo "$response" | tail -n1)
  
  if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
    echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
    ((PASSED++))
  else
    echo -e "${RED}✗ FAIL${NC} (HTTP $http_code)"
    echo "   Response: $(echo "$response" | head -n-1)"
    ((FAILED++))
  fi
}

# 1. Health Check
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. System Health Checks"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "Health endpoint" "GET" "/health" "" "false"
test_endpoint "API root" "GET" "/api/health" "" "false"
echo ""

# 2. Inventory API (Critical)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. Inventory API (CarRepository)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "List inventory" "GET" "/api/inventory?limit=5" "" "true"
test_endpoint "Create car" "POST" "/api/inventory" '{"title":"Test BMW X5","price":25000,"year":2020,"mileage":50000}' "true"
echo ""

# 3. Requests API (Critical)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. B2B Requests API (publicId fix)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "List requests" "GET" "/api/requests?limit=5" "" "true"
test_endpoint "Create request" "POST" "/api/requests" '{"title":"Need SUV","budgetMax":30000}' "true"
echo ""

# 4. Scenarios API (Critical)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4. Scenarios API (companyId fix)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "List scenarios" "GET" "/api/scenarios" "" "true"
test_endpoint "Create scenario" "POST" "/api/scenarios" '{"name":"Test Flow","triggerCommand":"test","nodes":[{"id":"start","type":"START","content":{},"position":{"x":0,"y":0}}],"entryNodeId":"start","keywords":[],"isActive":false}' "true"
echo ""

# 5. Bots API
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5. Bots API (Menu config)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "List bots" "GET" "/api/bots" "" "true"
echo ""

# 6. System Settings
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6. System Settings (Default features)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "Get settings" "GET" "/api/system/settings" "" "true"
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed! Deployment verified.${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed. Check the output above.${NC}"
  exit 1
fi
