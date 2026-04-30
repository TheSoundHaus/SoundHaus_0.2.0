-- V004_billing.sql
-- Subscriptions + storage usage tracking (Phase 6).
--
-- One row per user. Tier derives from stripe_price_id but is denormalized
-- for fast access-control checks. Free users may have no row at all — the
-- service layer defaults to tier='free'/status='inactive' when missing.

CREATE TABLE IF NOT EXISTS subscriptions (
    user_id                 VARCHAR(255) PRIMARY KEY,
    stripe_customer_id      VARCHAR(255) UNIQUE,
    stripe_subscription_id  VARCHAR(255) UNIQUE,
    stripe_price_id         VARCHAR(255),
    tier                    VARCHAR(16)  NOT NULL DEFAULT 'free',
    status                  VARCHAR(16)  NOT NULL DEFAULT 'inactive',
    current_period_end      TIMESTAMPTZ,
    cancel_at_period_end    INTEGER      NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_subscriptions_customer      ON subscriptions (stripe_customer_id);
CREATE INDEX IF NOT EXISTS ix_subscriptions_subscription ON subscriptions (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS ix_subscriptions_tier          ON subscriptions (tier);

CREATE TABLE IF NOT EXISTS storage_usage (
    user_id     VARCHAR(255) PRIMARY KEY,
    bytes_used  BIGINT       NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
