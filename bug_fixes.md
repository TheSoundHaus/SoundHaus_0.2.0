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
