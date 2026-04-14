-- ══════════════════════════════════════════════════════════════════════════════
-- SoundHaus — Column-Level Encryption Migration (pgcrypto)
--
-- Encrypts sensitive columns using pgp_sym_encrypt / pgp_sym_decrypt.
-- Run against the Supabase PostgreSQL database.
--
-- BEFORE RUNNING:
--   1. Enable pgcrypto:  CREATE EXTENSION IF NOT EXISTS pgcrypto;
--   2. Set :enc_key to your ENCRYPTION_KEY value (match .env.remote).
--   3. Back up the database.
--   4. Run in a transaction.
--
-- USAGE:
--   psql $DATABASE_URL -v enc_key="'your-secret-key-here'" -f migrate_encryption.sql
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Ensure pgcrypto is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. collaborator_invitations.invitation_token ─────────────────────────────

-- Add encrypted column
ALTER TABLE collaborator_invitations
  ADD COLUMN IF NOT EXISTS invitation_token_encrypted BYTEA;

-- Backfill: encrypt existing plaintext values
UPDATE collaborator_invitations
SET invitation_token_encrypted = pgp_sym_encrypt(invitation_token, :enc_key)
WHERE invitation_token IS NOT NULL
  AND invitation_token_encrypted IS NULL;

-- Verify: count mismatches (should be 0)
DO $$
DECLARE
  mismatch_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM collaborator_invitations
  WHERE invitation_token IS NOT NULL
    AND invitation_token_encrypted IS NULL;
  IF mismatch_count > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % rows missing encrypted value', mismatch_count;
  END IF;
END $$;

-- ── 2. webhook_configs.webhook_secret ────────────────────────────────────────

ALTER TABLE webhook_configs
  ADD COLUMN IF NOT EXISTS webhook_secret_encrypted BYTEA;

UPDATE webhook_configs
SET webhook_secret_encrypted = pgp_sym_encrypt(webhook_secret, :enc_key)
WHERE webhook_secret IS NOT NULL
  AND webhook_secret_encrypted IS NULL;

DO $$
DECLARE
  mismatch_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO mismatch_count
  FROM webhook_configs
  WHERE webhook_secret IS NOT NULL
    AND webhook_secret_encrypted IS NULL;
  IF mismatch_count > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % rows missing encrypted value', mismatch_count;
  END IF;
END $$;

COMMIT;

-- ══════════════════════════════════════════════════════════════════════════════
-- PHASE 2 — Drop plaintext columns (run AFTER verifying FastAPI reads work)
--
-- ALTER TABLE collaborator_invitations DROP COLUMN invitation_token;
-- ALTER TABLE collaborator_invitations RENAME COLUMN invitation_token_encrypted TO invitation_token;
--
-- ALTER TABLE webhook_configs DROP COLUMN webhook_secret;
-- ALTER TABLE webhook_configs RENAME COLUMN webhook_secret_encrypted TO webhook_secret;
-- ══════════════════════════════════════════════════════════════════════════════
