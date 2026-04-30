-- V005_marketplace.sql
-- Sample + Collaboration marketplace tables (Phases 5 & 7).
--
-- Idempotent: uses IF NOT EXISTS so re-running is a no-op. Monetary fields
-- are INTEGER cents. Array columns are native PG ARRAY(text).

-- ── Sample Marketplace ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sample_listings (
    id                     VARCHAR(36)  PRIMARY KEY,
    seller_id              VARCHAR(255) NOT NULL,
    title                  VARCHAR(200) NOT NULL,
    description            TEXT,
    price_cents            INTEGER      NOT NULL DEFAULT 0,
    currency               VARCHAR(3)   NOT NULL DEFAULT 'USD',
    r2_object_key          VARCHAR(500) NOT NULL,
    preview_r2_object_key  VARCHAR(500),
    waveform_peaks_json    TEXT,
    duration_seconds       DOUBLE PRECISION,
    bpm                    INTEGER,
    key_sig                VARCHAR(8),
    tags                   TEXT[],
    status                 VARCHAR(16)  NOT NULL DEFAULT 'active',
    purchase_count         INTEGER      NOT NULL DEFAULT 0,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_sample_listings_seller ON sample_listings (seller_id);
CREATE INDEX IF NOT EXISTS ix_sample_listings_status_created_at ON sample_listings (status, created_at);

CREATE TABLE IF NOT EXISTS sample_purchases (
    id                  VARCHAR(36)  PRIMARY KEY,
    listing_id          VARCHAR(36)  NOT NULL REFERENCES sample_listings(id) ON DELETE CASCADE,
    buyer_id            VARCHAR(255) NOT NULL,
    amount_cents        INTEGER      NOT NULL,
    platform_fee_cents  INTEGER      NOT NULL DEFAULT 0,
    payment_intent_id   VARCHAR(255) UNIQUE,
    status              VARCHAR(16)  NOT NULL DEFAULT 'pending',
    refunded_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_sample_purchases_listing ON sample_purchases (listing_id);
CREATE INDEX IF NOT EXISTS ix_sample_purchases_buyer   ON sample_purchases (buyer_id);

-- ── Musician profiles ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS musician_profiles (
    user_id                       VARCHAR(255) PRIMARY KEY,
    headline                      VARCHAR(120),
    bio_md                        TEXT,
    hourly_rate_cents             INTEGER,
    skills                        TEXT[],
    portfolio_repo_ids            TEXT[],
    stripe_connect_account_id     VARCHAR(255) UNIQUE,
    connect_onboarding_complete   BOOLEAN      NOT NULL DEFAULT FALSE,
    accepting_work                BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at                    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Collaboration marketplace ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS collab_listings (
    id                       VARCHAR(36)  PRIMARY KEY,
    buyer_id                 VARCHAR(255) NOT NULL,
    title                    VARCHAR(200) NOT NULL,
    description_md           TEXT         NOT NULL,
    budget_cents             INTEGER      NOT NULL,
    currency                 VARCHAR(3)   NOT NULL DEFAULT 'USD',
    skills_wanted            TEXT[],
    deadline_at              TIMESTAMPTZ,
    status                   VARCHAR(16)  NOT NULL DEFAULT 'open',
    accepted_application_id  VARCHAR(36),
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_collab_listings_buyer  ON collab_listings (buyer_id);
CREATE INDEX IF NOT EXISTS ix_collab_listings_status ON collab_listings (status);

CREATE TABLE IF NOT EXISTS collab_applications (
    id                   VARCHAR(36)  PRIMARY KEY,
    listing_id           VARCHAR(36)  NOT NULL REFERENCES collab_listings(id) ON DELETE CASCADE,
    musician_id          VARCHAR(255) NOT NULL,
    cover_letter_md      TEXT,
    proposed_rate_cents  INTEGER,
    status               VARCHAR(16)  NOT NULL DEFAULT 'submitted',
    payment_intent_id    VARCHAR(255) UNIQUE,
    escrow_status        VARCHAR(16),
    delivery_repo_id     VARCHAR(255),
    delivery_note_md     TEXT,
    delivered_at         TIMESTAMPTZ,
    approved_at          TIMESTAMPTZ,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_application_per_musician UNIQUE (listing_id, musician_id)
);

CREATE INDEX IF NOT EXISTS ix_collab_applications_listing  ON collab_applications (listing_id);
CREATE INDEX IF NOT EXISTS ix_collab_applications_musician ON collab_applications (musician_id);
