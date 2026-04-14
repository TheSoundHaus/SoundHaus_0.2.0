#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────────────
# SoundHaus — LUKS Volume Encryption Setup for Digital Ocean
#
# Encrypts the Gitea git-repository storage volume with LUKS.
# Run on the Digital Ocean droplet as root DURING A MAINTENANCE WINDOW.
#
# Prerequisites:
#   1. A new DO Block Storage volume attached (e.g. /dev/disk/by-id/scsi-0DO_Volume_gitea-data)
#   2. Data currently on the old volume backed up with:
#        rsync -aHAX /opt/soundhaus/gitea/git/repositories/ /tmp/repo-backup/
#   3. Docker containers stopped:
#        cd /opt/soundhaus && docker compose down
#
# After running: store the LUKS passphrase in 1Password or equivalent vault.
# ────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DEVICE="${1:-/dev/disk/by-id/scsi-0DO_Volume_gitea-data}"
CRYPT_NAME="gitea_crypt"
MOUNT_POINT="/opt/soundhaus/gitea/git/repositories"
KEYFILE="/root/.luks-gitea.key"

echo "════════════════════════════════════════════════════════"
echo "  SoundHaus LUKS Volume Encryption"
echo "  Device:  $DEVICE"
echo "  Mapper:  /dev/mapper/$CRYPT_NAME"
echo "  Mount:   $MOUNT_POINT"
echo "════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Generate keyfile ──────────────────────────────────────────────
if [ ! -f "$KEYFILE" ]; then
  echo "[1/6] Generating random keyfile at $KEYFILE ..."
  dd if=/dev/urandom of="$KEYFILE" bs=4096 count=1
  chmod 0400 "$KEYFILE"
else
  echo "[1/6] Keyfile already exists at $KEYFILE — reusing."
fi

# ── Step 2: Format with LUKS ─────────────────────────────────────────────
echo ""
echo "[2/6] Formatting $DEVICE with LUKS (you will be prompted for a passphrase)..."
echo "       This passphrase is your DISASTER RECOVERY key — store it in 1Password."
cryptsetup luksFormat "$DEVICE"

# ── Step 3: Add keyfile as an additional key slot ────────────────────────
echo ""
echo "[3/6] Adding keyfile as LUKS key slot (enter passphrase again)..."
cryptsetup luksAddKey "$DEVICE" "$KEYFILE"

# ── Step 4: Open the LUKS volume ─────────────────────────────────────────
echo ""
echo "[4/6] Opening LUKS volume..."
cryptsetup open --type luks "$DEVICE" "$CRYPT_NAME" --key-file "$KEYFILE"

# ── Step 5: Create filesystem ─────────────────────────────────────────────
echo ""
echo "[5/6] Creating ext4 filesystem on /dev/mapper/$CRYPT_NAME ..."
mkfs.ext4 /dev/mapper/"$CRYPT_NAME"

# ── Step 6: Mount ─────────────────────────────────────────────────────────
echo ""
echo "[6/6] Mounting at $MOUNT_POINT ..."
mkdir -p "$MOUNT_POINT"
mount /dev/mapper/"$CRYPT_NAME" "$MOUNT_POINT"

# ── Post-setup ────────────────────────────────────────────────────────────
echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║  LUKS setup complete.                                ║"
echo "║                                                      ║"
echo "║  Next steps:                                         ║"
echo "║  1. Restore data:                                    ║"
echo "║     rsync -aHAX /tmp/repo-backup/ $MOUNT_POINT/     ║"
echo "║  2. Add to /etc/crypttab for auto-unlock on boot:    ║"
echo "║     echo '$CRYPT_NAME $DEVICE $KEYFILE luks' \\      ║"
echo "║       >> /etc/crypttab                               ║"
echo "║  3. Add to /etc/fstab:                               ║"
echo "║     echo '/dev/mapper/$CRYPT_NAME $MOUNT_POINT \\    ║"
echo "║       ext4 defaults 0 2' >> /etc/fstab               ║"
echo "║  4. Restart containers:                              ║"
echo "║     cd /opt/soundhaus && docker compose up -d        ║"
echo "║  5. Store the passphrase in 1Password!               ║"
echo "╚═══════════════════════════════════════════════════════╝"
