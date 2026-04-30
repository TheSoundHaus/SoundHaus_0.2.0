-- Phase 3 migration: add fork_count to repo_data + index forked_from.
--
-- Apply via:
--     psql $DATABASE_URL -f scripts/migrations/V003_fork_count.sql

ALTER TABLE repo_data
    ADD COLUMN IF NOT EXISTS fork_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS ix_repo_data_forked_from
    ON repo_data (forked_from)
    WHERE forked_from IS NOT NULL;

-- Backfill fork_count from the existing forked_from graph.
WITH counts AS (
    SELECT forked_from AS gitea_id, COUNT(*) AS n
    FROM repo_data
    WHERE forked_from IS NOT NULL
    GROUP BY forked_from
)
UPDATE repo_data r
SET fork_count = c.n
FROM counts c
WHERE r.gitea_id = c.gitea_id
  AND r.fork_count IS DISTINCT FROM c.n;
