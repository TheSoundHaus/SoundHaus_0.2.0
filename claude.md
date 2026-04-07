# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SoundHaus is a monorepo for a collaborative music production platform built around git-ified Ableton projects. Three apps live under `apps/`:

- **`apps/desktop/`** — Electron + React app; the day-to-day user tool. Bundles its own git binaries. All git operations (clone/push/pull) bypass FastAPI entirely — git acts as the proxy directly to Gitea.
- **`apps/web/`** — Next.js (App Router) frontend for social discovery and repo management. Read-only access to repos; all writes happen via the desktop app.
- **`apps/backend/`** — FastAPI service (Uvicorn) that mediates between Supabase (auth + user data) and Gitea (git server on Digital Ocean). Also handles large audio file storage via Digital Ocean.

## Running the Stack

Start/stop via compose scripts at the repo root:

```bash
# Linux/Mac
./compose.sh local up -d
./compose.sh remote up -d

# Windows PowerShell
./compose.ps1 local up -d
./compose.ps1 remote up -d
```

The profile (`local` or `remote`) is written to `.soundhaus-compose-profile` and controls which env file the test runner loads.

## Backend

### Running

```bash
cd apps/backend
uvicorn main:app --reload
```

### Tests

Tests are **integration tests**, not pytest unit tests. They implement `main()` HTTP flows and are run via a custom runner:

```bash
cd apps/backend
pip install -r tests/requirements.txt

python tests/run_all.py              # full suite
python tests/run_all.py --auth       # auth tests only
python tests/run_all.py --gitea      # gitea/repo tests only
python tests/run_all.py --supabase   # supabase tests only
python tests/run_all.py --feature supabase/webhook_deliveries  # single feature
python tests/run_all.py --base-url http://localhost:8000        # override base URL
python tests/run_all.py --log-failures  # print logs for failed tests only
python tests/run_all.py --dry-run       # list discovered tests without running
```

Test credentials go in `apps/backend/.env.local` or `.env.remote` — set `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, and/or `TEST_PAT`. If running the full suite locally, set `RATE_LIMIT_ENABLED=false` in the backend env and restart the container to avoid hitting the 10 login/min rate limit.

### Test structure

Tests are organized under `tests/auth/`, `tests/gitea/`, and `tests/supabase/`. Each feature gets its own subfolder with `test_<name>.py`, `results/`, and `logs/`.

**Routers with no test coverage yet:** `audio`, `comments`, `health`, `stems`
**Routers with partial coverage:** `collaborators`, `repos`, `snippets`

### Architecture

- `main.py` — app assembly, middleware, router registration
- `routers/` — thin route handlers; all business logic lives in `services/`
- `services/` — `auth_service`, `gitea_service`, `repo_service`, `snippet_service`, `demucs_service`, `webhook_service`, `pat_service`, `profile_service`, `redis_service`
- `models/` — Pydantic request/response models (separate models per concern)
- `dependencies.py` — shared `Depends()` factories (auth, DB, rate limiter)
- `database.py` — Supabase PostgreSQL connection and init
- `config.py` — settings loaded from `.env`

Every non-public route requires auth via `Depends()`. Route handlers must be `async def` with explicit `response_model=` and `status_code=`.

## Web App (`apps/web/`)

Next.js App Router. Pages under `app/`. See `apps/web/CLAUDE.md` for web-specific rules — UI work requires the `frontend-design` skill.

Key constraints:
- FastAPI URL is server-only — never prefix with `NEXT_PUBLIC_`
- Never call FastAPI from client components — use Server Components or Server Actions
- Auth protection enforced in `middleware.ts`

## Desktop App (`apps/desktop/`)

Electron main process at `src/electron/main.ts`. React renderer pages under `src/pages/`. Electron IPC handlers in `src/electron/` (`home.ts`, `login.ts`, `project.ts`, etc.).

Git operations are executed via the bundled git binary — no FastAPI involvement for clone/push/pull.

## Code Style

- **Python**: 4-space indent, `snake_case` variables/functions, `PascalCase` classes. All route functions `async def`. Pydantic v2.
- **JS/TS**: 2-space indent, `camelCase` variables/functions, `PascalCase` components/types. `strict: true`. No `any`. `const` by default.
- **Imports**: stdlib → external → internal → local, separated by blank lines. Use `@/` alias for Next.js internal imports.
- Max line length: 100 characters.

## Key Constraints

- **Do not create new API endpoints** unless explicitly instructed. Always read the full router file before making API decisions.
- **Do not edit more than 2 files at a time** unless the user specifies which files.
- **Do not refactor entire features.** Scope changes to exactly what was asked.
- **Always check `structure.txt`** for the current file tree. If it's out of sync with reality, alert the user to rerun the ai-prep script.
- **Do not edit `SOUNDHAUS.md`.**
- Route handlers are thin — business logic belongs in `services/`, not in `routers/`.
- Never expose stack traces in API responses. Never log PII or tokens.
- Supabase service role key: FastAPI only. Anon key: Next.js client only.
