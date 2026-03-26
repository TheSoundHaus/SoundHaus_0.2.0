---
name: Backend improvements phased plan
overview: A five-phase plan starting with a dedicated test suite organized by Auth, Gitea, and Supabase (Phase 0), then introducing async Gitea I/O with httpx, LFS to Supabase Storage, connection pooling, and SQLModel migration. Each phase is independently executable, reviewable, and testable.
---

# Backend Improvements: Phased Plan

## Current state

- **Gitea HTTP:** [gitea_service.py](SoundHaus_0.2.0/apps/backend/services/gitea_service.py) and [repo_service.py](SoundHaus_0.2.0/apps/backend/services/repo_service.py) use synchronous `requests` (15+ calls in gitea_service, 17 in repo_service). Routers in [routers/auth.py](SoundHaus_0.2.0/apps/backend/routers/auth.py), [routers/desktop.py](SoundHaus_0.2.0/apps/backend/routers/desktop.py), [routers/collaborators.py](SoundHaus_0.2.0/apps/backend/routers/collaborators.py), and [routers/repos.py](SoundHaus_0.2.0/apps/backend/routers/repos.py) call these services from async route handlers (blocking the event loop).
- **LFS:** Gitea in [docker-compose.yml](SoundHaus_0.2.0/docker-compose.yml) has `GITEA__lfs__START_SERVER=true` only; LFS uses default local storage under `./gitea`.
- **DB:** [database.py](SoundHaus_0.2.0/apps/backend/database.py) uses a single `create_engine` with `pool_pre_ping=True` and default pool size; no Supavisor/pooler URL.
- **Models:** Six SQLAlchemy ORM modules in [models/](SoundHaus_0.2.0/apps/backend/models/) (repo_models, webhook_models, clone_models, pat_models, genre_models, invitation_models) plus [schemas.py](SoundHaus_0.2.0/apps/backend/models/schemas.py) for Pydantic request/response only.
- **Tests:** No dedicated test suite; backend has no `tests/` layout organized by Auth / Gitea / Supabase.

---

## Phase 0: Dedicated test suite (Auth / Gitea / Supabase)

**Goal:** Create a structured test suite organized by system: **Auth**, **Gitea**, and **Supabase**. Under each system, use one subfolder per feature. Each feature folder contains test scripts, captured results, and logs so every later phase can be validated against the same baseline.

**Scope:**

1. **Root layout**
  Create a test root (e.g. `apps/backend/tests/`) with three top-level directories: **`auth/`**, **`gitea/`**, **`supabase/`**.
2. **Auth** (`tests/auth/`)
  Tests for authentication and user session flows (Supabase Auth via FastAPI). Subfolders per feature, e.g.:
  `signup/`, `login/`, `logout/`, `refresh/`, `get_user/`, `update_user/`, `reset_password/`, `desktop_login/` (if distinct).
  Scripts call endpoints such as `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`, etc.
3. **Gitea** (`tests/gitea/`)
  Tests for Git repo and Gitea-backed operations. Subfolders per feature, e.g.:
  `create_repo/`, `list_repos/`, `upload_delete_file/`, `repo_contents/`, `repo_settings/`, `desktop_credentials/`, `webhooks/`, `collaborators/`, `clone_event/`, `repo_snippet/`.
  Scripts call endpoints that hit Gitea (repos, contents, upload, delete, webhook activity, PAT/credentials, collaborators).
4. **Supabase** (`tests/supabase/`)
  Tests for Supabase-backed behavior: DB persistence, session validation, or storage when applicable. Subfolders per feature, e.g.:
  `db_connection/`, `session_or_token_validation/`, `pat_crud/`, `webhook_deliveries/`, `repo_data/`, `genres/`, `invitations/`.
  Scripts may call FastAPI endpoints that read/write Supabase/Postgres (e.g. PATs, webhook config, repo_data, genres) or validate that auth/session data is stored correctly.
5. **Per-feature folder contents** (same under `auth/`, `gitea/`, and `supabase/`)
  Each feature folder (e.g. `auth/signup/`, `gitea/create_repo/`) contains:
  - **Test script(s):** Scripts that exercise the feature (e.g. `test_signup.py` or `run_signup.sh`). Use a consistent style (Python with httpx/requests or shell with curl). Scripts run against a configurable base URL (env or config).
  - **results/:** Directory for test run outputs (e.g. last run JSON, exit code, response samples).
  - **logs/:** Directory for request/response or test runner logs. Optionally gitignore `logs/*` and `results/*` or commit samples.
  - **README.md (optional):** Short description of the feature, how to run the script, and what "pass" looks like.
6. **Runner and config**
  - Top-level runner (e.g. `tests/run_all.py` or `tests/run_features.sh`) that discovers and runs tests under `auth/`, `gitea/`, and `supabase/`, and writes results/logs into each feature folder. Optionally support running only one system (e.g. `--auth`, `--gitea`, `--supabase`).
  - Config: base URL (e.g. `http://localhost:8000`), optional auth (test user / PAT), env file for secrets. Document in `tests/README.md`.
7. **Dependencies**
  If using Python for scripts: add httpx or requests (and optionally pytest) to dev/test dependencies (e.g. `requirements-dev.txt` or `tests/requirements.txt`).
8. **Deliverables**
  Directory structure `tests/{auth,gitea,supabase}/<feature_name>/{scripts, results/, logs/}`; at least one runnable script per feature; runner that can execute all tests or per-system; brief README for the suite.

**Review:** Confirm structure matches team conventions; ensure no secrets in committed logs/results.
**Test:** Run the suite against a local backend; all feature scripts complete and results/logs appear in the right folders.

**Execution:** Phase 0 runs first. After Phase 0, every later phase (1–4) should be validated by re-running this suite and comparing results.

---

## Phase 1: httpx for async I/O to Gitea

**Goal:** Replace blocking `requests` with `httpx` async client so Gitea operations no longer block the FastAPI event loop.

**Scope:**

1. **Add dependency**
  In [requirements.txt](SoundHaus_0.2.0/apps/backend/requirements.txt) add `httpx`.
2. **GiteaAdminService** ([services/gitea_service.py](SoundHaus_0.2.0/apps/backend/services/gitea_service.py))
  - Instantiate `httpx.AsyncClient(base_url=..., headers=..., timeout=...)` (e.g. in `__init__` or as a shared client). Use a single client per process with reasonable `limits=httpx.Limits(max_connections=...)` for connection pooling.
  - Replace every `requests.get/post/patch/delete` with `await self._client.get/post/patch/delete` and use `response.json()`, `response.status_code`, etc.
  - Make all public methods `async` (e.g. `create_user`, `get_user_by_username`, `create_webhook`, `verify_gitea_token`, `list_user_tokens`, `delete_user_token`, etc.).
  - **Token creation:** `create_or_get_user_token_cli` uses `subprocess.run` (SSH/Docker). Keep it sync and call it via `await asyncio.to_thread(self.create_or_get_user_token_cli, ...)` from the async `create_or_get_user_token` so the event loop is not blocked.
3. **RepoService** ([services/repo_service.py](SoundHaus_0.2.0/apps/backend/services/repo_service.py))
  - Same pattern: `httpx.AsyncClient` with base URL and auth headers, make all methods that do HTTP `async` (e.g. `get_repo`, `list_user_repos`, `create_user_repo`, `_init_lfs_for_repo`, `upload_file`, `delete_file`, `get_repo_contents`, `_fetch_lfs_content`, `update_repo_settings`, `list_collaborators`, `add_collaborator`, `remove_collaborator`, etc.).
  - Keep `_create_repo_webhook` using the Gitea admin service (which will be async), so call `await gitea_admin_service.create_webhook(...)`.
4. **Call sites**
  Update all routers to `await` Gitea/Repo service calls:
  - [routers/auth.py](SoundHaus_0.2.0/apps/backend/routers/auth.py): signup flow (`get_user_by_username`, `create_user`).
  - [routers/desktop.py](SoundHaus_0.2.0/apps/backend/routers/desktop.py): `get_desktop_credentials` (`verify_gitea_token`, `create_or_get_user_token`).
  - [routers/collaborators.py](SoundHaus_0.2.0/apps/backend/routers/collaborators.py): invite/accept/remove (`get_user_by_username`, `create_user`, `get_repo`, `list_collaborators`, `add_collaborator`, `remove_collaborator`).
  - [routers/repos.py](SoundHaus_0.2.0/apps/backend/routers/repos.py): list, create, contents, upload, delete, settings, snippet (`list_user_repos`, `create_user_repo`, `get_repo_contents`, `upload_file`, `delete_file`, `update_repo_settings`, `get_repo_contents`).
  - [services/webhook_service.py](SoundHaus_0.2.0/apps/backend/services/webhook_service.py): if it ever calls Gitea (e.g. for webhook creation), that path goes through RepoService/GiteaAdminService; ensure callers of webhook_service still use async where needed.
5. **Client lifecycle**
  Create the httpx client at app startup (e.g. lifespan or dependency) and close it on shutdown so connections are reused and closed cleanly.

**Deliverables:** All Gitea HTTP via httpx async; token CLI offloaded with `asyncio.to_thread`; routers updated; tests and manual checks (signup, create repo, upload file, desktop credentials, webhooks) pass.

**Review:** Code review for async/await usage, client reuse, and error handling.
**Test:** Run Phase 0 test suite; also manually hit signup, login, create repo, upload/delete file, get desktop credentials, and trigger a push webhook.

---

## Phase 2: Gitea LFS storage to Supabase Storage

**Goal:** Store Gitea LFS objects in Supabase Storage (S3-compatible) instead of local disk.

**Prerequisites:** Supabase project with Storage enabled. Create a dedicated bucket for LFS (e.g. `gitea-lfs`). In Supabase Dashboard: **Storage > S3 Configuration** — create S3 Access Keys and note endpoint (e.g. `https://<project_ref>.storage.supabase.co/storage/v1/s3`), region, access key ID, secret.

**Scope:**

1. **Gitea LFS config**
  Gitea expects MinIO-compatible env vars. Supabase S3 is compatible; use a custom storage type in Gitea's config.
  - In [docker-compose.yml](SoundHaus_0.2.0/docker-compose.yml) (or a Gitea `app.ini` mounted from host), add a `[storage.lfs]` (or custom) section and set `[lfs] STORAGE_TYPE` to that storage.
  - Alternatively use Gitea environment variables if your Gitea version supports configuring LFS storage via env (e.g. `GITEA__storage__lfs__STORAGE_TYPE`, `GITEA__storage__lfs__MINIO_*`).
  - Map Supabase to MinIO-style vars:
    - Endpoint: use host part for `MINIO_ENDPOINT` (e.g. `<project_ref>.storage.supabase.co` with port 443 if required).
    - `MINIO_USE_SSL=true`, `MINIO_BUCKET=gitea-lfs` (or your bucket name).
    - `MINIO_ACCESS_KEY_ID` / `MINIO_SECRET_ACCESS_KEY` from Supabase S3 keys.
    - If Gitea requires path-style and Supabase uses a path like `/storage/v1/s3`, confirm Gitea MinIO driver supports that or use a proxy; document any limitation.
2. **Secrets**
  Do not commit credentials. Use Docker `env_file` pointing to a non-committed file, or Docker secrets, and document in [.env.example](SoundHaus_0.2.0/apps/backend/.env.example) (or repo-level) the required variable names for LFS (e.g. `GITEA_LFS_S3_*` or `GITEA__storage__lfs__*`).
3. **Migration of existing LFS data**
  If you already have LFS objects on disk, either: (a) document a one-time migration (e.g. script to upload existing LFS files from `./gitea` to Supabase bucket and update pointers), or (b) state that new LFS objects will use Supabase and existing ones remain on disk until repos are re-pushed. Choose one and document in a short LFS-migration note.

**Deliverables:** Gitea LFS configured to use Supabase Storage; env/secrets documented; migration approach documented.

**Review:** Verify no credentials in repo; confirm bucket name and IAM/RLS if applicable.
**Test:** New repo, add a file tracked by LFS (e.g. `.gitattributes` + push a `.wav`), confirm object appears in the Supabase bucket and clone/pull works.

---

## Phase 3: Connection pooling (Supabase and Gitea)

**Goal:** Use Supabase's pooler for DB connections and rely on httpx for Gitea connection reuse (set in Phase 1).

**Scope:**

1. **Supabase (Supavisor)**
  - In [config.py](SoundHaus_0.2.0/apps/backend/config.py), `database_url` is already read from env. Document that for production/high concurrency the app should use the **Supavisor pooler URL** (transaction mode, port 6543):
   `postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres`
  - Update [.env.example](SoundHaus_0.2.0/apps/backend/.env.example) (or repo-level) with a comment and example `DATABASE_URL` using the pooler.
  - In [database.py](SoundHaus_0.2.0/apps/backend/database.py), optionally set explicit pool parameters when using the pooler (e.g. `pool_size=10`, `max_overflow=5`, `pool_recycle=300`) so the app does not open more connections than the pooler allows; keep `pool_pre_ping=True`.
2. **Gitea**
  - No separate "Gitea connection pool" service. Phase 1's `httpx.AsyncClient` with `limits=httpx.Limits(max_connections=...)` provides connection reuse and limits. Ensure Phase 1 sets sensible limits and uses one client per service (or shared); document in code or GITEA_SCALABILITY_PLAN that this is the Gitea connection pool.

**Deliverables:** Docs and .env.example updated for Supavisor; database.py pool settings optional but recommended; Gitea pooling documented as "httpx client in Phase 1".

**Review:** Confirm pooler URL format and pool sizes.
**Test:** Run under load (e.g. many concurrent signups or repo listings) and verify DB connections stay within pooler limits and Gitea calls succeed.

---

## Phase 4: SQLModel instead of SQLAlchemy/Pydantic for ORM

**Goal:** Use SQLModel for all database-backed models; keep Pydantic-only for request/response schemas that do not map to tables.

**Scope:**

1. **Dependencies**
  Add `sqlmodel` to [requirements.txt](SoundHaus_0.2.0/apps/backend/requirements.txt). SQLModel pulls in SQLAlchemy and Pydantic; keep `pydantic` and `sqlalchemy` if other code still references them, or rely on SQLModel's transitive deps.
2. **Database and session**
  In [database.py](SoundHaus_0.2.0/apps/backend/database.py):
  - Use `sqlmodel.create_engine` (or keep `sqlalchemy.create_engine`; SQLModel works with it) and `sqlmodel.Session`/`sessionmaker(bind=engine, class=sqlmodel.Session)` so the session yields SQLModel-compatible sessions.
  - Replace `Base = declarative_base()` with SQLModel's base for table models (e.g. `from sqlmodel import SQLModel` and use `SQLModel` as the base for tables).
3. **Convert ORM models to SQLModel**
  Convert in dependency order (child tables first or ensure base is set):
  - [models/webhook_models.py](SoundHaus_0.2.0/apps/backend/models/webhook_models.py): `WebhookDelivery`, `PushEvent`, `RepositoryEvent`, `WebhookConfig` — change to `class X(SQLModel, table=True)` with `Field(..., foreign_key=...)` and `Relationship()`.
  - [models/clone_models.py](SoundHaus_0.2.0/apps/backend/models/clone_models.py): `CloneEvent`.
  - [models/pat_models.py](SoundHaus_0.2.0/apps/backend/models/pat_models.py): `PersonalAccessToken`.
  - [models/invitation_models.py](SoundHaus_0.2.0/apps/backend/models/invitation_models.py): `CollaboratorInvitation`.
  - [models/genre_models.py](SoundHaus_0.2.0/apps/backend/models/genre_models.py): `repo_genres` association table and `GenreList`; keep many-to-many with SQLModel's pattern (link table as `SQLModel, table=True` or existing `Table` with SQLModel metadata).
  - [models/repo_models.py](SoundHaus_0.2.0/apps/backend/models/repo_models.py): `RepoData` (most relationships).
   Preserve column names, types, FKs, and indexes so the existing DB schema remains valid. Keep helper functions in webhook_models (`validate_webhook_signature`, `parse_gitea_event`, `extract_repo_info`) unchanged.
4. **Request/response schemas**
  Leave [models/schemas.py](SoundHaus_0.2.0/apps/backend/models/schemas.py) as Pydantic-only (`BaseModel`): `SignUpRequest`, `SignInRequest`, `CreateRepoRequest`, `UploadFileRequest`, `WebhookPayload`, etc. Do not convert these to SQLModel table models.
5. **Imports and init_db**
  Update [models/__init__.py](SoundHaus_0.2.0/apps/backend/models/__init__.py) to export from the new SQLModel modules. In [database.py](SoundHaus_0.2.0/apps/backend/database.py) `init_db()`, import all SQLModel table models so `SQLModel.metadata.create_all(bind=engine)` (or equivalent) creates all tables. Ensure dependency order of imports avoids circular imports.
6. **Alembic**
  If you use Alembic, run a revision after the migration. If schema is unchanged (same columns/types), autogenerate may produce an empty revision; that's acceptable. New deployments can run `create_all` or migrations as usual.

**Deliverables:** All table models as SQLModel; schemas.py remains Pydantic; database.py and init_db use SQLModel; existing DB schema compatible.

**Review:** Check relationships and FKs; ensure no N+1 or missing back_populates.
**Test:** Full regression: signup, repos, webhooks, collaborators, PATs, genres, clone events, and any endpoint that reads/writes these tables.

---

## Execution order and dependencies

```mermaid
flowchart LR
  P0[Phase 0: Test suite]
  P1[Phase 1: httpx async]
  P2[Phase 2: LFS Supabase]
  P3[Phase 3: Connection pooling]
  P4[Phase 4: SQLModel]
  P0 --> P1
  P1 --> P3
  P2 -.-> P3
  P3 --> P4
```

- **Phase 0** first: create the dedicated test suite (auth / gitea / supabase with feature subfolders, each containing scripts, results, and logs). Run it to establish a baseline; re-run after each later phase to validate.
- **Phase 1** next: unblocks event loop and establishes the Gitea HTTP client (pooling for Gitea in Phase 3 is then "done" by configuration of that client).
- **Phase 2** can run in parallel with Phase 1 or after; no code dependency.
- **Phase 3** after Phase 1 (so Gitea pooling is just configuring the same client); Supavisor can be done anytime.
- **Phase 4** last: avoids changing both DB access pattern and ORM in the same step; run after pooling is stable.

Each phase: implement, review, run Phase 0 test suite (and any phase-specific tests), then merge before starting the next.
