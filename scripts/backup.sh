#!/bin/bash

# =============================================================================
# SoundHaus Gitea Backup Script
# =============================================================================
# Backs up Gitea data directory (repositories, avatars, attachments, etc.)
# Database is handled by Supabase's automated backups
# =============================================================================

set -e  # Exit on any error

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
BACKUP_DIR="${BACKUP_DIR:-./backups}"
GITEA_DATA_DIR="${GITEA_DATA_DIR:-./gitea}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="soundhaus_gitea_backup_${TIMESTAMP}.tar.gz"
KEEP_BACKUPS="${KEEP_BACKUPS:-7}"  # Keep last 7 backups

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# -----------------------------------------------------------------------------
# Helper Functions
# -----------------------------------------------------------------------------
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# -----------------------------------------------------------------------------
# Validation
# -----------------------------------------------------------------------------
if [ ! -d "$GITEA_DATA_DIR" ]; then
    log_error "Gitea data directory not found: $GITEA_DATA_DIR"
    exit 1
fi

# -----------------------------------------------------------------------------
# Backup Process
# -----------------------------------------------------------------------------

log_info "Starting Gitea backup..."
log_info "Timestamp: $TIMESTAMP"

# Create backup directory
mkdir -p "$BACKUP_DIR"

log_info "Step 1: Calculating data size..."
DATA_SIZE=$(du -sh "$GITEA_DATA_DIR" | cut -f1)
log_info "Gitea data size: $DATA_SIZE"

log_info "Step 2: Creating compressed archive..."
tar -czf "$BACKUP_DIR/$BACKUP_NAME" \
    --exclude='*.lock' \
    --exclude='*.pid' \
    --exclude='log/*' \
    -C "$(dirname "$GITEA_DATA_DIR")" \
    "$(basename "$GITEA_DATA_DIR")"

BACKUP_SIZE=$(du -sh "$BACKUP_DIR/$BACKUP_NAME" | cut -f1)
log_info "Backup created: $BACKUP_NAME ($BACKUP_SIZE)"

log_info "Step 3: Verifying backup..."
if tar -tzf "$BACKUP_DIR/$BACKUP_NAME" > /dev/null; then
    log_info "Backup verification successful!"
else
    log_error "Backup verification failed!"
    exit 1
fi

log_info "Step 4: Cleaning up old backups..."
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/soundhaus_gitea_backup_*.tar.gz 2>/dev/null | wc -l)
log_info "Current backup count: $BACKUP_COUNT"

if [ "$BACKUP_COUNT" -gt "$KEEP_BACKUPS" ]; then
    log_info "Removing old backups (keeping last $KEEP_BACKUPS)..."
    ls -1t "$BACKUP_DIR"/soundhaus_gitea_backup_*.tar.gz | tail -n +$((KEEP_BACKUPS + 1)) | xargs rm -f
    log_info "Old backups removed"
else
    log_info "No old backups to remove"
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo ""
log_info "Backup complete!"
echo ""
echo "Details:"
echo "  Backup file: $BACKUP_DIR/$BACKUP_NAME"
echo "  Backup size: $BACKUP_SIZE"
echo "  Original size: $DATA_SIZE"
echo ""
echo "To restore this backup:"
echo "  1. Stop Gitea: docker-compose down"
echo "  2. Extract: tar -xzf $BACKUP_DIR/$BACKUP_NAME -C ."
echo "  3. Start Gitea: docker-compose up -d"
echo ""
echo "Note: Database is backed up automatically by Supabase"
echo "      Access Supabase backups at: Dashboard → Database → Backups"
