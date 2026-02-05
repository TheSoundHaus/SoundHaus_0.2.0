#!/bin/bash

# =============================================================================
# SoundHaus Digital Ocean Deployment Script
# =============================================================================
# This script deploys the SoundHaus backend (FastAPI + Gitea) to Digital Ocean
#
# Prerequisites:
# - Digital Ocean Droplet (Ubuntu 22.04 LTS recommended)
# - Docker and Docker Compose installed on the droplet
# - SSH access to the droplet
# - Digital Ocean Spaces bucket created
# - Supabase project configured
#
# Usage:
#   ./scripts/deploy-digital-ocean.sh [droplet-ip] [ssh-user]
#
# Example:
#   ./scripts/deploy-digital-ocean.sh 142.93.123.45 root
# =============================================================================

set -e  # Exit on any error

# Color output for better readability
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required arguments are provided
if [ $# -lt 2 ]; then
    print_error "Missing required arguments"
    echo "Usage: $0 [droplet-ip] [ssh-user]"
    echo "Example: $0 142.93.123.45 root"
    exit 1
fi

DROPLET_IP=$1
SSH_USER=$2
DEPLOY_DIR="/opt/soundhaus"

print_info "Starting SoundHaus deployment to Digital Ocean"
print_info "Droplet IP: $DROPLET_IP"
print_info "SSH User: $SSH_USER"

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_error ".env file not found!"
    print_warning "Please copy .env.example to .env and fill in your credentials"
    exit 1
fi

# Validate required environment variables
print_info "Validating environment variables..."
source .env

REQUIRED_VARS=(
    "SUPABASE_DB_HOST"
    "SUPABASE_DB_PASSWORD"
    "SUPABASE_URL"
    "SUPABASE_SERVICE_KEY"
    "DO_SPACES_ENDPOINT"
    "DO_SPACES_KEY"
    "DO_SPACES_SECRET"
    "DO_SPACES_BUCKET"
)

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        print_error "Required environment variable $var is not set"
        exit 1
    fi
done

print_info "All required environment variables are set"

# Test SSH connection
print_info "Testing SSH connection to droplet..."
if ! ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no ${SSH_USER}@${DROPLET_IP} "echo 'SSH connection successful'"; then
    print_error "Failed to connect to droplet via SSH"
    exit 1
fi

# Check if Docker is installed on the droplet
print_info "Checking Docker installation on droplet..."
if ! ssh ${SSH_USER}@${DROPLET_IP} "command -v docker &> /dev/null"; then
    print_warning "Docker not found on droplet. Installing Docker..."
    ssh ${SSH_USER}@${DROPLET_IP} << 'ENDSSH'
        apt-get update
        apt-get install -y ca-certificates curl
        install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
        chmod a+r /etc/apt/keyrings/docker.asc
        echo \
          "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
          $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
          tee /etc/apt/sources.list.d/docker.list > /dev/null
        apt-get update
        apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
ENDSSH
    print_info "Docker installed successfully"
else
    print_info "Docker is already installed"
fi

# Create deployment directory
print_info "Creating deployment directory on droplet..."
ssh ${SSH_USER}@${DROPLET_IP} "mkdir -p ${DEPLOY_DIR}"

# Copy necessary files to droplet
print_info "Copying project files to droplet..."
rsync -avz --progress \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude 'apps/desktop' \
    --exclude 'apps/web' \
    --exclude 'apps/backend/gitea' \
    docker-compose.yml \
    .env \
    apps/backend/ \
    ${SSH_USER}@${DROPLET_IP}:${DEPLOY_DIR}/

# Update .env file with production URLs on the droplet
print_info "Configuring production environment variables..."
ssh ${SSH_USER}@${DROPLET_IP} << ENDSSH
    cd ${DEPLOY_DIR}

    # Update ROOT_URL and DOMAIN in .env for production
    sed -i "s|ROOT_URL=.*|ROOT_URL=http://${DROPLET_IP}:3000/|g" .env
    sed -i "s|DOMAIN=.*|DOMAIN=${DROPLET_IP}|g" .env
    sed -i "s|API_URL=.*|API_URL=http://${DROPLET_IP}:8000|g" .env
ENDSSH

# Configure firewall
print_info "Configuring firewall rules..."
ssh ${SSH_USER}@${DROPLET_IP} << 'ENDSSH'
    # Allow SSH, HTTP, and our application ports
    ufw allow 22/tcp      # SSH
    ufw allow 80/tcp      # HTTP
    ufw allow 443/tcp     # HTTPS
    ufw allow 3000/tcp    # Gitea
    ufw allow 2222/tcp    # Gitea SSH
    ufw allow 8000/tcp    # FastAPI

    # Enable firewall if not already enabled
    echo "y" | ufw enable || true
ENDSSH

# Create necessary directories for Gitea data
print_info "Creating Gitea data directory..."
ssh ${SSH_USER}@${DROPLET_IP} "mkdir -p ${DEPLOY_DIR}/apps/backend/gitea"

# Deploy the application
print_info "Starting Docker containers..."
ssh ${SSH_USER}@${DROPLET_IP} << ENDSSH
    cd ${DEPLOY_DIR}

    # Stop any existing containers
    docker compose down || true

    # Pull latest images
    docker compose pull

    # Start containers in detached mode
    docker compose up -d

    # Show running containers
    docker compose ps
ENDSSH

# Wait for services to be healthy
print_info "Waiting for services to start (this may take a minute)..."
sleep 30

# Check service health
print_info "Checking service health..."
ssh ${SSH_USER}@${DROPLET_IP} << ENDSSH
    cd ${DEPLOY_DIR}

    # Check Gitea health
    if docker compose exec -T gitea curl -f http://localhost:3000/api/healthz &> /dev/null; then
        echo "✓ Gitea is healthy"
    else
        echo "✗ Gitea health check failed"
    fi

    # Check FastAPI health
    if docker compose exec -T fastapi curl -f http://localhost:8000/health &> /dev/null; then
        echo "✓ FastAPI is healthy"
    else
        echo "✗ FastAPI health check failed"
    fi
ENDSSH

# Print deployment summary
print_info "Deployment completed successfully!"
echo ""
echo "============================================"
echo "  SoundHaus Backend Deployment Summary"
echo "============================================"
echo ""
echo "Gitea URL:    http://${DROPLET_IP}:3000"
echo "Gitea SSH:    ssh://git@${DROPLET_IP}:2222"
echo "FastAPI URL:  http://${DROPLET_IP}:8000"
echo "API Docs:     http://${DROPLET_IP}:8000/docs"
echo ""
echo "Next steps:"
echo "1. Access Gitea at http://${DROPLET_IP}:3000"
echo "2. Complete initial Gitea setup (if first deployment)"
echo "3. Create admin account and generate admin token"
echo "4. Add GITEA_ADMIN_TOKEN to .env file"
echo "5. Redeploy to apply token: ./scripts/deploy-digital-ocean.sh ${DROPLET_IP} ${SSH_USER}"
echo ""
echo "To view logs:"
echo "  ssh ${SSH_USER}@${DROPLET_IP} 'cd ${DEPLOY_DIR} && docker compose logs -f'"
echo ""
echo "To stop services:"
echo "  ssh ${SSH_USER}@${DROPLET_IP} 'cd ${DEPLOY_DIR} && docker compose down'"
echo ""
echo "============================================"
