#!/bin/bash

echo "================================================"
echo "  SOUNDHAUS DESKTOP CREDENTIALS TEST SUITE"
echo "================================================"

# Configuration
BACKEND_URL="http://localhost:8000"
GITEA_URL="http://129.212.182.247:3000"

# Generate unique test account
TIMESTAMP=$(date +%s)
TEST_EMAIL="soundhaus_test_${TIMESTAMP}@gmail.com"
TEST_PASSWORD="TestPassword123!"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "\n${YELLOW}📋 Pre-Test Checks${NC}"
echo "================================"

# Check if backend is running
echo -n "Checking if backend is running... "
HEALTH_CHECK=$(curl -s -w "\nHTTP_CODE:%{http_code}" "${BACKEND_URL}/health" 2>&1)
HTTP_CODE=$(echo "$HEALTH_CHECK" | grep "HTTP_CODE" | cut -d: -f2)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ Backend not running at ${BACKEND_URL}${NC}"
    echo ""
    echo -e "${BLUE}💡 For your teammate: Backend must be running first!${NC}"
    echo ""
    echo "Start backend with Docker:"
    echo "  cd /path/to/SoundHaus_0.2.0"
    echo "  docker compose up -d"
    echo ""
    echo "OR start with uvicorn:"
    echo "  cd apps/backend"
    echo "  uvicorn main:app --reload"
    echo ""
    exit 1
fi

# Check if Gitea is accessible
echo -n "Checking if Gitea is accessible... "
if curl -s "${GITEA_URL}/api/v1/version" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ Gitea not accessible at ${GITEA_URL}${NC}"
    echo ""
    echo -e "${BLUE}💡 Check network/firewall settings${NC}"
    echo "Gitea should be reachable at: $GITEA_URL"
    echo ""
    exit 1
fi

# Check environment variables
echo -n "Checking GITEA_ADMIN_TOKEN... "
source .env 2>/dev/null
if [ -z "$GITEA_ADMIN_TOKEN" ]; then
    echo -e "${RED}✗ Not set in .env${NC}"
    exit 1
else
    echo -e "${GREEN}✓${NC}"
fi

echo -e "\n${YELLOW}🔐 Test 1: Verify GITEA_ADMIN_TOKEN${NC}"
echo "================================"
ADMIN_CHECK=$(curl -s -H "Authorization: token ${GITEA_ADMIN_TOKEN}" \
     "${GITEA_URL}/api/v1/user")

if echo "$ADMIN_CHECK" | jq -e '.login' > /dev/null 2>&1; then
    ADMIN_USERNAME=$(echo "$ADMIN_CHECK" | jq -r '.login')
    IS_ADMIN=$(echo "$ADMIN_CHECK" | jq -r '.is_admin')
    echo -e "${GREEN}✓ Admin token valid${NC}"
    echo "  Admin user: ${ADMIN_USERNAME}"
    echo "  Is admin: ${IS_ADMIN}"
    
    if [ "$IS_ADMIN" != "true" ]; then
        echo -e "${RED}✗ User is not an admin!${NC}"
        exit 1
    fi
else
    echo -e "${RED}✗ Admin token INVALID${NC}"
    echo "  Response: $ADMIN_CHECK"
    echo ""
    echo -e "${YELLOW}Fix: Generate new admin token in Gitea UI${NC}"
    echo "  1. Go to http://129.212.182.247:3000"
    echo "  2. Login as admin"
    echo "  3. Settings → Applications → Generate New Token"
    echo "  4. Check ALL scopes (especially admin:user)"
    echo "  5. Update GITEA_ADMIN_TOKEN in .env"
    exit 1
fi

# Test token creation via SSH CLI (the actual method the backend uses)
echo -e "\n${YELLOW}🎫 Test 1.5: Verify Token Creation (SSH CLI Method)${NC}"
echo "================================"
TEST_USER_ID="4cf84c7c-0b07-4043-bdf6-9edf229625e6"

# Check if SSH is configured
if [ -z "$GITEA_SSH_HOST" ]; then
    echo -e "${YELLOW}⚠ GITEA_SSH_HOST not configured in .env${NC}"
    echo "  Backend will use CLI method via SSH"
    echo "  Skipping test - SSH host not set"
else
    echo "Testing SSH CLI method to create tokens..."
    CLI_TOKEN=$(ssh -o ConnectTimeout=5 -o BatchMode=yes $GITEA_SSH_HOST \
        "docker exec -u git gitea gitea admin user generate-access-token \
        --username $TEST_USER_ID \
        --token-name 'test-$(date +%s)' \
        --scopes 'write:repository,read:user' \
        --raw" 2>&1)
    
    if [ $? -eq 0 ] && [ ! -z "$CLI_TOKEN" ] && [ "$CLI_TOKEN" != *"error"* ]; then
        echo -e "${GREEN}✓ CLI method works - backend can create Gitea tokens${NC}"
        echo "  SSH Host: $GITEA_SSH_HOST"
        echo "  Created test token: ${CLI_TOKEN:0:20}..."
        
        # Delete the test token
        ssh $GITEA_SSH_HOST "docker exec gitea gitea admin user delete-token \
            --username $TEST_USER_ID --token $CLI_TOKEN" > /dev/null 2>&1
    else
        echo -e "${YELLOW}⚠ SSH CLI method failed${NC}"
        echo "  Backend will fallback to API method (may not work)"
        echo "  Error: $CLI_TOKEN"
    fi
fi

echo -e "\n${YELLOW}📝 Test 2: Create New Test Account${NC}"
echo "================================"
echo "Creating account: ${TEST_EMAIL}"

SIGNUP_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    -X POST "${BACKEND_URL}/api/auth/signup" \
    -H "Content-Type: application/json" \
    -d "{
    \"email\": \"${TEST_EMAIL}\",
    \"password\": \"${TEST_PASSWORD}\"
  }")

HTTP_CODE=$(echo "$SIGNUP_RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$SIGNUP_RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" != "200" ]; then
    echo -e "${RED}✗ Signup failed (HTTP $HTTP_CODE)${NC}"
    echo "Response: $BODY"
    exit 1
fi

echo "Signup Response:"
echo "$BODY" | jq '.'

# Check if signup requires confirmation
if echo "$BODY" | jq -e '.supabase.requires_confirmation' > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠ Email confirmation required${NC}"
    echo "  Supabase is configured to require email verification"
    exit 1
fi

if echo "$BODY" | jq -e '.success' > /dev/null 2>&1; then
    USER_ID=$(echo "$BODY" | jq -r '.supabase.user.id // .gitea.data.id // empty')
    
    if [ -z "$USER_ID" ] || [ "$USER_ID" == "null" ]; then
        echo -e "${RED}✗ Account created but no User ID returned${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Account created successfully${NC}"
    echo "  User ID: ${USER_ID}"
    echo "  Email: ${TEST_EMAIL}"
else
    echo -e "${RED}✗ Account creation failed${NC}"
    exit 1
fi

# Wait for account provisioning
echo "  Waiting for account provisioning..."
sleep 2

echo -e "\n${YELLOW}🔑 Test 3: Desktop Login (Get Backend PAT)${NC}"
echo "================================"
LOGIN_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    -X POST "${BACKEND_URL}/api/auth/desktop-login" \
    -H "Content-Type: application/json" \
    -d "{
    \"email\": \"${TEST_EMAIL}\",
    \"password\": \"${TEST_PASSWORD}\"
  }")

HTTP_CODE=$(echo "$LOGIN_RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$LOGIN_RESPONSE" | sed '/HTTP_CODE/d')

echo "Login Response (HTTP $HTTP_CODE):"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"

if [ "$HTTP_CODE" != "200" ]; then
    echo -e "${RED}✗ Desktop login failed (HTTP $HTTP_CODE)${NC}"
    exit 1
fi

if echo "$BODY" | jq -e '.success' > /dev/null 2>&1; then
    BACKEND_PAT=$(echo "$BODY" | jq -r '.desktop_credentials.pat')
    USER_ID=$(echo "$BODY" | jq -r '.user.id')
    echo -e "${GREEN}✓ Desktop login successful${NC}"
    echo "  User ID: ${USER_ID}"
    echo "  Backend PAT: ${BACKEND_PAT:0:20}...${BACKEND_PAT: -4}"
else
    echo -e "${RED}✗ Desktop login failed${NC}"
    exit 1
fi

echo -e "\n${YELLOW}👤 Test 4: Check if User Exists in Gitea${NC}"
echo "================================"
USER_CHECK=$(curl -s -H "Authorization: token ${GITEA_ADMIN_TOKEN}" \
     "${GITEA_URL}/api/v1/users/${USER_ID}")

if echo "$USER_CHECK" | jq -e '.login' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ User exists in Gitea${NC}"
    echo "  Username: $(echo "$USER_CHECK" | jq -r '.login')"
else
    echo -e "${YELLOW}⚠ User does NOT exist in Gitea yet${NC}"
    echo "  (This is okay - will be created on first use)"
fi

echo -e "\n${YELLOW}🎫 Test 5: Get Desktop Credentials (Gitea PAT)${NC}"
echo "================================"
CREDS_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    -X GET "${BACKEND_URL}/api/desktop/credentials" \
    -H "Authorization: token ${BACKEND_PAT}")

HTTP_CODE=$(echo "$CREDS_RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$CREDS_RESPONSE" | sed '/HTTP_CODE/d')

echo "Full Response (HTTP $HTTP_CODE):"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"

if [ "$HTTP_CODE" != "200" ]; then
    echo -e "${RED}✗ Failed to get desktop credentials (HTTP $HTTP_CODE)${NC}"
    exit 1
fi

if echo "$BODY" | jq -e '.success' > /dev/null 2>&1; then
    GITEA_TOKEN=$(echo "$BODY" | jq -r '.token')
    GITEA_USERNAME=$(echo "$BODY" | jq -r '.username')
    echo -e "\n${GREEN}✓ Desktop credentials retrieved${NC}"
    echo "  Gitea Username: ${GITEA_USERNAME}"
    echo "  Gitea Token: ${GITEA_TOKEN:0:20}...${GITEA_TOKEN: -4}"
else
    echo -e "\n${RED}✗ Failed to get desktop credentials${NC}"
    ERROR_MSG=$(echo "$BODY" | jq -r '.error // .detail // .message // "Unknown error"')
    echo "  Error: $ERROR_MSG"
    exit 1
fi

echo -e "\n${YELLOW}✅ Test 6: Verify Gitea Token Works${NC}"
echo "================================"
GITEA_USER_CHECK=$(curl -s -H "Authorization: token ${GITEA_TOKEN}" \
     "${GITEA_URL}/api/v1/user")

if echo "$GITEA_USER_CHECK" | jq -e '.login' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Gitea token is valid and working${NC}"
    echo "$GITEA_USER_CHECK" | jq '{login, email, id, is_admin}'
else
    echo -e "${RED}✗ Gitea token is invalid${NC}"
    echo "  Response: $GITEA_USER_CHECK"
    exit 1
fi

echo -e "\n${GREEN}================================================${NC}"
echo -e "${GREEN}  🎉 ALL TESTS PASSED!${NC}"
echo -e "${GREEN}================================================${NC}"
echo -e "\nTest Account:"
echo "  Email: ${TEST_EMAIL}"
echo "  Password: ${TEST_PASSWORD}"
echo "  User ID: ${USER_ID}"
echo -e "\nCredentials:"
echo "  Backend PAT: ${BACKEND_PAT:0:20}..."
echo "  Gitea Token: ${GITEA_TOKEN:0:20}..."
echo "  User can now use these credentials for Git operations"
