# SoundHaus — Complete System Documentation

> Last updated: April 2026. This document describes the full architecture, backend infrastructure,
> frontend components, API surface, and how every piece connects.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Infrastructure — Docker Services](#2-infrastructure--docker-services)
3. [Backend — FastAPI Application](#3-backend--fastapi-application)
4. [Redis — How It Works](#4-redis--how-it-works)
5. [Gitea — Git Server Integration](#5-gitea--git-server-integration)
6. [Token Broker Microservice](#6-token-broker-microservice)
7. [Supabase — Auth and Storage](#7-supabase--auth-and-storage)
8. [Database Layer (SQLAlchemy + PostgreSQL)](#8-database-layer-sqlalchemy--postgresql)
9. [Backend Routers — Every Endpoint Explained](#9-backend-routers--every-endpoint-explained)
10. [Backend Services — Business Logic Layer](#10-backend-services--business-logic-layer)
11. [Stem Worker — Background Job Processor](#11-stem-worker--background-job-processor)
12. [Web App — Frontend Architecture](#12-web-app--frontend-architecture)
13. [Web App — Pages Explained](#13-web-app--pages-explained)
14. [Web App — Components Explained](#14-web-app--components-explained)
15. [Web App — API Client Layer](#15-web-app--api-client-layer)
16. [Desktop App — Electron Architecture](#16-desktop-app--electron-architecture)
17. [Data Flow Walkthroughs](#17-data-flow-walkthroughs)
18. [External APIs We Call](#18-external-apis-we-call)
19. [Environment Variables Reference](#19-environment-variables-reference)
20. [Security Model](#20-security-model)

---

## 1. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         User Devices                             │
│                                                                  │
│  ┌─────────────────┐          ┌──────────────────────────────┐   │
│  │  Desktop App     │          │  Web Browser                 │   │
│  │  (Electron/React)│          │  (Next.js → Vercel)          │   │
│  └────────┬────────┘          └──────────────┬───────────────┘   │
└───────────┼───────────────────────────────────┼──────────────────┘
            │                                   │
            │ HTTPS (api.thesound.haus)          │ HTTPS (api.thesound.haus)
            │ Git over HTTPS (git.thesound.haus) │
            ▼                                   ▼
┌───────────────────────────────────────────────────────────────────┐
│                    DigitalOcean Droplet                            │
│                    (Ubuntu 25.04, Docker Compose)                  │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐    │
│  │   Nginx       │  │   FastAPI    │  │   Token Broker        │    │
│  │  (port 443)   │→ │  (port 8000) │  │   (port 9000)         │    │
│  │  SSL via      │  │  Python/     │  │   Python microservice │    │
│  │  Certbot      │  │  Uvicorn     │  │   mints Gitea tokens  │    │
│  └──────────────┘  └──────┬───────┘  └──────────────────────┘    │
│                            │                                      │
│  ┌──────────────┐  ┌───────▼──────┐  ┌──────────────────────┐    │
│  │   Gitea       │  │    Redis     │  │   gitea_db            │    │
│  │  (port 3000)  │  │  (port 6379) │  │   PostgreSQL          │    │
│  │  Git server   │  │  Rate limit  │  │   (port 5433)         │    │
│  │  + web UI     │  │  cache       │  │   Gitea's own DB      │    │
│  └──────────────┘  └──────────────┘  └──────────────────────┘    │
└───────────────────────────────────────────────────────────────────┘
            │
            │ HTTP (Supabase cloud)
            ▼
┌───────────────────────────────┐
│           Supabase             │
│  - Auth (login, signup, JWT)  │
│  - Supabase Storage (buckets) │
│    • snippets  (audio files)  │
│    • stems     (Demucs output)│
│    • avatars   (profile pics) │
│    • thumbnails (repo art)    │
│  - PostgreSQL (user profiles, │
│    repo metadata, commits,    │
│    invitations, PATs, etc.)   │
└───────────────────────────────┘
```

**Key design decisions:**

- **Two databases**: Gitea has its own PostgreSQL (`gitea_db`) for repo/user/git metadata. SoundHaus has its own tables in Supabase's PostgreSQL for application data (profiles, commits, snippets, invitations, etc.). They are linked by the Gitea username (or Supabase user-ID for legacy users).
- **Git operations bypass the API**: Clone, push, and pull go directly from the Desktop app to Gitea over HTTPS. FastAPI is never in that data path.
- **Webhooks sync state**: When a push happens in Gitea, Gitea calls our `/api/webhooks/gitea` endpoint. That's how commit history gets into our database.
- **Nginx terminates SSL**: All public HTTPS is handled by Nginx with Let's Encrypt certs. Internally, services talk over HTTP on the Docker bridge network.

---

## 2. Infrastructure — Docker Services

All services are defined in `docker-compose.yml` at the project root and started with:

```bash
docker compose --env-file .env.compose.remote up -d
```

### `fastapi` container
- **Image**: Built from `apps/backend/Dockerfile`
- **Port**: 8000 (internal), exposed via Nginx at `https://api.thesound.haus`
- **Entry point**: `uvicorn main:app --host 0.0.0.0 --port 8000`
- **Env file**: Reads from `BACKEND_ENV_FILE` (e.g. `./apps/backend/.env.remote`)
- **Volumes**: `./apps/backend:/app` (code), `./workers:/workers` (stem worker)
- **Health check**: `GET /health` every 30s

### `token-broker` container
- **Image**: Built from `apps/token-broker/Dockerfile`
- **Port**: 9000 (internal only, never exposed to the internet)
- **Purpose**: The only service that can run `gitea admin user generate-access-token` because it has access to the Docker socket and can `docker exec` into the Gitea container.
- **Security**: Protected by `BROKER_API_KEY` header (`X-Internal-API-Key`). If the key is empty, it accepts all requests (dev mode only).

### `gitea` container
- **Image**: `gitea/gitea:latest`
- **Ports**: 3000 (HTTP git web UI), 2222 (SSH)
- **Exposed via Nginx**: `https://git.thesound.haus`
- **Data volume**: `./gitea/` (mounted in for persistence)
- **Config**: `./gitea/gitea/conf/app.ini` — auto-generated by Gitea on first boot, then edited for our domain settings.
- **ROOT_URL**: `https://git.thesound.haus/` (set via env var `GITEA_ROOT_URL`)

### `gitea_db` container
- **Image**: `postgres:15`
- **Port**: 5433 (maps to internal 5432)
- **Purpose**: Gitea's own database. Completely separate from the SoundHaus application database.
- **Credentials**: `GITEA_DB_PASSWORD` from the compose env file.

### `redis` container
- **Image**: `redis:7-alpine`
- **Port**: 6379 (internal only)
- **Purpose**: Rate-limiting storage for SlowAPI. Stores sliding window counters per IP or user ID.
- **No persistence**: Data is ephemeral; it resets on restart. This is fine because rate limits are short-lived.

### Nginx (host, not Docker)
- **Config**: `/etc/nginx/sites-available/soundhaus`
- **SSL**: Let's Encrypt cert at `/etc/letsencrypt/live/api.thesound.haus/` covering both `api.thesound.haus` and `git.thesound.haus`
- **Routes**:
  - `api.thesound.haus` → `proxy_pass http://127.0.0.1:8000`
  - `git.thesound.haus` → `proxy_pass http://127.0.0.1:3000`

---

## 3. Backend — FastAPI Application

**Entry point**: `apps/backend/main.py`

The application is assembled in `main.py`:

1. **Lifespan context manager**: On shutdown, calls `close_redis()` to cleanly disconnect the Redis pool.
2. **Rate limiter**: `SlowAPIMiddleware` wraps every request. Limits are stored in Redis (see section 4).
3. **CORS middleware**: In production, only allows `thesound.haus`, `www.thesound.haus`, `api.thesound.haus`. In development, allows any `localhost` or `127.0.0.1` origin via regex.
4. **Security headers middleware**: `apps/backend/middlewares/security_headers.py` adds `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy` to every response.
5. **Router registration**: All 12 routers are imported and included on the `app`.

### Configuration (`config.py`)

Uses `pydantic-settings` with `BaseSettings`. All env vars are read from the `.env` file (or `.env.remote` / `.env.local` via the `BACKEND_ENV_FILE` mechanism). Key properties:

| Setting | Purpose |
|---|---|
| `database_url` | Supabase PostgreSQL connection string |
| `supabase_url` / `supabase_pub_key` / `supabase_service_key` | Supabase credentials |
| `gitea_url` | Internal Docker network URL for Gitea (`http://gitea:3000`) |
| `gitea_public_url` | Public URL for clone links (`https://git.thesound.haus`) |
| `gitea_admin_token` | Admin-level Gitea API token for all server-side operations |
| `gitea_webhook_secret` | HMAC secret used to verify Gitea webhook signatures |
| `token_broker_url` | Internal URL for the token broker (`http://token-broker:9000`) |
| `token_broker_api_key` | Shared key sent to the broker as `X-Internal-API-Key` |
| `redis_url` | Redis connection string (`redis://redis:6379/0`) |
| `cors_origins` | List of allowed CORS origins |
| `webhook_base_url` | Base URL Gitea uses to call our webhook endpoint |
| `rate_limit_*` | Per-endpoint rate limit strings (e.g. `"100/minute"`) |
| `password_reset_email_enabled` | Feature flag — disables the reset-password endpoint when `false` |

---

## 4. Redis — How It Works

Redis is used exclusively for **rate limiting** via the `slowapi` library.

### How SlowAPI uses Redis

Every incoming request hits `SlowAPIMiddleware`. The limiter calls `get_remote_address(request)` (for unauthenticated endpoints) or `get_user_or_ip(request)` (for authenticated ones — prefers the user's Supabase ID over their IP).

A sliding window counter is stored in Redis as a key like:
```
slowapi:user:4cf84c7c-0b07-4043-bdf6-9edf229625e6:/api/auth/login:10/minute
```

Each key has a TTL equal to the window size. When the count exceeds the limit, SlowAPI returns a `429 Too Many Requests` with `X-RateLimit-*` headers explaining the reset time.

### Rate limits by endpoint

| Endpoint group | Limit |
|---|---|
| Default (all endpoints) | 100 requests/minute |
| Auth endpoints (login, etc.) | 10 requests/minute |
| Signup | 5 requests/minute |
| Upload (snippets, thumbnails) | 5 requests/minute |
| Repos list | 60 requests/minute |

### Redis connection pooling

`apps/backend/services/redis_service.py` maintains a single `ConnectionPool` (max 20 connections) as a module-level singleton. All SlowAPI requests share this pool. On app shutdown, `close_redis()` is called to disconnect cleanly.

### Why Redis and not in-memory?

In-memory counters would reset on every deploy and would not be shared if multiple FastAPI workers ran. Redis ensures rate limits persist across restarts and scale horizontally.

---

## 5. Gitea — Git Server Integration

Gitea is an open-source self-hosted Git service (like a self-hosted GitHub). SoundHaus uses it as the actual git backend for all repositories.

### How it fits in

- The Desktop app clones, pushes, and pulls directly from Gitea over HTTPS.
- FastAPI never touches git data — it only manages the *metadata* around repos (descriptions, thumbnails, who can access what).
- Gitea's admin API is called by FastAPI (via `GiteaAdminService` and `RepoService`) for operations like creating users, creating repos, adding collaborators, and setting visibility.

### User provisioning

When a user signs up through the web app, FastAPI:

1. Creates the Supabase account (via `SupabaseAuthService.sign_up`).
2. Immediately creates a **matching Gitea user** (via `GiteaAdminService.create_user`).
3. The Gitea user's email is aliased: `user@gmail.com` → `user+soundhaus@gmail.com`. This avoids conflicts if someone already has a Gitea account with the same email.
4. The Gitea username is derived from the SoundHaus display name they chose at signup.
5. A profile row is created in the SoundHaus database linking the Supabase UUID to the Gitea username.

### Token minting flow

The Desktop app needs a Gitea Personal Access Token to authenticate git pushes. Here's how it gets one:

1. Desktop calls `POST /api/auth/desktop-login` with email/password.
2. FastAPI authenticates with Supabase.
3. FastAPI calls the **Token Broker** (`POST /mint-token`) with the Gitea username.
4. The Token Broker runs `docker exec -u git gitea gitea admin user generate-access-token` inside the Gitea container.
5. The token is returned to FastAPI, which sends it to the Desktop along with the Supabase session token.
6. The Desktop stores the Gitea token in `~/.git-credentials` for use by the bundled git binary.

### Webhook registration

When a repo is created (from the desktop via `POST /repos/register`), FastAPI immediately registers a Gitea webhook on that repo:

```
POST /api/v1/repos/{owner}/{repo}/hooks
{
  "type": "gitea",
  "config": {
    "url": "http://fastapi:8000/api/webhooks/gitea",
    "secret": "<GITEA_WEBHOOK_SECRET>",
    "content_type": "json"
  },
  "events": ["push", "create", "delete", "repository", "fork"],
  "active": true
}
```

The webhook URL uses the **internal Docker network** (`http://fastapi:8000`) so payloads never leave the server.

### app.ini — Gitea configuration file

Located at `./gitea/gitea/conf/app.ini`. Key settings:

```ini
[server]
ROOT_URL         = https://git.thesound.haus/
DOMAIN           = git.thesound.haus
SSH_DOMAIN       = git.thesound.haus

[repository]
DEFAULT_PRIVATE = true   ; all new repos start as private

[git.timeout]
...
```

### git-LFS

Gitea is configured to support Git LFS (Large File Storage). Audio files committed from the Desktop app are tracked via LFS. The actual LFS objects are stored inside the Gitea data volume (`./gitea/`) — they do NOT go to Supabase. Only audio *snippets* (preview clips) go to Supabase Storage.

---

## 6. Token Broker Microservice

**Location**: `apps/token-broker/main.py`

A minimal FastAPI service that exists for one very specific reason: **generating Gitea access tokens requires running a command inside the Gitea container**, and we don't want to give the main FastAPI container access to the Docker socket.

### Why separate?

Running `docker exec` requires the Docker socket (`/var/run/docker.sock`). Giving a web-exposed API container access to the Docker socket is a significant security risk (container escape). The token broker is a small, isolated service that:

- Is not directly reachable from the internet (only accessible on the Docker internal network)
- Has the Docker socket mounted
- Only does one thing: mint a Gitea access token for a given username

### How it works

```
FastAPI → POST http://token-broker:9000/mint-token
          Headers: { X-Internal-API-Key: <BROKER_API_KEY> }
          Body: { username: "chungus_cat", token_name: "Desktop Auto Token" }

Token Broker → docker exec -u git gitea gitea admin user generate-access-token \
               --username chungus_cat \
               --token-name "Desktop Auto Token" \
               --scopes write:repository,read:user,write:user \
               --raw

Returns: { success: true, token: { sha1: "abc123..." } }
```

### Security

`BROKER_API_KEY` in `.env.compose.remote` must match `TOKEN_BROKER_API_KEY` in `apps/backend/.env.remote`. They are sent as `X-Internal-API-Key` in every request. If `BROKER_API_KEY` is empty, the broker accepts all requests (development mode only — do NOT do this in production).

---

## 7. Supabase — Auth and Storage

### Authentication

Supabase handles all user authentication. FastAPI is **not** the auth source of truth — it defers to Supabase for token validation.

- **Sign up / Sign in**: FastAPI calls Supabase's REST auth API via `SupabaseAuthService`.
- **Token validation**: Every protected FastAPI endpoint calls `verify_token(token)` which calls `GET https://<SUPABASE_URL>/auth/v1/user` with the Bearer token. If Supabase says the token is valid, the request proceeds.
- **Session tokens**: Supabase returns a short-lived `access_token` (1 hour) and a long-lived `refresh_token` (30 days). The web app stores these in `httpOnly` cookies (`sb-access-token`, `sb-refresh-token`).

### Storage Buckets

| Bucket | Public? | Contents |
|---|---|---|
| `snippets` | Yes | Audio preview clips (≤30 seconds, trimmed on upload) |
| `stems` | Yes | Demucs stem separation output (vocals, drums, bass, other) |
| `avatars` | Yes | User profile pictures |
| `thumbnails` | Yes | Repository artwork (images or YouTube-derived) |

All buckets are **public** — anyone can fetch the CDN URLs without authentication. Access control is enforced at the upload/delete layer by FastAPI (you must be the repo owner to upload a snippet/thumbnail to your repo).

### Database (Supabase PostgreSQL)

The SoundHaus application tables live in Supabase's managed PostgreSQL. They are separate from Gitea's `gitea_db`. SQLAlchemy connects to it directly via `DATABASE_URL`.

---

## 8. Database Layer (SQLAlchemy + PostgreSQL)

**Files**: `apps/backend/database.py`, `apps/backend/models/`

### Connection setup

`database.py` creates a SQLAlchemy `engine` with:
- `pool_pre_ping=True` — tests connections before use (handles idle timeouts)
- `SQL_ECHO` env var — set to `true` to log all SQL queries (useful for debugging)

`get_db()` is a FastAPI `Depends` generator that yields a session and ensures it is closed after the request.

### Models (database tables)

| Model file | Table(s) | What it stores |
|---|---|---|
| `profile_models.py` | `profiles` | `id` (Supabase UUID), `username` (Gitea username), `display_name`, `bio`, `avatar_url`, `email`, `website` |
| `repo_models.py` | `repo_data` | `gitea_id` ("owner/repo"), `owner_id`, `clone_count`, `thumbnail_url`, `thumbnail_type`, `description` |
| `commit_models.py` | `commit_details` | `sha`, `short_sha`, `repo_id`, `author_name`, `author_email`, `timestamp`, `message`, `files_changed` |
| `webhook_models.py` | `webhook_deliveries`, `push_events`, `repository_events`, `webhook_configs` | Raw Gitea webhook payloads and processed push event data |
| `diff_models.py` | `als_diffs` | Ableton Live `.als` file diffs, keyed by `commit_sha` and `repo_id` |
| `stem_models.py` | `snippet_versions`, `stem_files`, `stem_job_statuses` | Demucs stem separation jobs and results |
| `genre_models.py` | `genre_lists` | Which genres are associated with each repository |
| `invitation_models.py` | `collaborator_invitations` | Pending/accepted/declined invite records |
| `pat_models.py` | `personal_access_tokens` | Hashed PATs for Desktop app authentication |
| `snippet_models.py` | `repo_snippets` | Audio snippet metadata (duration, format, CDN URL) |
| `clone_models.py` | `clone_events` | Tracks when and by whom repos are cloned |
| `comment_models.py` | `snippet_comments` | Time-stamped comments on audio snippets |

---

## 9. Backend Routers — Every Endpoint Explained

### `GET /health` (`routers/health.py`)
Returns `{"status": "healthy"}`. Used by Docker health checks and Nginx uptime monitoring. No auth required.

---

### Auth Router (`routers/auth.py`) — prefix: `/api/auth`

**`POST /api/auth/signup`**
- Accepts `{ email, password, name }` (name becomes the Gitea username/SoundHaus display name)
- Validates username format and uniqueness
- Creates Supabase account → creates Gitea account → creates Profile row in DB
- Returns Supabase session tokens
- Rate limited: 5/minute

**`POST /api/auth/login`**
- Standard web login with `{ email, password }`
- Authenticates with Supabase, returns session tokens
- Rate limited: 10/minute

**`POST /api/auth/desktop-login`**
- Desktop-specific login (see section 6 above)
- Returns session token + newly minted Gitea token + Backend PAT
- Auto-revokes any existing "Desktop Auto Token" PATs (prevents accumulation)

**`POST /api/auth/logout`**
- Revokes the Supabase session token
- No body needed — reads token from `Authorization: Bearer` header

**`POST /api/auth/refresh`**
- Refreshes a Supabase session using `{ refresh_token }`
- Returns a new `access_token`

**`GET /api/auth/user`**
- Returns the currently authenticated user's profile data
- Combines Supabase user data with the Profile table row

**`PATCH /api/auth/user`**
- Updates the profile (display name, bio, website, etc.)

**`POST /api/auth/reset-password`**
- Sends a password reset email via Supabase
- Can be disabled entirely with `PASSWORD_RESET_EMAIL_ENABLED=false`

**`POST /api/auth/avatar`** (also in this file)
- Uploads a profile picture to the `avatars` Supabase bucket
- Auth required
- Returns the public CDN URL

**`DELETE /api/auth/avatar`**
- Deletes the current profile picture from storage and clears the DB field

---

### Repos Router (`routers/repos.py`)

**`GET /repos`**
- Lists all Gitea repos for the authenticated user
- Calls Gitea's `/api/v1/user/repos` via `RepoService`
- Returns raw Gitea repo objects

**`POST /repos`**
- Creates a new repo in Gitea for the current user
- Default: private
- Also creates a `RepoData` row in the SoundHaus DB

**`POST /repos/register`**
- Called by the Desktop app after the first push when a repo doesn't exist in Gitea yet
- Creates the Gitea repo, creates the `RepoData` row, registers the Gitea webhook

**`GET /repos/public`**
- Returns all public repos across all users, enriched with SoundHaus metadata
- Filters out private repos by checking Gitea's API
- Includes: `owner_display_name`, `thumbnail_url`, `audio_snippet_url`, `genres`, `clone_count`, `stars_count`
- No auth required — this powers the Explore page

**`GET /repos/{owner}/{repo}`**
- Returns detailed info about a specific repo
- Checks Gitea, returns with SoundHaus enrichment

**`GET /repos/{owner}/{repo}/stats`**
- Returns repo stats: commit count, clone count, star count, collaborator count

**`PATCH /repos/{owner}/{repo}/settings`**
- Updates repo settings: description, genres
- Owner only

**`PATCH /repos/{owner}/{repo}/visibility`**
- Toggles a repo between public and private in Gitea
- Owner only

**`PUT /repos/{owner}/{repo}/thumbnail`**
- Sets a YouTube URL as the repo thumbnail
- Stores the YouTube video ID and sets `thumbnail_type = "youtube"`
- Owner only

**`POST /repos/{owner}/{repo}/thumbnail/upload`**
- Uploads an image file as the repo thumbnail to the `thumbnails` bucket
- Owner only — verified by resolving Supabase UUID → Gitea username

**`DELETE /repos/{owner}/{repo}/thumbnail`**
- Clears the thumbnail URL from the DB

**`GET /repos/{owner}/{repo}/contents`**
- Lists files/directories in the repo at a given path and ref (branch/commit)
- Proxies to Gitea's `/api/v1/repos/{owner}/{repo}/contents/{path}`

**`POST /repos/{owner}/{repo}/upload`**
- Uploads a file to the repo (creates/updates via Gitea API)
- For large binary files, routes through git-LFS

**`DELETE /repos/{owner}/{repo}`**
- Deletes the repo from both Gitea and the SoundHaus DB
- Owner only

---

### Collaborators Router (`routers/collaborators.py`)

**`POST /repos/{repo_name}/collaborators/invite`**
- Sends a collaboration invite to another user by email
- Creates a pending `CollaboratorInvitation` row with a time-limited token (7 days)
- Does NOT require SoundHaus membership — the email can be for anyone

**`GET /repos/{repo_name}/collaborators`**
- Lists current collaborators for a repo

**`GET /collaborators/invitations/pending`**
- Lists all pending invitations for the current user

**`POST /collaborators/invitations/{token}/accept`**
- Accepts an invite using the token from the invitation email
- Calls Gitea's `/api/v1/repos/{owner}/{repo}/collaborators/{username}` to add the user

**`POST /collaborators/invitations/{token}/decline`**
- Declines an invite (marks as declined in DB)

**`DELETE /repos/{repo_name}/collaborators/{username}`**
- Removes a collaborator from a Gitea repo
- Owner only

**`GET /users/search`** — search for users by display name, email, or username
- Case-insensitive partial match (`ILIKE`)
- Filters out auto-generated `@users.soundhaus.local` emails from results
- Returns `display_name`, `email`, `invite_email` (the real address for invites), `avatar_url`

---

### Desktop Router (`routers/desktop.py`) — prefix: `/api`

**`POST /api/auth/desktop-login`** (see Auth Router section above)

**`GET /api/desktop/credentials`**
- Returns the current user's Gitea token (freshly minted via Token Broker) and API base URL
- Called by the Desktop app at startup to refresh credentials

**`POST /api/auth/tokens`**
- Creates a new backend Personal Access Token (PAT)
- PATs are stored hashed (bcrypt, 12 rounds); the plaintext is returned **only once**

**`GET /api/auth/tokens`**
- Lists the current user's PATs (name, prefix, created date, expiry — never the hash)

**`DELETE /api/auth/tokens/{token_id}`**
- Revokes a PAT

---

### Commits Router (`routers/commits.py`)

**`GET /repos/{owner}/{repo}/commits`**
- Returns paginated commit history for a repository from the SoundHaus DB
- Supports `?page=` and `?limit=` query params
- Each commit includes: `sha`, `short_sha`, `message`, `author_name`, `author_email`, `timestamp`, `files_changed`, `author_avatar_url` (resolved from Profile), `author_display_name`
- Also returns whether an `AlsDiff` exists for each commit (so the UI can show a "view diff" button)

**`GET /repos/{owner}/{repo}/commits/{sha}/diff`**
- Returns the stored `AlsDiff` for a specific commit
- This is the Ableton `.als` file diff — shows which tracks, clips, devices changed

---

### Webhooks Router (`routers/webhooks.py`) — prefix: `/api/webhooks`

**`POST /api/webhooks/gitea`**
- The webhook receiver — called by Gitea, NOT by our own frontend or desktop
- Validates the HMAC-SHA256 signature with `GITEA_WEBHOOK_SECRET`
- Routes events to handlers in `WebhookService`:
  - `push` → creates `PushEvent` and `CommitDetail` rows for each commit
  - `repository` → updates `RepositoryEvent` (renames, deletions)
  - `fork` → logs the fork event
- Stores every delivery in `WebhookDelivery` for debugging

**`GET /api/webhooks/deliveries`**
- Paginated list of recent webhook deliveries (for debugging)
- Auth required

**`GET /api/webhooks/activity`**
- Recent activity feed across all repos the user has access to

---

### Snippets Router (`routers/snippets.py`)

**`POST /repos/{owner}/{repo}/snippet`**
- Uploads an audio preview clip for a repo
- Validates MIME type (must be audio) and file size (≤10MB)
- Trims to 30 seconds via `pydub` if longer
- Uploads to the `snippets` Supabase bucket
- Stores metadata (duration, sample_rate, channels, format) in `repo_snippets` table
- Rate limited: 5/minute

**`GET /repos/{owner}/{repo}/snippet`**
- Returns the CDN URL and metadata for the repo's current snippet
- Redirects to the storage URL

**`GET /repos/{owner}/{repo}/snippet/metadata`**
- Returns only the metadata (duration, format, etc.) without redirect

**`DELETE /repos/{owner}/{repo}/snippet`**
- Deletes the snippet from storage and clears from DB
- Owner only

---

### Stems Router (`routers/stems.py`)

**`POST /repos/{owner}/{repo}/stems/jobs`**
- Creates a new stem separation job
- Downloads the source audio, computes SHA-256 hash for deduplication
- If a job with the same hash already succeeded, returns the cached result
- Otherwise creates a `SnippetVersion` row with `status = QUEUED`
- The stem worker (background process) picks this up and runs Demucs
- Owner only, rate limited: 5/minute

**`GET /repos/{owner}/{repo}/stems/jobs/{job_id}`**
- Polls the status of a stem job (`QUEUED`, `PROCESSING`, `SUCCEEDED`, `FAILED`)

**`GET /repos/{owner}/{repo}/stems/latest`**
- Returns the most recent succeeded stem separation with all its `StemFile` URLs

**`POST /repos/{owner}/{repo}/stems/jobs/{job_id}/confirm`**
- Marks a stem job as accepted by the user (sets it as the active version for the repo)

**`GET /repos/{owner}/{repo}/stems/history`**
- Lists all stem separation jobs for a repo (for version history)

---

### Audio Router (`routers/audio.py`)

**`GET /repos/{owner}/{repo}/audio/waveform`**
- Fetches a raw audio file from the Gitea repo at a given path and ref
- Decodes audio with `pydub`, downsamples to `resolution` peak values (default 1024)
- Returns normalized peaks in `[-1.0, 1.0]` range
- Used by the `WaveformTrack` component in the diff timeline view

---

### Comments Router (`routers/comments.py`)

**`POST /repos/{owner}/{repo}/snippet/comments`**
- Adds a time-stamped comment on the audio snippet
- `timestamp_seconds` is the position in the audio where the comment appears
- Auth required

**`GET /repos/{owner}/{repo}/snippet/comments`**
- Returns all time-stamped comments for a snippet, sorted chronologically
- Each comment includes the author's avatar and display name
- No auth required (public)

**`DELETE /repos/{owner}/{repo}/snippet/comments/{comment_id}`**
- Deletes a comment (author or repo owner only)

---

### Genres Router (`routers/genres.py`)

**`GET /genres`**
- Returns all available genre tags (id, name, color, icon)

**`PATCH /repos/{owner}/{repo}/genres`**
- Replaces the genre list for a repo
- Owner only

---

## 10. Backend Services — Business Logic Layer

### `SupabaseAuthService` (`services/auth_service.py`)
Wraps Supabase's REST auth API endpoints. Handles sign_up, sign_in, sign_out, get_user, refresh_token, reset_password. All HTTP calls are made with `httpx` (async).

### `GiteaAdminService` (`services/gitea_service.py`)
Wraps Gitea's admin API endpoints. Handles create_user, update_user, create_repo, delete_user, etc. Uses the `GITEA_ADMIN_TOKEN`. HTTP calls are made with `requests` (sync, because these are admin operations called contextually, not in hot paths).

### `RepoService` (`services/repo_service.py`)
Wraps Gitea's repo-level API endpoints. Handles list_user_repos, get_repo, create_repo, delete_repo, create_gitea_webhook, list_repos_as_admin, update_visibility, get_collaborators, add_collaborator, remove_collaborator. Also handles git-LFS content fetching for file contents.

### `ProfileService` (`services/profile_service.py`)
Manages the SoundHaus `profiles` table in Supabase. Handles get_profile, update_profile, upload_avatar, delete_avatar. Validates usernames (alphanumeric + hyphens, no profanity check currently).

### `PATService` (`services/pat_service.py`)
Manages Personal Access Tokens. Tokens are generated as `soundh_{32 random bytes}`, hashed with bcrypt (12 rounds), stored in the DB. On verify, bcrypt comparison is used. Tokens expire after 90 days by default.

### `SnippetService` (`services/snippet_service.py`)
Handles audio snippet uploads to the `snippets` Supabase bucket. Validates MIME type, extracts metadata with `mutagen`, optionally trims to 30 seconds with `pydub`. Returns a public CDN URL.

### `WebhookService` (`services/webhook_service.py`)
Processes incoming Gitea webhook events. Validates HMAC-SHA256 signatures. For `push` events, creates `PushEvent` and `CommitDetail` rows. Updates `RepoData.last_activity_at` timestamps.

### `DemucsService` (`services/demucs_service.py`)
Handles audio stem separation using the `htdemucs` model from Facebook Research. Downloads source audio, runs the Demucs Python API (not CLI), uploads separated stems (vocals, drums, bass, other) to the `stems` Supabase bucket. SHA-256 deduplication prevents re-running expensive separations on identical audio.

---

## 11. Stem Worker — Background Job Processor

**File**: `workers/stem_worker.py`

Runs as a separate long-lived process (or container) alongside FastAPI. On startup:

1. Calls `recover_stale_jobs()` — resets any `PROCESSING` jobs that were interrupted (e.g., by a crash) back to `QUEUED`.
2. Enters an infinite poll loop, sleeping `POLL_INTERVAL` (default 5) seconds between iterations.

Each iteration:
1. Queries the DB for the oldest `QUEUED` SnippetVersion row.
2. Marks it `PROCESSING`.
3. Calls `DemucsService.separate()` which runs the full Demucs pipeline.
4. On success: marks `SUCCEEDED`, stores `StemFile` URLs.
5. On failure: marks `FAILED`, stores the error message.

The worker shares the same FastAPI source code (mounted at `/app` in Docker), so it uses the same models, database, and config as the API.

---

## 12. Web App — Frontend Architecture

**Framework**: Next.js 16 (App Router, React 19)
**Deployment**: Vercel
**Styling**: Tailwind CSS v4

### Routing structure

```
app/
├── layout.tsx               — Root layout, Navbar (shown on all pages)
├── page.tsx                 — Landing page (/)
├── (auth)/
│   ├── login/page.tsx       — Login page (/login)
│   └── signup/page.tsx      — Signup page (/signup)
├── (dashboard)/
│   ├── layout.tsx           — Dashboard shell (sidebar nav, user-aware)
│   ├── dashboard/page.tsx   — Main dashboard (/dashboard)
│   ├── explore/
│   │   ├── page.tsx         — Explore / discovery (/explore)
│   │   └── [owner]/[repo]/  — Public repo view (/explore/{owner}/{repo})
│   │       └── page.tsx
│   ├── profile/
│   │   └── [username]/page.tsx — User profile (/profile/{username})
│   ├── repositories/page.tsx   — My repositories (/repositories)
│   ├── repository/
│   │   └── [owner]/[repo]/page.tsx — Private repo detail (/repository/{owner}/{repo})
│   └── settings/page.tsx     — Account settings (/settings)
├── clone/[token]/page.tsx    — Clone landing page (/clone/{token})
├── s/[token]/page.tsx        — Short-link redirect for snippet sharing
└── api/
    ├── repos/[owner]/[repo]/thumbnail/upload/route.ts — Proxy for thumbnail upload
    └── profile/avatar/route.ts                         — Proxy for avatar upload
```

### Why are there Next.js API routes for uploads?

Next.js **Server Actions** can't serialize `File` objects across the server boundary. When a client component calls a Server Action with a `File`, the file gets serialized as an empty object. To work around this, image uploads go through **Next.js API route handlers** (`app/api/...`) instead, which run in Node.js and can properly forward `multipart/form-data` to FastAPI.

### Authentication flow in the web app

1. User submits the login form.
2. `LoginForm` calls the `loginAction` Server Action in `lib/services/auth.service.ts`.
3. `auth.service.ts` calls `POST https://api.thesound.haus/api/auth/login`.
4. FastAPI returns `{ access_token, refresh_token }`.
5. `auth.service.ts` calls `setAuthCookies()` which stores both tokens as `httpOnly` cookies.
6. All subsequent Server Actions read the `sb-access-token` cookie via `getAccessToken()`.
7. All API calls include `Authorization: Bearer <token>` in the request headers.

### Server Actions vs. Client Components

Almost all data fetching happens in **Server Actions** or **Server Components**:
- Pages are `async` functions that call API functions directly (server-side)
- The browser never sees the access token (it's in an httpOnly cookie)
- Client components receive data as props, or call API routes for mutations

---

## 13. Web App — Pages Explained

### Landing Page (`app/page.tsx`)
The marketing/public homepage. Sections:
- **Hero**: Animated waveform visualizer (`LoginVisualizer`), headline, CTA buttons
- **Features**: Three-column feature cards
- **How It Works**: Step-by-step walkthrough
- **Demo Carousel**: Visual demo of the interface
- **Human Music section**: Paragraph about real human collaboration in the AI era
- **Footer**: Links, social, legal

No authentication needed. Visible to everyone.

### Login (`(auth)/login/page.tsx`)
Renders `LoginForm` component. Handles both email/password login and link back to signup.

### Signup (`(auth)/signup/page.tsx`)
Renders `SignUpForm` component. Creates account and redirects to dashboard.

### Dashboard (`(dashboard)/dashboard/page.tsx`)
The main logged-in home screen. Shows:
- **Stats bar**: Project count, total commits, collaborator count, total stars received
- **Recent repositories**: Latest repos using `RepositoryCard` components
- **Activity feed**: Chronological list of create/push/collaborate events
- **Pending invitations**: Count with link to accept

Data loaded server-side via `getDashboardData()` in `lib/api/dashboard.ts`.

### Explore (`(dashboard)/explore/page.tsx`)
Discovery page showing all public repositories. Features:
- **Search bar**: Filters by repo name or description
- **Genre filter pills**: Click one or more genres to filter results
- **Sort options**: By date, stars, clones
- **Trending sidebar**: Top repos by stars
- **Profile sidebar**: Current user's quick stats

Data from `GET /repos/public`.

### Public Repo View (`explore/[owner]/[repo]/PublicRepoClient.tsx`)
The page you see when clicking a repo from Explore. Tabs:
- **Overview**: Description, audio player, YouTube player (if applicable), thumbnail, project stats, Remix button
- **Commits**: Paginated commit history with author avatars
- **Files**: Gitea file browser

The **Remix button** is the animated `[Download icon] → Remix → [Crossfade icon]` button. Clicking it opens the `CloneModal` which shows the HTTPS clone URL.

### Private Repo View (`repository/[owner]/[repo]/RepoDetailClient.tsx`)
The page the **owner** sees for their own repo. Includes the same animated **Clone button** as the public view (so users can clone their own repos to a different computer). Tabs:
- **Overview**: Same as above but also shows delete options and edit controls
- **Commits**: With diff viewer for ALS diffs
- **Files**: File browser
- **Collaborators**: Invite new collaborators, see current team
- **Settings**: Change description, genres, thumbnail, visibility toggle (Public/Private)

### Profile (`profile/[username]/page.tsx`)
Public profile page. Shows:
- Avatar, display name, bio, website
- All public repos from that user
- Join date and stats

### Repositories (`repositories/page.tsx`)
"My Projects" page. Lists all repos the current user owns or collaborates on. Uses `RepositoryCard` components. **No "create new" button** — repos are created only by pushing from the Desktop app.

### Settings (`settings/page.tsx`)
Account management:
- Update display name, bio, website
- Upload/change/delete avatar (with `ImageCropper`)
- Manage PATs (Personal Access Tokens for Desktop)
- Change password

### Clone Page (`clone/[token]/page.tsx`)
Shown when someone clicks "Remix" on a public repo. Displays:
- The repo they are cloning (name, owner, description)
- The HTTPS clone URL formatted for the Desktop app
- Instructions for use

---

## 14. Web App — Components Explained

### `Navbar.tsx`
Persistent top navigation bar. Shows:
- SoundHaus logo (white, turns blue on hover)
- Dashboard links when logged in (Dashboard, Explore, My Projects)
- Login/Signup when logged out
- User avatar with dropdown (Settings, Logout)

### `RepositoryCard.tsx`
Card component used in the dashboard, repositories page, and explore page to display a single repo. Shows:
- Thumbnail image OR animated waveform placeholder bars (if no thumbnail)
- Repo name and owner display name
- Genre tags
- Star count, clone count
- "Remix" icon button (owner-only view) or play icon (public view)
- Links to the repo detail page

### `AudioPlayer.tsx`
A full-featured audio player using the browser's native Audio API. Features:
- Play/pause button
- Scrubber / seek bar
- Time display (current / total)
- Volume control
- Waveform visualization

### `AudioPlayerWithComments.tsx`
Extends `AudioPlayer` with a time-stamped comment overlay. Shows comment markers on the waveform at the seconds where each comment was left. Used on public and private repo pages.

### `DiffView.tsx`
Renders an Ableton `.als` diff — shows what changed between two commits in a structured list of additions/removals/modifications to tracks, clips, and devices.

### `ImageCropper.tsx`
A canvas-based image crop/zoom/pan component. Used for:
- Profile picture uploads (circular crop, 1:1 aspect ratio)
- Thumbnail uploads (rectangular crop, 16:9 aspect ratio)

Features:
- Scrollwheel to zoom
- Click/drag to pan
- Touch support on mobile
- GIF detection: if the file is a `.gif`, skips canvas (which would flatten it) and passes the original file through unchanged, showing a live animated preview

### `CloneModal.tsx`
Modal that appears when clicking "Remix" or "Clone". Shows:
- Gitea HTTPS clone URL (`https://git.thesound.haus/{owner}/{repo}.git`) generated from `NEXT_PUBLIC_GITEA_URL` env var
- Copy to clipboard button with checkmark animation
- Instructions for pasting into the Desktop app's Clone Project window
- The URL format matches what the Desktop app validates against its `allowedRemote` (set during login from `gitea_public_url`)

### `RemixIcon.tsx`
The animated download → crossfade icon that transitions smoothly as the Remix button is hovered.

### `ThumbnailSettings.tsx`
Settings panel inside the repo settings tab. Features:
- Image upload with dimension validation (warns if image is too small)
- Opens `ImageCropper` for images
- GIF passthrough (no crop)
- YouTube URL input (stores the video ID, displays `hqdefault` thumbnail)
- Delete current thumbnail

### `SearchBar.tsx`
Generic search input component used in the Explore page and collaborator search.

### `SnippetUploader/`
Audio snippet upload UI. Shows drag-and-drop zone with file picker, validation feedback, and upload progress.

### `StemPlayer/`
Stem player that plays each separated track (vocals, drums, bass, other) independently, with individual volume sliders and mute buttons.

### `GenreEditor/`
Multi-select genre picker for repo settings. Renders genre pills with color coding.

### `UserAvatar.tsx`
Renders a user's avatar from a URL, or `DefaultAvatar.tsx` if no avatar is set. 

### `DefaultAvatar.tsx`
SVG placeholder avatar (geometric pattern) used when a user has no profile picture.

### `Spinner.tsx`
Loading spinner — a custom waveform animation used throughout the app during async operations.

### `KeyboardShortcutsModal.tsx`
Modal that lists keyboard shortcuts available in the app.

---

## 15. Web App — API Client Layer

### `lib/utils/auth.ts`
Core authenticated fetch function. Reads `sb-access-token` from the httpOnly cookie and adds `Authorization: Bearer <token>` to every request. Also reads `API_URL` from env (points to `https://api.thesound.haus` in production).

### `lib/api/client.ts`
Thin wrapper around `authenticatedFetch` that handles JSON parsing and maps HTTP errors to `{ success: false, error: "..." }` / `{ success: true, data: ... }` tuples (the `ApiResponse<T>` type).

### `lib/api/` — API function modules

| File | What it wraps |
|---|---|
| `repos.ts` | `/repos`, `/repos/public`, `/repos/{owner}/{repo}/*` |
| `commits.ts` | `/repos/{owner}/{repo}/commits` |
| `dashboard.ts` | Aggregates repos + commits + invitations into `DashboardData` |
| `invitations.ts` | `/collaborators/invitations/*` |
| `snippets.ts` | `/repos/{owner}/{repo}/snippet` |
| `stems.ts` | `/repos/{owner}/{repo}/stems/*` |
| `comments.ts` | `/repos/{owner}/{repo}/snippet/comments` |
| `genre.ts` | `/genres` |
| `profile.ts` | `/api/auth/user`, profile updates |
| `readme.ts` | Gitea repo README fetch |
| `webhooks.ts` | `/api/webhooks/activity` |

### `lib/types/api.ts`
All TypeScript interfaces for API responses. Key types:
- `ApiResponse<T>` — every API function returns this union type
- `GiteaRepo` — raw Gitea repo object
- `PublicRepo` — enriched repo from `/repos/public`
- `EnrichedRepo` — repo with SoundHaus metadata attached
- `CommitSummary` — one commit with author display name and avatar
- `UserSearchResult` — user from `/users/search` with `display_name` and `invite_email`

### `lib/actions/` — Server Actions
Next.js Server Actions are async functions marked with `"use server"` that run on the server. The web app uses them for:
- Login / Signup / Logout
- Updating repo settings, visibility, genres
- Inviting collaborators

Server Actions cannot accept `File` objects — this is why uploads use API routes instead.

---

## 16. Desktop App — Electron Architecture

**Location**: `apps/desktop/`
**Framework**: Electron + React (Vite)

### Main process (`src/electron/main.ts`)
- Creates the `BrowserWindow` with `webSecurity: false` (required for CORS from Electron to `api.thesound.haus`)
- Loads the React renderer
- Sets up IPC handlers for filesystem, git operations, and OS keychain

### Preload (`src/electron/preload.ts`)
Exposes a safe API to the renderer via `contextBridge`. The renderer can call:
- `window.api.git.*` — git clone, pull, push, status
- `window.api.pat.*` — store/retrieve PAT from OS keychain
- `window.api.fs.*` — read `.als` project files
- `window.api.shell.openExternal()` — open URLs in browser

### Login flow (`src/pages/LoginPage.tsx`, `src/electron/home.ts`)
1. User enters email/password
2. Desktop calls `POST https://api.thesound.haus/api/auth/desktop-login`
3. Receives PAT + Gitea token
4. Stores PAT in OS keychain via `electron-store`/`keytar`
5. **Critical**: Calls `setGiteaCredentials()` which:
   - Reads `~/.git-credentials`
   - Removes any existing entry for `git.thesound.haus` (prevents stale credentials from User A affecting User B)
   - Writes the new token as `https://username:token@git.thesound.haus`

### Git operations (`src/electron/home.ts`)
The Desktop app bundles its own git binary (`vendor/git/`). All git operations run the bundled binary via Node.js `child_process.spawn`:
- `git clone https://git.thesound.haus/{owner}/{repo}.git`
- `git push origin main`
- `git pull origin main`
- Git is configured to use `~/.git-credentials` for authentication

### Repo registration (first push)
When a user pushes a project for the first time:
1. Desktop calls `POST /repos/register` to create the repo in Gitea and the SoundHaus DB
2. **Always sets `private: true`** — repos must be manually made public
3. Gitea webhook is auto-registered on creation
4. After registration, git push proceeds normally

### `.als` diff generation
After each commit, the Desktop app:
1. Decompresses the `.als` file (it's a gzip'd XML)
2. Parses the XML tree
3. Diffs the current version against the previous commit
4. Calls `POST /repos/{owner}/{repo}/commits/{sha}/diff` to store the diff

---

## 17. Data Flow Walkthroughs

### User pushes an Ableton project update

```
Desktop App
  → git commit (local)
  → git push origin main (via bundled git + ~/.git-credentials)
     → Gitea receives push
     → Gitea calls POST http://fastapi:8000/api/webhooks/gitea
         → WebhookService validates HMAC-SHA256 signature
         → Creates PushEvent row (repo_id, pusher, ref, before_sha, after_sha)
         → For each commit in the push:
             → Creates CommitDetail row (sha, short_sha, message, author, timestamp, files_changed)
         → Updates RepoData.last_activity_at
     → Gitea returns 200 to webhook
  → git push completes
  
  → Desktop also calls POST /repos/{owner}/{repo}/commits/{sha}/diff
      → Stores AlsDiff (parsed .als XML diff)

Web App
  → User navigates to repo → Commits tab
  → Calls GET /repos/{owner}/{repo}/commits
      → Returns CommitDetail rows with author display names + avatar URLs
      → Each commit with an AlsDiff shows a "View Diff" button
```

### User uploads a thumbnail

```
Web App (ThumbnailSettings component, client-side)
  → User selects image file
  → ImageCropper opens (canvas-based crop/zoom/pan)
  → User confirms crop
  → POST /api/repos/{owner}/{repo}/thumbnail/upload  (Next.js API route, not Server Action)
      → API route reads sb-access-token cookie
      → Forwards multipart FormData to https://api.thesound.haus/repos/{owner}/{repo}/thumbnail/upload
          → FastAPI validates Bearer token
          → Resolves Supabase UUID → Gitea username to verify ownership
          → Uploads image blob to Supabase 'thumbnails' bucket
          → Returns { thumbnail_url: "https://..." }
      → API route forwards response to client
  → ThumbnailSettings shows the new thumbnail
```

### Collaborator invite flow

```
Repo Owner (web)
  → Types username/email in collaborator search
  → GET /users/search?q=bingus
      → Returns matching profiles with display_name and invite_email
  → Selects user, clicks "Invite"
  → POST /repos/{repo_name}/collaborators/invite { email: "real@email.com" }
      → Creates CollaboratorInvitation row (token, expiry 7 days)
      → Returns invitation token

Invitee
  → Receives email (currently: invitation token available in the app UI)
  → Uses token to call POST /collaborators/invitations/{token}/accept
      → FastAPI calls Gitea: PUT /api/v1/repos/{owner}/{repo}/collaborators/{username}
      → Marks invitation as accepted in DB
  → Invitee can now push to the repo
```

---

## 18. External APIs We Call

| API | When | Credentials |
|---|---|---|
| **Supabase Auth REST API** | Login, signup, token refresh, user lookup | `SUPABASE_PUB_KEY` (client), `SUPABASE_SERVICE_KEY` (admin ops) |
| **Supabase Storage REST API** | Upload/delete audio snippets, stems, avatars, thumbnails | `SUPABASE_SERVICE_KEY` |
| **Gitea Admin API** (`/api/v1/admin/...`) | Create users, manage users | `GITEA_ADMIN_TOKEN` |
| **Gitea Repo API** (`/api/v1/repos/...`) | CRUD repos, manage collaborators, list contents, register webhooks | `GITEA_ADMIN_TOKEN` |
| **Gitea Git protocol** | Clone/push/pull (Desktop only — goes through git binary, not API) | User's Gitea token (from `~/.git-credentials`) |
| **YouTube Data API** | Not called — we only parse the video ID from the URL client-side and construct `https://img.youtube.com/vi/{id}/hqdefault.jpg` | None |

---

## 19. Environment Variables Reference

### Root compose env (`.env.compose.remote`)

| Variable | Purpose |
|---|---|
| `GITEA_DB_PASSWORD` | PostgreSQL password for Gitea's database |
| `GITEA_SECRET_KEY` | Gitea session/security key |
| `GITEA_INTERNAL_TOKEN` | Gitea's internal communication token |
| `GITEA_DOMAIN` | Gitea's public domain (`git.thesound.haus`) |
| `GITEA_ROOT_URL` | Gitea's full public URL (`https://git.thesound.haus/`) |
| `GITEA_SSH_DOMAIN` | Domain for SSH cloning (`git.thesound.haus`) |
| `BACKEND_ENV_FILE` | Path to the FastAPI env file (`./apps/backend/.env.remote`) |
| `BROKER_API_KEY` | Shared key for the token broker (must match `TOKEN_BROKER_API_KEY`) |

### Backend env (`apps/backend/.env.remote`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase PostgreSQL connection string |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUB_KEY` | Supabase anon public key |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (bypasses Row Level Security) |
| `GITEA_URL` | Internal Docker URL (`http://gitea:3000`) |
| `GITEA_PUBLIC_URL` | Public URL for clone links (`https://git.thesound.haus`) |
| `GITEA_ADMIN_TOKEN` | Admin-level Gitea API token |
| `GITEA_WEBHOOK_SECRET` | HMAC secret for validating Gitea webhook payloads |
| `TOKEN_BROKER_URL` | Internal broker URL (`http://token-broker:9000`) |
| `TOKEN_BROKER_API_KEY` | Must match `BROKER_API_KEY` in compose env |
| `REDIS_URL` | Redis connection string (`redis://redis:6379/0`) |
| `CORS_ORIGINS` | JSON array of allowed origins |
| `WEBHOOK_BASE_URL` | Used for registering Gitea webhooks (`http://fastapi:8000`) |
| `ENVIRONMENT` | `production` or `development` |
| `API_BASE_URL` | This API's own public URL (`https://api.thesound.haus`) |

### Web env (Vercel environment variables)

| Variable | Purpose |
|---|---|
| `API_URL` | Backend URL for server-side calls (`https://api.thesound.haus`) |
| `NEXT_PUBLIC_API_URL` | Backend URL for client-side calls (same value) |
| `NEXT_PUBLIC_GITEA_URL` | Gitea base URL for clone links (`https://git.thesound.haus`) |

---

## 20. Security Model

### Authentication chain

```
Browser cookie (httpOnly sb-access-token)
  → Next.js Server Action reads cookie
  → Sends Authorization: Bearer <token> to FastAPI
  → FastAPI calls Supabase to validate token
  → Returns 401 if invalid/expired
```

The access token never appears in JavaScript or the browser's `localStorage`. It's locked in an `httpOnly` cookie.

### Desktop authentication

The Desktop app's PAT (`soundh_...`) is stored in the OS keychain (via `keytar`). The PAT is bcrypt-hashed in the database — if the DB is compromised, raw tokens are not exposed.

### Gitea token management

- Gitea tokens are generated by the Token Broker (only touches the Docker socket internally)
- Stored in `~/.git-credentials` on the user's machine
- Cleared and replaced on every new login (prevents cross-user token leakage)

### Webhook validation

Every webhook from Gitea is validated with HMAC-SHA256 using `GITEA_WEBHOOK_SECRET`. Requests with invalid or missing signatures return 401.

### Rate limiting

All endpoints are rate limited via SlowAPI + Redis. Authenticated endpoints are rate-limited per user ID (not IP), preventing a single malicious user from affecting others on a shared IP.

### CORS policy

In production: only `thesound.haus`, `www.thesound.haus`, `api.thesound.haus` are allowed.  
In development: any `localhost` or `127.0.0.1` origin is allowed via a regex.

### Owner verification

All write operations on repos (upload snippet, set thumbnail, change settings, delete) verify that the requesting user's Supabase UUID resolves to the Gitea username that owns the repo. This is done by `_verify_owner()` in `routers/repos.py`.

### Secrets never in code

All credentials are loaded from environment variables via `pydantic-settings`. The `.env` files are gitignored. Example files (`.env.*.example`) contain no real values.

---

## 21. Desktop App — Visual Note Differ (SCRUM-37)

The SCRUM-37 branch added a native semantic diff system for Ableton `.als` files:

### How it works

1. **Ableton Parser** (`native/semantic-diff/src/parser.rs`) — Rust NAPI module that parses gzipped XML `.als` files into structured JSON (tracks, clips, notes, parameters).
2. **Diff Engine** (`native/semantic-diff/src/diff.rs`) — Compares two parsed project states and produces per-track note diffs (added, removed, adjusted notes with pitch/time/velocity).
3. **Piano Roll Canvas** (`src/components/diff/PianoRollCanvas.tsx`) — HTML5 Canvas component that renders a visual piano roll showing note changes as colored rectangles:
   - Green = added notes
   - Red = removed notes  
   - Blue = adjusted notes (moved/resized)
   - Gray = unchanged context notes

### Commit history flow

1. User clicks "Show changes" on the Project Page
2. Desktop calls `electronAPI.loadHistory(projectPath)` → runs `git log --format=...` on the project folder
3. User selects a commit → `electronAPI.showDiff(projectPath, sha)` runs `git diff` between that commit and its parent
4. The diff output is parsed by the Rust NAPI module to produce a `NoteDiff` struct
5. `PianoRollCanvas` renders the visual diff with per-track note changes

### Recent Projects Manager

`src/electron/recentProjectsManager.ts` persists a list of recently opened projects in `~/.soundhaus/recent-projects.json`. The home page shows these for quick access.

### Open Project Dialog

`src/components/OpenProjectDialog.tsx` shows a list of recent projects with a file browser fallback. It validates that selected folders contain a `.als` file and a `.git` directory before opening.

---

## 22. UI Design System

### Web (Next.js + Tailwind)

The web app uses a deep dark theme (`bg-zinc-950`) with "Apple glass" morphism:

- **Glass cards**: `backdrop-blur-2xl bg-white/[0.03] border border-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]`
- **CursorGlow**: A component (`components/CursorGlow.tsx`) that renders a soft radial gradient following the mouse cursor, giving the dashboard and explore pages a living, reactive feel
- **WaveformSpinner**: Custom loading indicator (`components/WaveformSpinner.tsx`) that renders animated EQ-style bars
- **PageTransition**: Fade/slide wrapper using CSS `@keyframes fade-slide-in` for smooth page-to-page transitions
- **Glass-blue accent**: `#A7C7E7` — consistent across buttons, links, hover states, and glow effects
- **Noise texture**: Subtle SVG fractal noise overlay on auth pages for depth

### Desktop (Electron + React + Tailwind)

Identical design language but with Electron-specific adjustments:

- **Color tokens**: `bg-primary (#141414)`, `bg-glass (rgba(28,26,26,0.82))`, `accent (#A7C7E7)`
- **Glass panels**: `glass-panel` class applies `backdrop-blur-xl`, inner glow shadows, and subtle border highlights
- **Animations**: `animate-fade-in`, `animate-scale-in`, `animate-slide-up` using cubic-bezier(0.16, 1, 0.3, 1) easing
- **Ambient glow**: Login and Home pages have a positioned `bg-accent/[0.04]` blur behind the main content

### Download Links

The desktop app has platform-specific installers:
- **macOS (Apple Silicon)**: `https://github.com/TheSoundHaus/SoundHaus_0.2.0/releases/download/latest/SoundHaus-0.0.1-arm64.dmg`
- **Windows**: `https://github.com/TheSoundHaus/SoundHaus_0.2.0/releases/download/latest/SoundHaus.Setup.exe`
