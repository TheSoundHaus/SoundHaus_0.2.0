-- Phase 2 migration: pre-computed Explore ranking column.
--
-- Applied by hand on each environment (dev/staging/prod) via psql:
--     psql $DATABASE_URL -f scripts/migrations/V002_explore_score.sql
--
-- Safe to run multiple times (IF NOT EXISTS guards).

ALTER TABLE repo_data
    ADD COLUMN IF NOT EXISTS explore_score DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ix_repo_data_explore_score
    ON repo_data (explore_score DESC);

-- Seed with a neutral score so ORDER BY works the moment the column lands.
UPDATE repo_data
SET explore_score = COALESCE(stars_count, 0)::double precision
WHERE explore_score = 0;
