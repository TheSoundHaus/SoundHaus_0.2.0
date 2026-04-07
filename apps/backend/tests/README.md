# SoundHaus Backend Test Suite

Integration tests organized by **Auth**, **Gitea**, and **Supabase**. Each system has feature subfolders; each feature contains executable scripts (not pytest functions), `results/`, and `logs/`.

## Layout

- **auth/** — Authentication and session (Supabase Auth via FastAPI): signup, login, logout, refresh, get_user, update_user, reset_password, desktop_login
- **gitea/** — Repo and Gitea-backed operations: create_repo, list_repos, upload_delete_file, repo_contents, repo_settings, desktop_credentials, webhooks, collaborators, clone_event, repo_snippet
- **supabase/** — Supabase-backed behavior: db_connection, session_or_token_validation, pat_crud, webhook_deliveries, repo_data, genres, invitations

## Runner: `run_all.py` (not pytest)

- **Use `python tests/run_all.py`** to execute the suite. Scripts are named `test_*.py` but implement `main()` / HTTP flows; **`pytest`** is not the supported runner for these integration tests (see `pyproject.toml` for other tooling).
- **`--dry-run`** — list discovered tests without executing.

## Config

- **Profile → env file:** `run_all.py` loads **`apps/backend/.env.local`** or **`.env.remote`** based on **`.soundhaus-compose-profile`** at the repo root (`local` or `remote`). That file is written when you run **`compose.sh`** / **`compose.ps1`** (repo root) with the matching profile. If the profile file is missing, the runner defaults to **local** and may fall back to **`.env`**.
- **API base URL:** Taken from the loaded env (`API_BASE_URL`). Override with **`--base-url https://your-api.example.com`** (e.g. smoke-test a DigitalOcean deployment from your laptop). The runner prints **`PROFILE`**, **`ENV_FILE`**, and **`API_BASE_URL`** each run.
- **Authenticated tests:** Set **`TEST_USER_EMAIL`** and **`TEST_USER_PASSWORD`**, or **`TEST_PAT`** (backend PAT), in the same backend env file you use for the stack.
- **Secrets:** Keep credentials in **`apps/backend/.env.local`** / **`.env.remote`** or a local-only `.env` under `tests/` — never commit them.

## Rate limiting and full-suite runs

- **`POST /api/auth/login`** uses **`RATE_LIMIT_AUTH`** (default **10/minute** in code), not only `RATE_LIMIT_DEFAULT`. Many features call login independently; a full `run_all.py` can exceed **10 logins/minute** from one IP.
- **`RATE_LIMIT_ENABLED=false`** disables SlowAPI for the FastAPI process; if you change rate env vars, **restart the `fastapi` container** so the process sees them (`docker compose --env-file .env.compose.local restart fastapi`). To confirm inside the container: `docker exec fastapi printenv RATE_LIMIT_ENABLED`.
- A **`429`** body like `{"error":"Rate limit exceeded: 10 per 1 minute"}` comes from **SlowAPI** on the API, not from Supabase.

## Running tests

Run from **`apps/backend`** (paths below assume that cwd):

```bash
pip install -r tests/requirements.txt   # or requirements-dev.txt

python tests/run_all.py
```

Start the stack with the same intent as your profile (from **repo root**):

```bash
./compose.sh local up -d
./compose.sh remote up -d
# Windows PowerShell:
./compose.ps1 local up -d
./compose.ps1 remote up -d
```

Slices and debugging:

```bash
python tests/run_all.py --auth
python tests/run_all.py --gitea
python tests/run_all.py --supabase
python tests/run_all.py --feature supabase/webhook_deliveries
python tests/run_all.py --base-url http://localhost:8000

python tests/run_all.py --logs
python tests/run_all.py --log-failures
python tests/run_all.py --gitea --log-failures
```

With neither **`--logs`** nor **`--log-failures`**, only **`OK` / `FAIL`** lines are printed (logs still go to each feature’s **`logs/`**).

## Optional / known behaviors

- **`auth/reset_password`:** If **`PASSWORD_RESET_EMAIL_ENABLED=false`** in backend env, the API may return **503** or related errors; that is expected until email reset is enabled.
- **Gitea errors** (`user redirect does not exist`, DB password failures): usually Gitea provisioning or **`GITEA_DB_PASSWORD`** / volume mismatch—see root **README** troubleshooting.

Results and logs are written under each feature folder in **`results/`** and **`logs/`**. The runner keeps at most the five newest **`run_*.log`** files per feature.

## Per-feature folders

Each feature folder contains:

- Test script(s) (e.g. `test_<name>.py`)
- `results/` — last run JSON, exit code, response samples
- `logs/` — request/response or runner logs
- `README.md` (optional) — what the feature covers and how to run
