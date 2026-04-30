# SoundHaus Architecture

> **Audience:** SoundHaus developers studying *Designing Data-Intensive Applications* (Kleppmann) who want a concrete, code-anchored map of how the running system behaves — every claim cites a file and line in this repo.
>
> **Scope:** end-to-end, ground up. How a commit in Gitea becomes a row on the dashboard. Where data lives, who owns it, where it can drift, and which DDIA chapters apply.
>
> This document **consolidates and supersedes** the architectural sections of `SOUNDHAUS.md`, `README.md`, `Final_Design_Document.md`, `docs/hosting-decision.md`, and `docs/lti-integration.md`. Those documents remain authoritative for their respective domains (mission/research, deployment recipes, hosting thresholds, LTI handshake); this one is the single place to look up *how the system actually moves data*.

---

## Table of Contents

1. [Bird's-Eye View: Three Apps, Two Sources of Truth](#1-birds-eye-view)
2. [Component Inventory](#2-component-inventory)
3. [The Hot Path: Pushing a Commit, End to End](#3-the-hot-path-pushing-a-commit-end-to-end)
4. [Backend Anatomy: Routers → Services → Data](#4-backend-anatomy)
5. [Data Structures (Supabase Schema)](#5-data-structures-supabase-schema)
6. [Frontend Data-Fetching Architecture](#6-frontend-data-fetching-architecture)
7. [DDIA Lens: Replication, Consistency, Partitioning, Faults](#7-ddia-lens)
8. [Known Bottlenecks, Race Conditions, Scaling Cliffs](#8-known-bottlenecks)
9. [Quick Reference: Where Things Live](#9-quick-reference)

---

## 1. Bird's-Eye View

SoundHaus is a Git-backed version control system for Ableton Live projects. Three apps consume one shared backend.

```
┌─────────────────┐                                        ┌──────────────────────┐
│  Desktop App    │                                        │     Web App          │
│  Electron+React │                                        │     Next.js          │
│                 │ ── git clone/push/pull (HTTPS) ──┐     │                      │
│                 │   bypasses FastAPI entirely      │     │ ─ HTTPS Server Comp ─┤
│  src/electron   │                                  │     │   apps/web/app/      │
└────────┬────────┘                                  │     └─────────┬────────────┘
         │                                           │               │
         │  HTTPS (audio uploads, snippets,          │               │ HTTPS w/ cookies
         │  diff posts, register, etc.)              │               │ apps/web/lib/utils/auth.ts:102
         │                                           │               │
         ▼                                           ▼               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          FastAPI (Uvicorn)                                   │
│                          apps/backend/main.py                                │
│   routers/   ── thin handlers ──┐                                            │
│   services/  ── business logic   │                                           │
│   models/    ── Pydantic + ORM ──┴── dependencies.py (auth, DB, rate limit)  │
└─────┬──────────────────────────────────────┬─────────────────────────────────┘
      │                                      │
      │ SQLAlchemy / Postgres protocol       │ HTTPS REST (Gitea API)
      ▼                                      ▼
┌────────────────────┐                ┌──────────────────────────┐
│  Supabase          │                │  Gitea (DigitalOcean)    │
│  Postgres + Auth   │                │  Self-hosted Git server  │
│                    │                │  + Git LFS               │
│  Tables:           │   webhook ────►│  + Cloudflare R2 (LFS)   │
│  profiles,         │   pushes,      │                          │
│  repo_data,        │   creates,     │  Source of truth for:    │
│  commit_details,   │   forks etc.   │  - branches, refs        │
│  push_events,      │                │  - actual commits        │
│  als_diffs,        │                │  - file content          │
│  invitations…      │                │  - clone permissions     │
└────────────────────┘                └──────────────────────────┘
```

**Two sources of truth.** This is the single most important fact about the system.

| Concept | Truth in Gitea | Truth in Supabase |
|---|---|---|
| Refs / commit graph / file blobs / LFS objects | ✅ canonical | ❌ never |
| Repo permissions (collaborator, private) | ✅ canonical | ⚠️ shadow (CollaboratorInvitation table) |
| Audio snippet / thumbnail / genres / clone count | ❌ unaware | ✅ canonical |
| Commit metadata for fast listing (`commit_details`) | ❌ slow API | ✅ derived cache (populated by webhook) |
| User identity | ❌ Gitea login is just the Supabase UUID | ✅ canonical (`profiles.id`, `profiles.username`) |

Because the same logical entity ("Nathan's repo `tape-chops`") lives in both stores, **every read or write that crosses the boundary is a chance for them to disagree**. This is the heart of every sync bug in this codebase. DDIA Chapter 5 ("Replication") is the right mental model — Gitea and Supabase are leaderless replicas of overlapping state, and FastAPI is the conflict-resolution layer.

---

## 2. Component Inventory

### `apps/desktop/` — Electron + React

The day-to-day user tool. Bundles its own git binaries.

- Main process: `apps/desktop/src/electron/main.ts`
- IPC handlers: `apps/desktop/src/electron/{home,login,project}.ts`
- Renderer pages: `apps/desktop/src/pages/`
- Native semantic-diff module: `apps/desktop/native/semantic-diff/` (Rust)
- **Critical invariant:** `git clone`, `git push`, `git pull` go directly to Gitea over HTTPS. FastAPI is *not* in that path. This is the "git-as-proxy" pattern (`Final_Design_Document.md` §201).
- After a successful local push, the desktop posts an `AlsDiff` JSON to FastAPI at `POST /repos/{owner}/{repo}/diff` (`apps/backend/routers/commits.py:219-341`) so the web UI can render semantic-diff visualizations without re-running the Rust engine in-browser.

### `apps/web/` — Next.js 16 (App Router)

Read-only surface for repositories, plus social discovery and user/repo settings.

- Routes: `apps/web/app/`
  - `(auth)/`: login, signup, forgot-password
  - `(dashboard)/`: dashboard, explore, repository, profile, classroom (WIP), marketplace (WIP), settings/billing (WIP)
  - `clone/[owner]/[repo]/`: deep-link target for desktop clone
  - `s/[owner]/[repo]/`: shareable public link
- Server-only data fetcher: `apps/web/lib/utils/auth.ts:102` (`authenticatedFetch`)
- Public typed API surface: `apps/web/lib/api/{repos,commits,webhooks,profile,…}.ts`
- TypeScript types mirror backend: `apps/web/lib/types/api.ts`
- **Critical invariant:** `API_URL` is *server-only*. There is no `NEXT_PUBLIC_` variant. Every backend call must run inside a Server Component, Server Action, or Route Handler so cookies are read from the request, not the client (`apps/web/lib/utils/auth.ts:9-12`).

### `apps/backend/` — FastAPI (Uvicorn)

The mediator. ~20 routers, ~14 services.

- App assembly: `apps/backend/main.py:48` (creates `FastAPI()`, registers middleware + routers).
- Routers (thin handlers, decorated with `@router.<method>`): `apps/backend/routers/{auth,repos,commits,collaborators,reviews,snippets,audio,webhooks,dashboard,desktop,genres,health,admin,billing,classroom,lti,marketplace}.py`
- Services (business logic): `apps/backend/services/{auth,gitea,repo,review,snippet,demucs,webhook,pat,profile,redis,crypto,billing,classroom,lti,marketplace}_service.py`
- ORM models: `apps/backend/models/*.py`
- Cross-cutting deps: `apps/backend/dependencies.py` (auth, DB session, rate limiter, `require_repo_access`, `resolve_owner_id`)
- Settings (env-loaded): `apps/backend/config.py`
- DB connection: `apps/backend/database.py`

### Other moving parts

- `gitea/` — bind-mount data dir for the local Gitea container.
- `workers/stem_worker/` — Demucs stem-separation worker, polls the API for jobs.
- `apps/token-broker/` — micro-service that mints scoped Gitea tokens for the desktop app on demand (so the desktop never holds the admin token).
- `docker-compose.yml` — single-machine stack: `gitea_db` (Postgres for Gitea), `gitea`, `redis`, `fastapi`, `worker`, `token-broker`. Web frontend runs separately (Vercel in prod, `npm run dev` in local dev).

---

## 3. The Hot Path: Pushing a Commit, End to End

This is the answer to your prompt's question: *"How does a commit in our Gitea instance make its way through FastAPI, get reconciled with Supabase user data, and render on the Next.js frontend?"*

### Step 1 — User pushes from the desktop app

The desktop spawns the bundled `git push` against `https://git.thesound.haus/<owner-uuid>/<repo>.git`. Authentication uses a personal access token minted by `apps/backend/services/pat_service.py` (broker pattern).

**Gitea is the leader for this write.** Once the receive-pack succeeds, the new ref is canonical. FastAPI has no involvement.

### Step 2 — Gitea fires a webhook

The webhook was registered when the repo was created (`apps/backend/services/webhook_service.py:440-520`). Subscribed events: `push`, `create`, `delete`, `repository`, `fork`. The webhook URL is `${WEBHOOK_BASE_URL}/api/webhooks/gitea` (e.g. `https://api.thesound.haus/api/webhooks/gitea`). Each delivery is signed HMAC-SHA256 with `GITEA_WEBHOOK_SECRET`.

### Step 3 — FastAPI receives and validates

Entry point: `apps/backend/routers/webhooks.py` → `webhook_service.process_event(...)` (`apps/backend/services/webhook_service.py:68`).

1. Validate HMAC-SHA256 signature — `validate_signature` (line 29). Constant-time comparison against the configured secret. **DDIA: Chapter 4, "Encoding and evolution"** — we never trust the wire.
2. Persist a `WebhookDelivery` row with `processing_status='pending'` (line 107) for **at-least-once** durability.
3. Route to the appropriate handler based on event type (line 132).

### Step 4 — `_handle_push` reconciles into Supabase

`apps/backend/services/webhook_service.py:167`. For each commit in the push:

1. Look up `RepoData` by `gitea_id` (`{owner}/{repo}`).
2. **If RepoData is missing**, auto-create a minimal row from the webhook payload's `repository.owner.login` and `repository.private` flag (lines 199-235; this is the fix from commit `c93e016`). Before this fix, the event was silently dropped — the source of every "commits don't show up on the web" report.
3. Insert one `PushEvent` row (line 199-208) and one `CommitDetail` row per commit (line 213-238). `CommitDetail.diff_pending = "pending"` if any `.als` file changed — the desktop will post the actual diff later.
4. Refresh `RepoData.total_commits` by **live-querying Gitea's commit count** (`get_commit_count` in `repo_service.py:660-684`). This is a deliberate write-amplification trade-off: every push pays one extra Gitea round-trip in exchange for an authoritative commit count we can read cheaply forever.
5. Set `last_push_at`, `last_activity_at`, `needs_update`, `last_push_commit_sha` on `RepoData`.

`db.commit()` runs once at the end of `process_event` (line 150). The whole webhook delivery is one transaction. If anything raises, `processing_status = "failed"` and the row stays for forensics.

### Step 5 — Desktop posts the semantic diff

After the push succeeds, the Rust engine (`apps/desktop/native/semantic-diff/`) computes a structured diff between the parent and new tree, and the desktop posts:

```
POST /repos/{owner}/{repo}/diff
Authorization: Bearer <PAT>
{ "commit_sha": "...", "before_sha": "...", "diff_data": { "tracks": [...] }, ... }
```

Handled at `apps/backend/routers/commits.py:219-341`. Behaviour:

1. Upsert into `als_diffs` keyed by `(repo_id, commit_sha)`.
2. Flip the corresponding `commit_details.diff_pending` from `"pending"` → `"ready"` (line 311-320).
3. Mark all *older* pending commits in this repo as `"none"` (line 322-339), because the desktop only generates a diff for HEAD; older commits that touched `.als` would otherwise stay `"pending"` forever.

### Step 6 — Web reads the data

User opens the repository page. The page is a Next.js Server Component:

```17:34:apps/web/app/(dashboard)/repository/[owner]/[repo]/page.tsx
export default async function RepositoryPage({ params }: { params: Promise<Params> }) {
  const { owner, repo } = await params;
  const [statsRes, activityRes, eventsRes, snippetRes, genresRes, commitsRes, stemsRes, ownerProfileRes] =
    await Promise.all([
      getRepoStats(owner, repo),
      getRepoActivity(owner, repo),
      getRepoEvents(owner, repo),
      getSnippetMetadata(owner, repo),
      getAllGenres(),
      getCommits(owner, repo, 1, 20),
      getLatestStems(owner, repo),
      getPublicProfile(owner),
    ]);
```

Eight requests fan out in parallel. Each goes through `authenticatedFetch` (`apps/web/lib/utils/auth.ts:102`), which:

1. Reads `sb-access-token` from cookies.
2. Refreshes the token if missing or expired (`tryRefreshToken`, line 70).
3. Sends `Authorization: Bearer <token>` to FastAPI.
4. **Defaults `cache: 'no-store'`** (line 130, fix from commit `c93e016`) so server components always see fresh data. Callers that *want* caching pass `cache:` or `next:` in `options`.
5. Retries once on 401 with a refreshed token.

### Step 7 — Backend reads from Supabase, embellishes from Gitea

`GET /repos/{owner}/{repo}/stats` (`apps/backend/routers/repos.py:692-`):

1. `resolve_owner_id` (`dependencies.py:86`) maps a `username` URL segment to the `Profile.id` (Supabase UUID), since Gitea logins are UUIDs but URLs use human names.
2. Look up `RepoData` by `{owner_id}/{repo}`.
3. Look up the last 10 `CloneEvent` rows; batch-resolve `user_id → username` from `profiles`.
4. Best-effort GET to Gitea for description/privacy/stars (degrades to cached values if Gitea is unreachable).
5. Compute viewer-aware fields (`viewer_can_clone`, `viewer_pending_invite`) only if a bearer token was attached (`_optional_caller`, `routers/repos.py:631-647`).
6. Return a single JSON object that matches the `RepoStats` TypeScript type (`apps/web/lib/types/api.ts:106`) field-for-field.

`GET /repos/{owner}/{repo}/commits?page=1&limit=20` (`routers/commits.py:41-152`):

1. Authorization gate via `require_repo_access` (`dependencies.py:192`).
2. Read directly from `commit_details` (no Gitea call). Pagination via `OFFSET/LIMIT`.
3. Batch-resolve author profiles by email, then by username, then by UUID.
4. Compute `diff_status ∈ {"none","pending","ready"}` per commit.

### Step 8 — Frontend renders

`apps/web/app/(dashboard)/repository/[owner]/[repo]/RepoDetailClient.tsx` is a Client Component. It receives all eight server-side payloads as props, deduplicates commits by SHA, and renders:

- Stats grid (`RepoDetailClient.tsx:651-674`): clone count, push count, genre count.
- Recent activity feed.
- README markdown (lazy-loaded the first time the Overview or Settings tab opens, `RepoDetailClient.tsx:242-253`).
- Snapshot history with optional diff expansion.
- Polls `/diff-status` every 3 s for any commit with `diff_status='pending'`, with a 2-minute total timeout (`RepoDetailClient.tsx:421-481`).

### What can go wrong on this path?

| Step | Failure mode | What it looks like to the user | Mitigation in current code |
|---|---|---|---|
| 2 → 3 | Webhook never delivered (network, secret rotated) | Stale stats forever | None. Recommendation: add a periodic reconciler that calls `/admin/backfill-commits` |
| 3 | HMAC mismatch | Delivery rejected, log line `webhook_invalid_signature` | Constant-time compare; check the secret matches `GITEA_WEBHOOK_SECRET` in both Gitea hook config and backend env |
| 4 | RepoData missing at the time of push | **Fixed in `c93e016`** — auto-creates from payload | Was: silent drop |
| 4 | Gitea `get_commit_count` 5xx | `total_commits` falls back to `existing_count + len(commits)` (`webhook_service.py:247`). May drift if pushes mix with errors. | `/repos/{owner}/{repo}/stats/sync-check` surfaces drift; admin can run backfill |
| 5 | Desktop diff post fails | Commit shows up but `diff_status='pending'` until 2-minute polling timeout | UI degrades to "Processing…" badge (`RepoDetailClient.tsx:1015-1019`) |
| 6 | Stale Next.js Data Cache | **Fixed in `c93e016`** — `cache:'no-store'` default | Was: ambiguous depending on Next.js version |
| 7 | Gitea unreachable | `/stats` returns cached `description`, `is_private` defaults to `True`, `stars_count` from `RepoData.stars_count` | `try: ... except: pass` at `routers/repos.py:735-744` |

---

## 4. Backend Anatomy

### Layering invariant

> **Routers are thin. Services own logic. Models own data.**

This is enforced by convention, documented in `CLAUDE.md`:

> Route handlers are thin — business logic belongs in `services/`, not in `routers/`.

When a router does anything beyond authn/authz, parameter parsing, calling one or two services, and shaping the response, it's a code-smell. The `collaborators.py` regression we discarded earlier in this branch's lifecycle was a textbook case — it had inlined SQL and email-normalization helpers that should have lived in a `CollaboratorService`.

### Router → Service map

| Router | Lines | Owns | Primary services |
|---|---|---|---|
| `auth.py` | ~ | login, signup, refresh, logout, password reset | `auth_service` |
| `repos.py` | 1146 | repo CRUD, stats, public listing, fork, star, README, thumbnail | `repo_service`, `gitea_service`, `webhook_service` |
| `commits.py` | 443 | commit list, commit detail, diff post/get, diff-status polling | `repo_service` (only for `get_commit_count`) |
| `collaborators.py` | ~340 (post-hardening) | invite, list, accept/decline, remove | `repo_service`, `gitea_service`, `profile_service` |
| `webhooks.py` | ~ | Gitea webhook ingestion + activity/events read endpoints | `webhook_service` |
| `snippets.py` | ~ | audio snippet upload, history, replace | `snippet_service` (Supabase storage) |
| `audio.py` | ~ | waveform generation | (workers) |
| `desktop.py` | ~ | desktop login link, PAT issuance | `pat_service` |
| `dashboard.py` | ~ | dashboard tiles, social feed | `repo_service`, custom queries |
| `genres.py` | ~ | genre list + per-repo genre tags | (direct ORM) |
| `health.py` | ~ | `/`, `/health` | none |
| `admin.py` | 121 (new) | recompute explore scores, backfill commits | scripts/* (lazy-imported) |
| `lti.py` | ~ (WIP) | Canvas LTI 1.3 OIDC login + launch + AGS + NRPS | `lti_service` |
| `classroom.py` | ~ (WIP) | classrooms, assignments, submissions | `classroom_service` |
| `marketplace.py` | ~ (WIP) | sample listings, collab requests | `marketplace_service` |
| `billing.py` | ~ (WIP) | Stripe Checkout/Portal, webhooks, storage usage | `billing_service` |
| `reviews.py` | ~ | review sessions, annotations | `review_service` |

### Anatomy of one route — `GET /repos/{owner}/{repo}/stats`

Walking the seven-line callable chain top-to-bottom is the best way to understand the layering:

```python
@router.get("/repos/{owner}/{repo}/stats")            # 1. URL binding
@limiter.limit("60/minute")                            # 2. Rate limiting (Redis-backed via SlowAPI)
async def get_repo_stats(
    request: Request,
    owner: str, repo: str,
    db: Session = Depends(get_db),                     # 3. Per-request DB session
):
    caller_id, caller_email = await _optional_caller(request)  # 4. Soft auth
    owner_id = resolve_owner_id(owner, db)              # 5. URL-username → UUID
    repo_data = db.query(RepoData)... .first()         # 6. ORM read (no service indirection here — small enough)
    ...                                                 # 7. Compose response
```

For routes that mutate (e.g. `POST /repos`) the flow is the same but step 6 calls a service which calls Gitea + DB inside a try/except, and the router does no SQL of its own. See `routers/repos.py:99-143` for the canonical example.

### Auth guards

Three flavours, picked per-route:

- `Depends(verify_token)` — strict, requires Supabase JWT. Used for any user-mutating endpoint. (`dependencies.py`)
- `Depends(verify_token_or_pat)` — accepts JWT *or* a desktop-issued personal access token. Used by endpoints the desktop calls (e.g. `POST /repos/{owner}/{repo}/diff`, `POST /repos/register`).
- `_optional_caller(request)` — duck-typed Authorization parsing that *doesn't* fail if the header is missing. Used by public endpoints that have viewer-aware fields (e.g. `/stats`, `/commits`).

Plus `require_repo_access(owner, repo, caller_id, caller_email, db)` (`dependencies.py:192-...`) which encodes the privacy rule: **public repos are world-readable; private repos are accessible only to owner or accepted invitee. Unauthorized access returns 404, not 403, to avoid leaking existence.** This is a textbook DDIA Chapter 12 ("Future of data systems") consideration — exposing 403 vs 404 is itself a side-channel.

### Rate limiting

Two limiters, both backed by Redis:

- `limiter` — per-IP (anonymous routes)
- `user_limiter` — per-authenticated-user-id (logged-in routes)

Defined in `dependencies.py`. Decorators applied per-route. SlowAPI middleware registers global handler at `main.py:53`. **DDIA Chapter 8** ("The trouble with distributed systems") — without Redis backing, two FastAPI replicas would each hold independent counters, halving the effective rate limit.

### Logging

`logging_config.get_logger(__name__)` returns a structlog-compatible logger. Every log line is structured (key=value), never f-strings, so it can be ingested into Grafana Cloud without parsing tricks. **Never log PII or tokens** (CLAUDE.md rule).

---

## 5. Data Structures (Supabase Schema)

All app tables live in Supabase. Gitea has its own Postgres for refs, blobs, and Gitea's own user table.

### Core tables

| Table | Model | Purpose |
|---|---|---|
| `profiles` | `Profile` (`models/profile_models.py:7`) | App-side user profile. PK = Supabase auth UUID. Holds `username`, `email`, `avatar_url`, social links. |
| `repo_data` | `RepoData` (`models/repo_models.py:9`) | Aggregate metadata per repo. PK = `gitea_id` (`{owner_uuid}/{repo-name}`). Holds clone counts, snippet URL, thumbnail, genres FK, README, fork lineage, push tracking, explore score. |
| `commit_details` | `CommitDetail` (`models/commit_models.py:13`) | One row per commit, populated by `_handle_push`. Holds SHA, message, author, files-touched, `diff_pending`. |
| `push_events` | `PushEvent` (`models/webhook_models.py:78`) | One row per Gitea push delivery. Parent of `commit_details` (`push_event_id` FK). |
| `repository_events` | `RepositoryEvent` (`models/webhook_models.py:124`) | Branch/tag create/delete + repo-lifecycle events for the timeline. |
| `webhook_deliveries` | `WebhookDelivery` (`models/webhook_models.py:44`) | Audit log of every webhook hit (`pending`/`success`/`failed`). |
| `webhook_configs` | `WebhookConfig` (`models/webhook_models.py:159`) | Per-repo webhook secret + Gitea hook id. One-to-one with `RepoData`. |
| `als_diffs` | `AlsDiff` (`models/diff_models.py:13`) | Semantic diff JSON keyed by `(repo_id, commit_sha)`. Posted by desktop. |
| `clone_events` | `CloneEvent` (`models/clone_models.py:11`) | Per-user-per-repo first-clone events; drives `clone_count`. |
| `genre_list`, `repo_genres` | `GenreList`, association table | Many-to-many between `repo_data` and a fixed genre list. |
| `collaborator_invitations`, `collaboration_requests` | `CollaboratorInvitation`, `CollaborationRequest` (`models/invitation_models.py`) | Pending/accepted invites + open-to-collab requests. |
| `review_sessions`, `review_annotations` | `ReviewSession`, `ReviewAnnotation` (`models/review_models.py`) | Async producer-review feature (timestamped audio comments). |
| `snippet_history` | `SnippetHistory` (`models/snippet_models.py`) | Versioned snippets for rollback. |
| `personal_access_tokens` | `PersonalAccessToken` (`models/pat_models.py`) | Desktop tokens. Hashed at rest via `pgcrypto` (Phase ? on `experimental-changes`). |
| `user_repo_seen` | `UserRepoSeen` (`models/seen_models.py`) | Tracks which repo updates each user has dismissed in the dashboard. |

### Tables added on `experimental-changes` (uncommitted WIP)

| Table | Model | Purpose | Migration |
|---|---|---|---|
| `subscriptions` | `Subscription` (`models/billing_models.py:17`) | Stripe sub state per user. | `V004_billing.sql` |
| `storage_usage` | `StorageUsage` (`models/billing_models.py:39`) | Per-user byte count for tier enforcement. | `V004_billing.sql` |
| `sample_listings` | `SampleListing` (`models/marketplace_models.py:40`) | Listed sample packs. | `V005_marketplace.sql` |
| `sample_purchases` | `SamplePurchase` (`models/marketplace_models.py:76`) | Stripe Connect ledger. | `V005_marketplace.sql` |
| `musician_profiles` | `MusicianProfile` (`models/marketplace_models.py:106`) | Producer-for-hire profile. | `V005_marketplace.sql` |
| `collab_listings`, `collab_applications` | `CollabListing`, `CollabApplication` (`models/marketplace_models.py:132,158`) | Collab marketplace. | `V005_marketplace.sql` |
| `classrooms`, `classroom_members`, `assignments`, `submissions` | `Classroom`, `ClassroomMember`, `Assignment`, `Submission` (`models/classroom_models.py`) | LMS-adjacent assignment workflow. | `V006_classroom_lti.sql` |
| `lti_deployments`, `lti_users` | `LtiDeployment`, `LtiUser` (`models/classroom_models.py:132,162`) | LTI 1.3 issuer/client/deployment registry + identity bridge. | `V006_classroom_lti.sql` |

### Indexing decisions worth knowing

- `repo_data.owner_id` — index. Drives "my repos" listings.
- `repo_data.forked_from` — index (added in `V003_fork_count.sql`). Partial index `WHERE forked_from IS NOT NULL` for "my forks" and "remixes of X" queries.
- `repo_data.explore_score` — index (added in `V002_explore_score.sql`). Pre-computed by `scripts/recompute_explore_scores.py` every ~15 min and read by the Explore page sort-by-trending. **DDIA Chapter 11** ("Stream processing") — this is a materialized view in disguise.
- `commit_details.repo_id` + `commit_details.sha` — separate indexes. `repo_id` drives the per-repo listing; `sha` drives the SHA lookup endpoint (which supports prefix lookups).
- `push_events.repo_id` — index. Drives the activity tab.
- `webhook_deliveries.repo_id` — index, plus a unique constraint on `signature` (delivery id) to make the webhook handler idempotent.

### What's NOT in the schema by design

- **No commit blob storage**, no per-commit diff payload other than `als_diffs`. Gitea owns blobs. Re-cloning the repo is the disaster-recovery story for everything but the structured diff JSON.
- **No user passwords**. Supabase Auth owns identity. The backend only ever receives a Supabase JWT.
- **No long-lived sessions** in the backend DB. Sessions are signed JWTs; the backend is stateless.

---

## 6. Frontend Data-Fetching Architecture

### Server-first by default

Every backend call originates from a Server Component, Server Action, or Route Handler. The reasons:

1. **`API_URL` is server-only** — no `NEXT_PUBLIC_` variant exists. (`README.md:44` documents this.)
2. **The Supabase access token lives in an `httpOnly` cookie** (`apps/web/lib/utils/auth.ts:37-43`). Client JS literally cannot read it.
3. **The Supabase service-role key is FastAPI-only** (`CLAUDE.md` rule). The web app never holds it.

This rules out client-side `fetch()` against the API — by construction, not by convention.

### `authenticatedFetch` is the *only* network primitive

```102:152:apps/web/lib/utils/auth.ts
export async function authenticatedFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  let token = await getAccessToken()
  const API_BASE_URL = process.env.API_URL || 'http://localhost:8000'

  if (!token) { token = await tryRefreshToken() ?? undefined }

  const isFormData = options.body instanceof FormData
  const headers: Record<string, string> = {
    ...options.headers as Record<string, string>,
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  }
  if (!isFormData) { headers['Content-Type'] = 'application/json' }
```

Every typed wrapper in `apps/web/lib/api/*.ts` ultimately calls this. That centralization is what made the cache fix in commit `c93e016` a one-line patch instead of touching 30 files. **DDIA Chapter 4** (encoding evolution): a single network primitive lets you change wire-level concerns (auth, tracing, retry, cache) without touching callers.

### Type-mirror discipline

Every backend response shape has a corresponding TS interface in `apps/web/lib/types/api.ts`. The pre-fix `RepoStats` type declared fields the backend didn't emit; the fix backfilled the backend so the types and reality agreed (`RepoStats`, lines 106-148). When you add a new endpoint, add the type *first*, then the backend, then the wrapper — that order forces you to specify the contract before you implement either side.

### Server Actions for mutations

Mutations live in `apps/web/actions/*.ts` — true Next.js Server Actions, callable from a `<form action={...}>` or `useTransition`. Examples in this codebase: `forkRepoAction`, `deleteRepoAction`, `renameRepoAction`, `updateVisibilityAction`, `inviteCollaboratorAction`. They wrap the `lib/api/` calls + `revalidatePath()` so the next render sees the new state.

### Client-side polling for diff status

The single piece of legitimate client-side polling is `getDiffStatus` (`lib/api/commits.ts:99-110`), invoked every 3 s from `RepoDetailClient.tsx:441-478` for commits with `diff_status='pending'`. Stops after 2 minutes per pending batch. **DDIA Chapter 11** — this is a poor man's stream replacement. A WebSocket / SSE pushed update would be cleaner, but the API call is rate-limited at 120/minute and the worst case is 40 polls per repo view.

---

## 7. DDIA Lens

This section maps SoundHaus's design choices onto Kleppmann's chapters. If you're reading the book, this is the section to revisit per chapter.

### Chapter 1 — Reliability, Scalability, Maintainability

- **Reliability through narrow blast radius:** Gitea owning git, Supabase owning identity, FastAPI owning glue. A Supabase outage takes down auth and dashboard reads but not a desktop `git push` (because git goes direct to Gitea over the SSH/HTTPS port). A Gitea outage takes down clone/push but not the social feed (which reads from Supabase).
- **Operational maintainability through file-level boundaries:** routers/services/models is enforced by code review and by `CLAUDE.md`'s "do not edit more than 2 files at a time" rule, which exists specifically to keep changes reviewable.

### Chapter 2 — Data Models

We have **two** data models that overlap:

- Gitea's **document graph** model: refs → commits → trees → blobs → LFS pointers. Append-mostly. Source of truth for code.
- Supabase's **relational** model: `repo_data` linked to `commit_details`, `push_events`, `clone_events`, `genres`, `als_diffs`. Source of truth for everything Gitea doesn't model.

The bridge is `RepoData.gitea_id = "{owner_uuid}/{repo_name}"`, treated as a foreign key into Gitea. **There is no FK constraint** because Gitea is a different system — referential integrity is enforced by the application layer (the webhook handler creates the row; deleting the repo cleans up via SQLAlchemy's `cascade="all, delete-orphan"` in `repo_models.py:83-110`).

### Chapter 3 — Storage & Retrieval

- **B-tree indexes** on `repo_data.owner_id`, `repo_data.forked_from`, `repo_data.explore_score`, `commit_details.repo_id`, `commit_details.sha`. No LSM or columnar storage in play.
- **Materialized aggregate** — `repo_data.total_commits`, `clone_count`, `fork_count` are denormalized counters maintained by event handlers (`webhook_service` for `total_commits`, `routers/repos.py:record_clone_event` for `clone_count`). The price is consistency drift; the fix is `/admin/backfill-commits` and `/repos/{owner}/{repo}/stats/sync-check`.
- **Pre-computed ranking score** — `repo_data.explore_score`, recomputed every ~15 min by a cron-style endpoint (`scripts/recompute_explore_scores.py`). This is a periodic batch job, not a streaming aggregation. Trade-off documented in `docs/hosting-decision.md`: "explore score reduces /repos/public latency" — a cache that's allowed to be 15 minutes stale.

### Chapter 4 — Encoding and Evolution

- All API I/O is JSON. Pydantic validates inbound; FastAPI auto-serializes outbound (no manual `json.dumps`).
- **Schema evolution rule we got wrong before commit `c93e016`:** when the TypeScript `RepoStats` interface added `total_commits`, `stars_count`, `fork_count` (etc.), the backend was never updated to emit them. The TS compiler is happy with optional fields being `undefined`, so the bug shipped. **Lesson:** treat `apps/web/lib/types/api.ts` as the contract and use a CI check (or runtime endpoint comparison) to verify the backend honours every required field. We're not there yet.
- HMAC on Gitea webhooks (`webhook_service.py:29-66`) is the only cryptographic encoding decision in the system today. The pgcrypto-backed PAT encryption added on `experimental-changes` is the second.

### Chapter 5 — Replication

This is the chapter that explains every sync bug we have.

| Concept | Where it appears |
|---|---|
| **Single-leader replication** | Gitea is the single leader for git refs. The desktop pushes; the webhook ships an event log to Supabase replicas. |
| **Replication log** | `webhook_deliveries` is literally that — every event, signed and ordered by delivery id. |
| **Followers behind** | `repo_data.total_commits` lags Gitea by however long the webhook took to land + process. With the auto-create fix it's at-most-once-fail, at-least-once-eventually. |
| **Read-your-writes consistency** | We don't guarantee it. After a desktop push, the desktop already-knows the new SHA and can show "Pushed!" but the web won't until the webhook lands. The 3-second polling in `RepoDetailClient.tsx` masks this on the diff side; for everything else there's no synchronous read-after-write barrier. |
| **Conflict resolution** | LWW-ish — webhook handler trusts the latest payload over cached state. For `RepoData.total_commits` we deliberately re-query Gitea (line 246) to get the authoritative value, falling back to additive-counter only if Gitea is down. |
| **Failure of replication** | The `_handle_push` "drop on missing RepoData" bug we fixed in `c93e016` was a replication failure that *silently* dropped events. Now we backfill the missing replica state (`repo_data` row) from the event payload. |

### Chapter 6 — Partitioning

Today: **no partitioning**. One Postgres database (Supabase), one Gitea instance, one FastAPI process (single Droplet, optionally horizontally scaled behind a Load Balancer per `docs/hosting-decision.md`). All data fits on one node by orders of magnitude. The hosting decision doc explicitly defers Kubernetes/sharding until thresholds in `docs/hosting-decision.md:28-38` fire.

If we ever need to partition, the natural sharding key is `owner_id` because:

- 99% of queries already filter by it (`repo_data.owner_id`, `commit_details.repo_id` which begins with owner UUID).
- It keeps a user's content co-located so cross-shard reads are rare.
- Foreign keys (genres, push_events, etc.) all live within a `repo_id` which lives within an owner — no cross-shard joins required.

The Explore page is the one query that *would* require scatter/gather across shards because it ranks all public repos globally. That's why `explore_score` is pre-computed — a partitioned future is easier when the ranking is already a denormalized column.

### Chapter 7 — Transactions

- Every webhook delivery is one DB transaction (`webhook_service.process_event`, lines 132-165). Either all the `PushEvent` + `CommitDetail` rows commit, or none do.
- Most read endpoints are non-transactional snapshots — fine because the data is mostly immutable (commits never change).
- **One known anomaly:** `record_clone_event` (`routers/repos.py:310-349`) increments `repo_data.clone_count` and inserts `CloneEvent` in the same transaction, but uses `IntegrityError` from a unique-constraint violation as a "first time / not first time" signal. If the `CloneEvent` insert succeeds and the increment fails, we'd double-count on retry. Low impact — clone_count is cosmetic — but worth a refactor to row-level locking (`SELECT ... FOR UPDATE`) eventually.

### Chapter 8 — The Trouble with Distributed Systems

Concrete, current pain points:

- **Webhook delivery is at-most-once from Gitea's perspective** but Gitea retries on 5xx, so it's effectively at-least-once. The handler is idempotent for `commit_details` (PK is the commit SHA + repo) but NOT for `push_events` (auto-id PK). Today this means a duplicate webhook delivery would create a duplicate `push_events` row that points to the same commits. Cosmetic; could be fixed with a unique constraint on `(repo_id, after_sha)`.
- **Clock drift** — we trust commit timestamps from the webhook payload. If a developer's machine is wildly out of sync, sort-order on the timeline can be wrong. We don't currently fall back to a server-stamped `received_at`.
- **Network partitions between FastAPI and Gitea** — a `try/except` swallows the error in many places (e.g. `routers/repos.py:735-744`). The page renders with cached values. The user has no way to know.

### Chapter 9 — Consistency & Consensus

Outside the scope of single-machine SoundHaus today. We don't run consensus protocols anywhere. If we ever go multi-region, the natural place to introduce them is around the LTI deployments table (Canvas tenants) and Stripe subscription state — both of which are external-source-of-truth and need exactly-once update semantics.

### Chapter 10 — Batch Processing

- `scripts/backfill_commits.py` walks every repo, calls Gitea, and inserts missing `commit_details`. Run via the new `/admin/backfill-commits` endpoint.
- `scripts/recompute_explore_scores.py` recomputes ranking. Run via `/admin/recompute-explore-scores`.
- These are both **idempotent** by design — re-running them is safe.

### Chapter 11 — Stream Processing

The webhook pipeline is a stream processor in disguise:

- **Stream:** Gitea webhook deliveries.
- **Source-of-truth state:** Gitea + payload.
- **Derived state:** `commit_details`, `push_events`, `repo_data.{total_commits,last_push_at,needs_update}`, `als_diffs` (when the desktop posts).

If we ever outgrow synchronous webhook handling, the natural step is to push deliveries onto a queue (Redis Streams or AWS SQS) and have a worker consume them. The `webhook_deliveries` table is already structured to support that (it has `processing_status` for retry).

### Chapter 12 — Future of Data Systems

Two patterns to keep in mind as features land:

- **Event-sourcing the social graph:** clones, stars, forks, comments are all events. Today each one mutates a denormalized counter. If we ever want a richer audit trail (or per-user activity feed), the `clone_events` / `repository_events` tables are already event logs.
- **Privacy-by-default for derived data:** anything we expose on `/repos/public` becomes a target for scraping. Cache headers, rate limits, and the `is_public` flag are the three layers between user content and the open internet. Be paranoid before adding any new "public stats" endpoint.

---

## 8. Known Bottlenecks

### 8.1. The `/repos/public` N+1 (mostly fixed, watch closely)

`routers/repos.py:427-508` (the public list endpoint) currently calls `svc.get_repo(owner, repo_name)` once per repo to verify privacy. For 100 public repos, that's 100 sequential Gitea calls. **Mitigation in place:** `RepoData.is_public` is the cached source of truth and `repo_data.is_public` is the SQL-level filter. The Gitea verification is a paranoid double-check that should be made async (gathered with `asyncio.gather`) or removed once we trust the cache. Tracked but not fixed in this branch.

### 8.2. Webhook handler is synchronous and on the request path

`POST /api/webhooks/gitea` runs `process_event` inline. If `process_event` takes >5 s (e.g. Gitea's `get_commit_count` is slow), Gitea will timeout and retry. Concrete fix: enqueue to Redis Streams, ack immediately, process async. Documented in §7 / Chapter 11.

### 8.3. The `repo_data` model's column count

`RepoData` now has 25+ columns. Some are operationally hot (`clone_count`, `total_commits`), some are cold (`readme_content` up to 50 KB). Fetching the whole row for a list view loads the README into memory unnecessarily. Fix: split into `repo_data` (hot) + `repo_content_cache` (cold). Not urgent — Postgres TOAST handles this transparently for now.

### 8.4. Single Postgres for both transactional and analytics

Today, the Explore "trending" sort runs on the same Postgres that handles login. The pre-computed `explore_score` defends against the worst case, but a true analytics workload (e.g. "most active genres per week") would compete for connections. **Mitigation roadmap:** the Phase 1 plan in `design_plans/backend_improvements_phased_plan.md` calls for adding DO Managed Redis (already done) and eventually a read-replica for analytics queries.

### 8.5. The desktop ↔ web "Did my push land?" gap

After a push, the user has to refresh the web page to see the new commit. There's no push notification. The 3-second polling on `diff_status` masks half of this (commits *appear* once the diff lands), but the count in the sidebar can lag by tens of seconds. **Future fix:** SSE channel from FastAPI to the Web Server Component that flushes the `useUser` context with `last_activity_at`, so the user sees their own push without a hard refresh.

### 8.6. Race: desktop creates repo, then push, then `/repos/register`

Sequence: (1) desktop calls Gitea user API directly to create a repo; (2) desktop pushes; (3) desktop calls `POST /repos/register`. Between (1) and (3) a webhook can fire. **Pre-fix:** push was dropped. **Post-fix in `c93e016`:** webhook auto-creates `RepoData` from payload. Race resolved as long as the webhook payload includes `repository.owner.login`, which it always does for Gitea.

### 8.7. `viewer_can_clone` / `viewer_pending_invite` only populated when authenticated

This is by design — the `/stats` endpoint stays public for the Explore page. But it means client code MUST treat these fields as `boolean | undefined`, not `boolean`. Several places in `RepoDetailClient.tsx` correctly use `?? false`; treat that as the convention.

---

## 9. Quick Reference

### Where things live

| I want to… | Look in |
|---|---|
| Add a backend endpoint | `apps/backend/routers/<concern>.py` (router) + `apps/backend/services/<concern>_service.py` (logic) + `apps/backend/models/<concern>_models.py` (data) |
| Register a router in the app | `apps/backend/main.py:121-134` |
| Find the auth/tenancy decorator | `apps/backend/dependencies.py` (`verify_token`, `verify_token_or_pat`, `require_repo_access`, `resolve_owner_id`) |
| Trace a TS type | `apps/web/lib/types/api.ts` |
| Add a fetcher on the web | `apps/web/lib/api/<concern>.ts`, all wrapping `authFetch` from `lib/api/client.ts` |
| Add a server action | `apps/web/actions/<concern>.ts` |
| Read DB schema | The model files in `apps/backend/models/*.py`. SQL migrations under `apps/backend/scripts/migrations/V*.sql` are append-only. |
| See what a webhook event does | `apps/backend/services/webhook_service.py:_handle_push,_handle_create,_handle_delete,_handle_repository,_handle_fork` |
| Configure local env | `apps/backend/.env.local`, `.env.compose.local` (root). See `README.md` §65-127. |
| Configure production env | `apps/backend/.env.remote`, `.env.compose.remote`. See `README.md` §139-323. |
| Run integration tests | `cd apps/backend && python tests/run_all.py`. See `apps/backend/tests/README.md`. |
| Decide whether to scale | `docs/hosting-decision.md` (the only place those decisions are recorded). |

### Critical commands

```bash
# Start the whole stack locally
./compose.sh local up -d
# Tail backend logs
docker compose --env-file .env.compose.local logs -f fastapi
# Run integration tests against the live local stack
cd apps/backend && python tests/run_all.py
# Force-reconcile a single repo's commit history
curl -X POST 'http://localhost:8000/admin/backfill-commits?owner=<u>&repo=<r>' \
  -H "X-Admin-Token: $ADMIN_TOKEN"
# Detect drift between cached stats and Gitea reality
curl 'http://localhost:8000/repos/<u>/<r>/stats/sync-check'
```

### Documents this one supersedes (for architecture)

| File | Still authoritative for |
|---|---|
| `SOUNDHAUS.md` | Mission, AI guidelines, do-not-edit policy. **Read-only.** |
| `Final_Design_Document.md` | Capstone narrative, motivations, user stories, MVP scope. |
| `README.md` | Hosting recipes (DO droplet, Vercel, Cloudflare R2, Nginx + Let's Encrypt). |
| `docs/hosting-decision.md` | Scale-out thresholds and budget. |
| `docs/lti-integration.md` | Canvas LTI 1.3 OIDC + AGS + NRPS handshake details. |
| `design_plans/backend_improvements_phased_plan.md` | Phased backend roadmap. |

---

## Appendix A — Glossary (book → code)

| DDIA term | SoundHaus equivalent |
|---|---|
| Leader | Gitea (for git refs); Supabase (for app data) |
| Follower / read replica | None today (single Supabase instance; single Gitea instance) |
| Replication log | `webhook_deliveries` table |
| Materialized view | `repo_data.total_commits`, `repo_data.fork_count`, `repo_data.explore_score` |
| Stream / event log | Gitea webhook deliveries |
| Stream processor | `WebhookService.process_event` |
| Lambda architecture (batch + stream) | `_handle_push` (stream) + `scripts/backfill_commits.py` (batch) |
| Idempotency key | `commit_details.sha` (for commit ingestion); `webhook_deliveries.signature` (for delivery dedup, not yet enforced) |
| Quorum read | None — we always read from a single replica |
| LWW conflict resolution | `_handle_repository`'s `repo_data.description = payload.description` (line 392) |

## Appendix B — Phase-2 sync fix recap

The bug fixed in commit `c93e016` (this file's first reason to exist) was three independent failures combining:

1. **Schema drift** — TS interface declared fields the backend never emitted. Fixed by extending `GET /repos/{owner}/{repo}/stats` (`routers/repos.py:692+`) to return every declared field plus drift telemetry on `/stats/sync-check`.
2. **Silent webhook drop** — `_handle_push` skipped events for repos not yet in `repo_data` (race window between desktop create and `/repos/register`). Fixed by auto-creating `RepoData` from the payload (`webhook_service.py:199-235`).
3. **Indeterminate Next.js fetch cache** — outbound fetch in `lib/utils/auth.ts` had no explicit cache option. Fixed by defaulting `cache: 'no-store'`, with caller opt-in for genre-list-style cacheable endpoints.

Plus an operational lever — `POST /admin/backfill-commits` (`routers/admin.py`) — for reconciling pre-existing drift.

---

*Last verified against `experimental-changes` HEAD: see `git log -1`. When this doc and the code disagree, the code wins; please update this doc in the same PR.*
