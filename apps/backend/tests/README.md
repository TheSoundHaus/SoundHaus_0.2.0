# SoundHaus Backend Test Suite

Test suite organized by **Auth**, **Gitea**, and **Supabase**. Each system has feature subfolders; each feature contains test scripts, `results/`, and `logs/`.

## Layout

- **auth/** — Authentication and session (Supabase Auth via FastAPI): signup, login, logout, refresh, get_user, update_user, reset_password, desktop_login
- **gitea/** — Repo and Gitea-backed operations: create_repo, list_repos, upload_delete_file, repo_contents, repo_settings, desktop_credentials, webhooks, collaborators, clone_event, repo_snippet
- **supabase/** — Supabase-backed behavior: db_connection, session_or_token_validation, pat_crud, webhook_deliveries, repo_data, genres, invitations

## Config

- **Base URL:** Set `API_BASE_URL` (default `http://localhost:8000`) or pass `--base-url`.
- **Auth:** For authenticated tests, set `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, or use a Backend PAT in `TEST_PAT`.
- **Secrets:** Use a `.env` in this directory or in `apps/backend/` (do not commit secrets).

## Running tests

```bash
# From repo root or apps/backend
pip install -r tests/requirements.txt   # or requirements-dev.txt

# Run all feature tests
python tests/run_all.py

# Run only one system
python tests/run_all.py --auth
python tests/run_all.py --gitea
python tests/run_all.py --supabase
```

Results and logs are written under each feature folder in `results/` and `logs/`.

## Per-feature folders

Each feature folder contains:

- Test script(s) (e.g. `test_<name>.py`)
- `results/` — last run JSON, exit code, response samples
- `logs/` — request/response or runner logs
- `README.md` (optional) — what the feature covers and how to run
