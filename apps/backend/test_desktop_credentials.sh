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
if curl -s "${BACKEND_URL}/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ Backend not running at ${BACKEND_URL}${NC}"
    echo "Start it with: uvicorn main:app --reload"
    exit 1
fi

# Check if Gitea is accessible
echo -n "Checking if Gitea is accessible... "
if curl -s "${GITEA_URL}/api/v1/version" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ Gitea not accessible at ${GITEA_URL}${NC}"
    exit 1
fi

# Check environment variables
echo -n "Checking GITEA_ADMIN_TOKEN... "
source .env
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
    echo -e "${GREEN}✓ Admin token valid${NC}"
    echo "  Admin user: ${ADMIN_USERNAME}"
else
    echo -e "${RED}✗ Admin token INVALID${NC}"
    echo "  Response: $ADMIN_CHECK"
    echo -e "\n${YELLOW}Fix: Generate new admin token in Gitea UI${NC}"
    echo "  1. Go to http://129.212.182.247:3000"
    echo "  2. Login as admin"
    echo "  3. Settings → Applications → Generate New Token"
    echo "  4. Select ALL scopes (especially admin:user)"
    echo "  5. Update GITEA_ADMIN_TOKEN in .env"
    exit 1
fi

echo -e "\n${YELLOW}📝 Test 2: Create New Test Account${NC}"
echo "================================"
echo "Creating account: ${TEST_EMAIL}"

SIGNUP_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${TEST_EMAIL}\",
    \"password\": \"${TEST_PASSWORD}\"
  }")

echo "Signup Response:"
echo "$SIGNUP_RESPONSE" | jq '.'

# Check if signup requires confirmation
if echo "$SIGNUP_RESPONSE" | jq -e '.supabase.requires_confirmation' > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠ Email confirmation required${NC}"
    echo "  Supabase is configured to require email verification"
    echo "  For testing, you may need to disable email confirmation in Supabase"
    echo "  Or check the confirmation email and verify the account"
    exit 1
fi

if echo "$SIGNUP_RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
    # Try to get user ID from supabase or gitea response
    USER_ID=$(echo "$SIGNUP_RESPONSE" | jq -r '.supabase.user.id // .gitea.data.id // empty')
    
    if [ -z "$USER_ID" ] || [ "$USER_ID" == "null" ]; then
        echo -e "${RED}✗ Account created but no User ID returned${NC}"
        echo "  This might mean email confirmation is required"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Account created successfully${NC}"
    echo "  User ID: ${USER_ID}"
    echo "  Email: ${TEST_EMAIL}"
else
    echo -e "${RED}✗ Account creation failed${NC}"
    echo "  Response: $SIGNUP_RESPONSE"
    exit 1
fi

# Wait a moment for account provisioning
echo "  Waiting for account provisioning..."
sleep 2

echo -e "\n${YELLOW}🔑 Test 3: Desktop Login (Get Backend PAT)${NC}"
echo "================================"
LOGIN_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/auth/desktop-login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${TEST_EMAIL}\",
    \"password\": \"${TEST_PASSWORD}\"
  }")

echo "Login Response:"
echo "$LOGIN_RESPONSE" | jq '.' 2>/dev/null || echo "$LOGIN_RESPONSE"

if echo "$LOGIN_RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
    BACKEND_PAT=$(echo "$LOGIN_RESPONSE" | jq -r '.desktop_credentials.pat')
    USER_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.user.id')
    echo -e "${GREEN}✓ Desktop login successful${NC}"
    echo "  User ID: ${USER_ID}"
    echo "  Backend PAT: ${BACKEND_PAT:0:20}...${BACKEND_PAT: -4}"
else
    echo -e "${RED}✗ Desktop login failed${NC}"
    
    # Try to extract error details
    ERROR_DETAIL=$(echo "$LOGIN_RESPONSE" | jq -r '.detail // .error // .message // empty' 2>/dev/null)
    if [ ! -z "$ERROR_DETAIL" ]; then
        echo "  Error: $ERROR_DETAIL"
    fi
    
    echo -e "\n${YELLOW}Possible causes:${NC}"
    echo "  1. Database connection issue (check PostgreSQL)"
    echo "  2. PAT table not created (run migrations)"
    echo "  3. Backend server error (check server logs)"
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
    echo -e "${RED}✗ User does NOT exist in Gitea${NC}"
    echo "  This is expected if user hasn't created a repo yet"
    echo "  The endpoint should auto-create the user..."
fi

echo -e "\n${YELLOW}🎫 Test 5: Get Desktop Credentials (Gitea PAT)${NC}"
echo "================================"
CREDS_RESPONSE=$(curl -s -X GET "${BACKEND_URL}/api/desktop/credentials" \
  -H "Authorization: token ${BACKEND_PAT}")

echo "Full Response:"
echo "$CREDS_RESPONSE" | jq '.'

if echo "$CREDS_RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
    GITEA_TOKEN=$(echo "$CREDS_RESPONSE" | jq -r '.token')
    GITEA_USERNAME=$(echo "$CREDS_RESPONSE" | jq -r '.username')
    echo -e "\n${GREEN}✓ Desktop credentials retrieved${NC}"
    echo "  Gitea Username: ${GITEA_USERNAME}"
    echo "  Gitea Token: ${GITEA_TOKEN:0:20}...${GITEA_TOKEN: -4}"
else
    echo -e "\n${RED}✗ Failed to get desktop credentials${NC}"
    
    # Check for specific error
    ERROR_MSG=$(echo "$CREDS_RESPONSE" | jq -r '.error // .detail // .message // "Unknown error"')
    echo "  Error: $ERROR_MSG"
    
    if [[ "$ERROR_MSG" == *"Admin authentication failed"* ]]; then
        echo -e "\n${YELLOW}Diagnosis: GITEA_ADMIN_TOKEN is invalid${NC}"
        echo "  Even though Test 1 passed, the token might be missing scopes"
        echo "  Required scope: admin:user (to create tokens for other users)"
    fi
    
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
