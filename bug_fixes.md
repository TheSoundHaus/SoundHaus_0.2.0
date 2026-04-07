# Bug Fixes

## `get_public_repos` — N+1 Gitea HTTP calls causing timeout

**Date:** 2026-04-06
**File:** `apps/backend/routers/repos.py` — `get_public_repos`
**Test:** `gitea/public_repos` (exit 1, `httpx.ReadTimeout`)

### Problem

`GET /repos/public` was making one synchronous Gitea HTTP call per public repo inside a `for` loop to fetch `description`, `stars_count`, and `updated_at`. With N repos × up to 15s timeout each, the endpoint easily exceeded the 30s test timeout and would block the async event loop for all concurrent requests.

The specific call was `svc.get_repo_contents(owner, repo_name)` — which fetches the full Gitea file tree just to read 3 fields off the embedded `repository` object.

### Fix

Added `description` (Text) and `stars_count` (Integer) columns to `RepoData`. These are now populated at write time:

- **On repo create** (`POST /repos`): `description` written from `CreateRepoRequest`
- **On repo register** (`POST /repos/register`): `description` written from `RegisterRepoRequest`
- **On settings patch** (`PATCH /repos/{owner}/{repo}/settings`): `description` synced when present in the patch payload
- **On Gitea `repository` webhook**: `description` synced from webhook payload

`get_public_repos` now reads entirely from Supabase — zero Gitea calls. `updated_at` is served from the existing `last_push_at` column. Response time goes from O(N × network) to a single DB query.

---

## `signup` — Missing `display_name` column in Supabase `profiles` table

**Date:** 2026-04-07
**File:** `apps/backend/models/profile_models.py`, `apps/backend/routers/auth.py`

### Problem

`POST /api/auth/signup` returned a 500 Internal Server Error. SQLAlchemy threw `psycopg2.errors.UndefinedColumn: column profiles.display_name does not exist` because the `Profile` model defined a `display_name` column that had never been added to the actual Supabase `profiles` table.

### Fix

Manually added the missing column in the Supabase SQL Editor:

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);
```

A migration script (`migrate_profiles.py`) already existed for this but had not been run against the current database.

---

## Explore feed — Duplicate React keys after adding pagination

**Date:** 2026-04-07
**File:** `apps/web/app/(dashboard)/explore/page.tsx`

### Problem

After adding infinite scroll pagination to the Explore feed, React threw a warning: `Encountered two children with the same key`. When the next page was fetched and appended, overlapping repos (same `gitea_id`) caused duplicate keys in the rendered list.

### Fix

Added deduplication when appending new page results. Before merging, existing `gitea_id` values are collected into a `Set` and only new repos not already present are appended:

```ts
setRepos((prev) => {
    const existing = new Set(prev.map((r) => r.gitea_id));
    const newRepos = result.data!.repos.filter((r) => !existing.has(r.gitea_id));
    return [...prev, ...newRepos];
});
```

---

## Star/unstar — No per-user tracking, no duplicate guards, no rate limit on `limit` param

**Date:** 2026-04-07
**Files:** `apps/backend/routers/repos.py`, `apps/backend/models/profile_models.py`, `apps/web/lib/types/api.ts`, `apps/web/app/(dashboard)/explore/page.tsx`

### Problem

Three related issues with starring:

1. **No per-user tracking** — `PUT /repos/{owner}/{repo}/star` just incremented `stars_count` on `RepoData` with no record of *which* user starred. Double-starring inflated the count, and the Explore feed had no way to show whether the current user had already starred a repo.
2. **No duplicate guards** — nothing prevented the same user from starring the same repo multiple times, each time incrementing the count.
3. **No `limit` cap on `GET /repos/public`** — an attacker could request `?limit=1000000` to cause memory exhaustion.

### Fix

- Created `user_stars` table in Supabase (`user_id` + `gitea_id` composite PK) and added `UserStar` SQLAlchemy model.
- Star/unstar endpoints now insert/delete from `user_stars` with an application-level duplicate check + `IntegrityError` catch for race conditions.
- `GET /repos/public` accepts an optional `Authorization` header; if present, returns `is_starred: bool` per repo via a batch query on `user_stars`.
- Capped `limit` param to max 50 (`limit = min(max(limit, 1), 50)`).
- Frontend `starredIds` set initialized from API response; star button uses optimistic updates with rollback on failure.
