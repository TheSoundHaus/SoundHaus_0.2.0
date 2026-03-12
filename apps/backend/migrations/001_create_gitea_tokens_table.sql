-- Migration: Create gitea_tokens table
-- Purpose: Cache Gitea Personal Access Tokens to prevent token sprawl and improve performance
-- Date: 2026-02-26
-- Run this in your Supabase SQL editor or via psql

CREATE TABLE IF NOT EXISTS gitea_tokens (
    -- Primary key
    id VARCHAR PRIMARY KEY,

    -- User reference (Supabase user UUID) - ONE token per user
    user_id VARCHAR NOT NULL UNIQUE,

    -- Token storage (stored in plaintext for Gitea, unlike bcrypt-hashed PATs)
    token_hash VARCHAR NOT NULL,

    -- Token identification (first 8-16 chars for display)
    token_prefix VARCHAR NOT NULL,

    -- Metadata
    token_name VARCHAR NOT NULL,
    scopes VARCHAR,
    created_via VARCHAR NOT NULL DEFAULT 'web',

    -- Lifecycle tracking
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,

    -- Revocation and usage tracking
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    usage_count INTEGER DEFAULT 0
);

-- Create index on user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_gitea_tokens_user_id ON gitea_tokens(user_id);

-- Create partial index for finding active tokens
CREATE INDEX IF NOT EXISTS idx_gitea_tokens_active ON gitea_tokens(user_id, is_revoked)
    WHERE is_revoked = FALSE;

-- Add comments for documentation
COMMENT ON TABLE gitea_tokens IS 'Cached Gitea Personal Access Tokens for git operations';
COMMENT ON COLUMN gitea_tokens.user_id IS 'Supabase user UUID (unique - one token per user)';
COMMENT ON COLUMN gitea_tokens.token_hash IS 'Gitea PAT stored in plaintext (needs to be retrievable for git operations)';
COMMENT ON COLUMN gitea_tokens.token_prefix IS 'First 8-16 characters for identification';
COMMENT ON COLUMN gitea_tokens.created_via IS 'Token origin: web or desktop';
