# SoundHaus Backend Test Suite

Test suite organized by **Auth**, **Gitea**, and **Supabase**. Each system has feature subfolders; each feature contains test scripts, `results/`, and `logs/`.

## Layout

- **auth/** — Authentication and session (Supabase Auth via FastAPI): signup, login, logout, refresh, get_user, update_user, reset_password, desktop_login
- **gitea/** — Repo and Gitea-backed operations: create_repo, list_repos, upload_delete_file, repo_contents, repo_settings, desktop_credentials, webhooks, collaborators, clone_event, repo_snippet
- **supabase/** — Supabase-backed behavior: db_connection, session_or_token_validation, pat_crud, webhook_deliveries, repo_data, genres, invitations

## Config

- **Base URL:** `run_all.py` auto-loads `apps/backend/.env.local` or `.env.remote` based on `.soundhaus-compose-profile` (written by `scripts/compose.sh` / `scripts/compose.ps1`). Use `--base-url URL` only for one-off overrides. The runner prints `PROFILE`, `ENV_FILE`, and resolved `API_BASE_URL` each run.
- **Auth:** For authenticated tests, set `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, or use a Backend PAT in `TEST_PAT`.
- **Secrets:** Use a `.env` in this directory or in `apps/backend/` (do not commit secrets).

## Running tests

```bash
# From repo root or apps/backend
pip install -r tests/requirements.txt   # or requirements-dev.txt

# Run all feature tests
python tests/run_all.py

# Start stack in a profile (writes .soundhaus-compose-profile)
./scripts/compose.sh local up -d
./scripts/compose.sh remote up -d
# PowerShell:
./scripts/compose.ps1 local up -d
./scripts/compose.ps1 remote up -d

# Run only one system
python tests/run_all.py --auth
python tests/run_all.py --gitea
python tests/run_all.py --supabase

# Run a single feature (path as shown by --dry-run)
python tests/run_all.py --feature supabase/webhook_deliveries
python tests/run_all.py --base-url http://localhost:8000  # explicit override

# Console output of captured stdout/stderr (optional)
python tests/run_all.py --logs                    # every test
python tests/run_all.py --log-failures            # failed tests only
python tests/run_all.py --gitea --logs            # combine with --auth / --gitea / --supabase
python tests/run_all.py --feature gitea/collaborators --log-failures
```

With neither `--logs` nor `--log-failures`, only `OK` / `FAIL` status lines are printed (logs are still written under each feature’s `logs/`).

Results and logs are written under each feature folder in `results/` and `logs/`. The runner keeps at most the five newest `run_*.log` files per feature (older logs are deleted automatically).

## Per-feature folders

Each feature folder contains:

- Test script(s) (e.g. `test_<name>.py`)
- `results/` — last run JSON, exit code, response samples
- `logs/` — request/response or runner logs
- `README.md` (optional) — what the feature covers and how to run
