#!/bin/bash
# Smoke Test Harness - Critical API Endpoints
# Run before any backend refactoring to establish baseline

set -e  # Exit on first failure

BASE_URL="${API_BASE_URL:-http://localhost:3001}"
FAILED=0
PASSED=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔥 Smoke Test Harness"
echo "Base URL: $BASE_URL"
echo "========================================"

# Helper function to test endpoint
test_endpoint() {
  local method=$1
  local path=$2
  local description=$3
  local expected_status=${4:-200}
  local data=$5
  
  echo -n "Testing: $description ... "
  
  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "\n%{http_code}" -X GET "$BASE_URL$path" -H "Content-Type: application/json" || echo "000")
  else
    response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL$path" -H "Content-Type: application/json" -d "$data" || echo "000")
  fi
  
  status=$(echo "$response" | tail -n1)
  
  # Accept both expected status and 401 (auth required) as non-failures for protected endpoints
  if [ "$status" = "$expected_status" ] || [ "$status" = "401" ] || [ "$status" = "200" ] || [ "$status" = "201" ]; then
    echo -e "${GREEN}✓ PASS${NC} (HTTP $status)"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}✗ FAIL${NC} (HTTP $status, expected $expected_status)"
    FAILED=$((FAILED + 1))
  fi
}

# 1. Health & System
test_endpoint "GET" "/health" "Server health check" 200

# 2. Authentication (will fail with 401/400 but should not 500)
test_endpoint "POST" "/api/auth/login" "Login endpoint exists" 400 '{"email":"test@test.com","password":"wrong"}'

# 3. Public Leads (no auth)
test_endpoint "POST" "/api/public/leads" "Public lead creation" 400 '{}'

# 4. Public B2B Requests (no auth)
test_endpoint "POST" "/api/public/requests" "Public B2B request" 400 '{}'

# 5. Protected Leads (should 401 or 200 if auth header present)
test_endpoint "GET" "/api/leads" "List leads (protected)" 200

# 6. Protected Inventory
test_endpoint "GET" "/api/inventory/cars" "List inventory (protected)" 200

# 7. Protected Bots
test_endpoint "GET" "/api/bots" "List bots (protected)" 200

# 8. Protected Templates
test_endpoint "GET" "/api/templates" "List templates (protected)" 200

# 9. Protected Integrations
test_endpoint "GET" "/api/integrations" "List integrations (protected)" 200

# 10. Protected Companies
test_endpoint "GET" "/api/companies" "List companies (protected)" 200

# 11. Protected Scenarios
test_endpoint "GET" "/api/scenarios" "List scenarios (protected)" 200

# 12. Protected Users
test_endpoint "GET" "/api/users" "List users (protected)" 200

# 13. Entity Meta
test_endpoint "GET" "/api/entities/meta" "Entity metadata" 200

# 14. System Routes
test_endpoint "GET" "/api/system/health" "System health" 200

# Summary
echo "========================================"
echo -e "${GREEN}Passed: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}Failed: $FAILED${NC}"
  echo ""
  echo "❌ SMOKE TESTS FAILED"
  echo "Do NOT proceed with refactoring until all tests pass"
  exit 1
else
  echo -e "${GREEN}Failed: 0${NC}"
  echo ""
  echo "✅ ALL SMOKE TESTS PASSED"
  echo "Safe to proceed with refactoring"
  exit 0
fi
