# Gitea Version Control Scalability Plan

**Status:** Approved for implementation  
**Last updated:** February 2025

---

## Executive Summary

This plan addresses scalability and concurrency bottlenecks in the SoundHaus backend's Gitea integration. Key decisions: **ThreadPoolExecutor** for offloading blocking calls (first iteration), **Supabase** for token caching and LFS storage, **Supavisor** for DB connection pooling, and **SQLModel** for unified ORM/schema. Queue-based processing (Redis/Celery) is deferred to Phase 2.

---

## 1. ThreadPoolExecutor for Blocking Gitea Calls (Phase 1)

### Decision

Use Python's built-in `ThreadPoolExecutor` (or `asyncio.to_thread`) to run all synchronous Gitea API calls off the FastAPI event loop.

### Reasons Why

- **Current problem:** All Gitea calls use `requests` (sync) inside async handlers. Each call blocks the event loop, limiting concurrent request handling to roughly 10–30 users.
- **Lowest friction:** No new services (Redis, Celery). Ships with Python. Minimal code changes.
- **Targeted fix:** Addresses the exact bottleneck (blocking I/O) without over-engineering.
- **Proven pattern:** Standard approach for wrapping sync libraries in async apps.

### Trade-offs vs Alternatives

| Approach | Pros | Cons |
|----------|------|------|
| **ThreadPoolExecutor** ✓ | No new infra, simple, fast to ship | Bounded by pool size; not for long-running jobs |
| **Redis + Celery** | Retries, scheduling, horizontal scaling | Adds Redis + workers; overkill for simple offload |
| **httpx async** | Native async HTTP | Requires rewriting all Gitea/Repo service calls |
| **asyncio.to_thread** | Simpler than ThreadPoolExecutor | Same effect; built-in since Python 3.9 |

### Scope of Offloading

All blocking calls in:
- `GiteaAdminService` (create_user, get_user_by_username, create_or_get_user_token_cli, verify_gitea_token, create_webhook, etc.)
- `RepoService` (get_repo, list_user_repos, create_user_repo, upload_file, delete_file, get_contents, _fetch_lfs_content, etc.)

### Gitea Ops for Pushing Files

**Desktop app:** Pushes via Git (clone, push, pull) directly to Gitea. No backend involvement.

**Web/API:** Backend `upload_file` uses Gitea Contents API (PUT/POST). It is synchronous—the client waits for the upload to complete. ThreadPoolExecutor offloads this call so it does not block the event loop. **No queue needed** for file uploads; the request/response model is appropriate.

**Conclusion:** ThreadPoolExecutor covers all Gitea ops (user creation, token creation, repo creation, file upload/delete, LFS fetch). No additional queue or worker infrastructure is required for current Gitea operations.

---

## 2. Queue / Background Jobs (Phase 2 — Deferred)

### Decision

**Phase 1:** No Redis/Celery. ThreadPoolExecutor only.

**Phase 2:** Add Redis + Celery when we need:
- Webhook queue (process Gitea webhooks asynchronously)
- Background jobs (e.g. preview generation, metadata extraction, trending scores)

### Reasons Why

- **Phase 1 focus:** Fix concurrency for existing request/response flows. ThreadPoolExecutor achieves that.
- **Queue use case:** Webhooks and background jobs are fire-and-forget. They benefit from retries, scheduling, and worker scaling—not from ThreadPoolExecutor.
- **Incremental complexity:** Avoid introducing Redis/Celery until we have concrete background job requirements.

### Trade-offs vs Alternatives

| Approach | Pros | Cons |
|----------|------|------|
| **Defer queue** ✓ | Simpler Phase 1; add when needed | Webhooks still processed inline (acceptable for now) |
| **Queue in Phase 1** | Webhooks never block | Extra infra and code before we need it |
| **Inline webhook + ThreadPoolExecutor** | Webhook handler could offload DB work to thread pool | Still holds request open; doesn't solve burst of webhooks |

### Current Webhook Behavior

Webhooks are processed inline. With ThreadPoolExecutor, any Gitea API calls inside webhook handlers would be offloaded, but the handler still runs in the request context. For Phase 1 this is acceptable. When webhook volume or processing time becomes an issue, Phase 2 adds a queue.

---

## 3. Token Caching in Supabase

### Decision

Cache Gitea PATs in Supabase (new table or extension of existing schema). When desktop requests credentials, check cache first; create new token via CLI only on cache miss or invalidation.

### Reasons Why

- **Current bottleneck:** Token creation uses `subprocess.run()` (SSH/Docker exec), blocking 10–30 seconds per request.
- **Current "cache":** Client-side only. Desktop stores token and passes `cached_gitea_token`; backend validates. If desktop clears storage or is new, we always hit CLI.
- **Server-side cache:** Reduces CLI calls dramatically. One token per user (or per device) can be reused for days/weeks.
- **Supabase:** Already used for auth and DB. No new storage system.

### Trade-offs vs Alternatives

| Approach | Pros | Cons |
|----------|------|------|
| **Supabase cache** ✓ | Single provider, transactional, queryable | Need schema + invalidation logic |
| **Redis cache** | Fast, TTL built-in | New service; tokens are security-sensitive |
| **Client-only cache** (current) | No backend changes | Every new device/session triggers CLI |
| **Pre-provision at signup** | Token ready before first desktop use | User may never use desktop; token expiry handling |

### Schema (Proposed)

```sql
-- gitea_token_cache
user_id uuid PRIMARY KEY REFERENCES auth.users(id),
gitea_token_hash text NOT NULL,  -- Store hash, not plaintext; or use Supabase Vault
token_name text,
created_at timestamptz,
expires_at timestamptz  -- Optional: rotate tokens periodically
```

**Security:** Store only a hash or reference if Supabase supports secrets (e.g. Vault). If plaintext is required, ensure encryption at rest and strict access control.

### Invalidation

- On user request (e.g. "Revoke Git access" in settings)
- Periodic rotation (e.g. every 90 days)
- When `verify_gitea_token` fails (token revoked in Gitea)

---

## 4. Supabase Storage for LFS

### Decision

Use Supabase Storage (S3-compatible) as the backend for Gitea LFS instead of local disk or DigitalOcean Spaces.

### Reasons Why

- **Single provider:** DB, Auth, and Storage in one place. Simpler billing and operations.
- **S3-compatible:** Gitea supports S3-compatible storage for LFS.
- **Co-location:** Storage and DB in same region reduces latency for any app logic that touches both.
- **No extra vendor:** Avoids managing DO Spaces alongside Supabase.

### Trade-offs vs Alternatives

| Approach | Pros | Cons |
|----------|------|------|
| **Supabase Storage** ✓ | One provider, S3-compatible | Pricing tied to Supabase plan |
| **DigitalOcean Spaces** | $5/mo + 250 GiB; good if Gitea on DO | Second provider to manage |
| **Local disk** | Simple, no egress cost | Single-node, backup complexity, I/O limits |
| **MinIO self-hosted** | Full control | Operational overhead |

### Gitea Configuration

Configure Gitea `app.ini` or environment for S3-compatible storage. Supabase Storage exposes S3-compatible API; use the project's Storage credentials and endpoint.

---

## 5. Supavisor (Supabase Connection Pooler)

### Decision

Use Supabase Supavisor (connection pooler) for all application database connections.

### Reasons Why

- **Connection exhaustion:** Default SQLAlchemy pool (e.g. 5 connections) can be exhausted under concurrency.
- **Supavisor:** Built-in pooler. Transaction mode (port 6543) shares connections across many clients.
- **No extra software:** Use pooler connection string from Supabase dashboard.

### Trade-offs vs Alternatives

| Approach | Pros | Cons |
|----------|------|------|
| **Supavisor** ✓ | Native, no setup | Must use pooler URL |
| **PgBouncer self-hosted** | Full control | Extra service to run |
| **Direct connection** | Simplest | Limited connections; risk of exhaustion |
| **Larger SQLAlchemy pool** | No config change | Postgres has a connection limit |

### Implementation

- Use **Transaction mode** (port 6543) for FastAPI.
- Replace `DATABASE_URL` with the pooler URL from Supabase:  
  `postgresql://postgres.[PROJECT]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres`
- Keep direct connection (port 5432) for migrations if needed.

---

## 6. SQLModel Migration

### Decision

Migrate from SQLAlchemy ORM + separate Pydantic schemas to SQLModel for database models.

### Reasons Why

- **Less duplication:** One model for DB table and validation.
- **Consistency:** Same author (FastAPI ecosystem); integrates well with FastAPI.
- **Compatibility:** SQLModel uses SQLAlchemy under the hood; migration can be incremental.
- **Type safety:** Better IDE support and type checking.

### Trade-offs vs Alternatives

| Approach | Pros | Cons |
|----------|------|------|
| **SQLModel** ✓ | Single model, Pydantic-compatible | Migration effort; some SQLAlchemy features may differ |
| **SQLAlchemy + Pydantic** (current) | Mature, flexible | Duplicate models; more boilerplate |
| **Pydantic-only** | Simple | No ORM; manual SQL or other layer |

### Scope

- **Replace:** SQLAlchemy ORM models (e.g. `RepoData`, `WebhookDelivery`, `PushEvent`, `PersonalAccessToken`).
- **Keep:** Pydantic for request/response schemas that have no DB table (e.g. `CreateRepoRequest`, `SignUpRequest`).
- **SQLModel does not replace Pydantic:** It extends it. Use SQLModel for table-backed models; use Pydantic `BaseModel` for pure DTOs.

### Migration Strategy

1. Add SQLModel dependency.
2. Convert one model at a time (e.g. start with `RepoData`).
3. Use `sqlmodel.Session` with existing engine/sessionmaker.
4. Update imports and type hints.
5. Keep Pydantic request/response models unchanged.

---

## 7. Gitea HTTP Connection Pooling

### Decision

Use a shared `requests.Session` in `GiteaAdminService` and `RepoService` for all Gitea HTTP calls.

### Reasons Why

- **Current:** Each `requests.get/post` opens a new TCP connection.
- **With Session:** Connection pooling and keep-alive reduce latency and connection churn under load.
- **Low effort:** One-line change per service (`self.session = requests.Session()` and use `self.session.get` instead of `requests.get`).

### Trade-offs vs Alternatives

| Approach | Pros | Cons |
|----------|------|------|
| **requests.Session** ✓ | Simple, no new deps | Still sync; use with ThreadPoolExecutor |
| **httpx** | Async support | Larger refactor |
| **No pooling** (current) | No change | More connections, higher latency |

---

## 8. Database Indexes

### Decision

Add indexes to support high-traffic queries. Audit existing tables and add indexes for:
- Webhook lookups by `repo_id`, `event_type`, `processing_status`
- Repo lookups by `gitea_id`
- Token cache lookups by `user_id`
- Activity/events by `repo_id` and timestamp

### Reasons Why

- **Prevents full scans:** As data grows, unindexed columns used in filters/joins cause slow queries.
- **Low risk:** Indexes rarely break existing behavior; mainly improve performance.
- **Supavisor:** Pooler helps with connection count; indexes help with query time.

---

## Implementation Order

| Phase | Item | Effort |
|-------|------|--------|
| 1 | ThreadPoolExecutor for Gitea/Repo services | 1–2 days |
| 1 | Gitea HTTP connection pooling (Session) | 0.5 day |
| 1 | Supavisor connection string | 0.5 day |
| 1 | DB pool tuning + indexes | 0.5 day |
| 1 | Token cache in Supabase | 1–2 days |
| 1 | SQLModel migration (incremental) | 2–3 days |
| 1 | Supabase Storage for Gitea LFS | 1–2 days |
| 2 | Redis + Celery for webhooks/jobs | 2–3 days |

---

## Summary: What We're Doing

| Area | Decision | Phase |
|------|----------|-------|
| Blocking Gitea calls | ThreadPoolExecutor | 1 |
| Webhook / background jobs | Defer queue (Redis/Celery) | 2 |
| Token caching | Supabase table | 1 |
| LFS storage | Supabase Storage | 1 |
| DB connections | Supavisor pooler | 1 |
| ORM | SQLModel (incremental) | 1 |
| Gitea HTTP | Connection pooling (Session) | 1 |
| Gitea file ops | No queue; ThreadPoolExecutor sufficient | 1 |
