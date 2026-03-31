# SoundHaus

A collaborative music project management platform with version control powered by Gitea, user authentication via Supabase, and real-time file syncing.

## 🏗️ Architecture

- **Frontend**: Next.js (`apps/web`), Electron desktop (`apps/desktop`)
- **Backend**: FastAPI (Python) in `apps/backend`
- **Git Server**: Gitea (self-hosted, Docker)
- **Database**: PostgreSQL (Gitea’s `gitea_db`); app data via Supabase
- **Authentication**: Supabase
- **File Storage**: Git LFS (Large File Storage for audio files)

## 📁 Project Structure

```
SoundHaus_0.2.0/
├── apps/
│   ├── backend/           # FastAPI API (main.py, routers, services, tests/)
│   ├── web/               # Next.js web app
│   └── desktop/           # Electron + Vite desktop app
├── compose.sh / compose.ps1   # Docker Compose profile wrappers (local | remote)
├── scripts/               # deploy, backup, helpers
├── workers/               # File watcher worker scripts
├── gitea/                 # Gitea bind-mount data (local dev)
├── docker-compose.yml     # Stack: gitea_db, gitea, fastapi, token-broker
└── .env.compose.local     # Compose profile files (see below)
```

## 🔧 Configuration: local vs remote

SoundHaus uses **two layers** of environment files:

| Layer | Purpose |
|--------|---------|
| **`.env.compose.local`** / **`.env.compose.remote`** | Compose variable substitution (`GITEA_DB_PASSWORD`, `GITEA_SECRET_KEY`, `GITEA_INTERNAL_TOKEN`, `HOME` for SSH mount, etc.) and **`BACKEND_ENV_FILE`** |
| **`apps/backend/.env.local`** / **`apps/backend/.env.remote`** | FastAPI settings (Supabase, Gitea URLs/tokens, `API_BASE_URL`, rate limits, test users) loaded into the **`fastapi`** container via `env_file` |

Copy from the `*.example` files at the repo root and under `apps/backend/`.

- **Local development (your machine):** use **`local`** profile → typically `BACKEND_ENV_FILE=./apps/backend/.env.local` with `GITEA_URL=http://gitea:3000` and `API_BASE_URL=http://localhost:8000`.
- **DigitalOcean droplet (or any remote host):** use **`remote`** profile on that host → `apps/backend/.env.remote` with public hostnames, webhook URLs Gitea can reach, etc.

**Important:** `GITEA_DB_PASSWORD`, `GITEA_SECRET_KEY`, and `GITEA_INTERNAL_TOKEN` are tied to the **Gitea Postgres volume** on that machine. Use **different** values on a droplet than on your laptop; do not change `GITEA_DB_PASSWORD` on an existing volume without updating Postgres or recreating the volume.

The compose wrappers write **`.soundhaus-compose-profile`** (`local` or `remote`) so the backend integration test runner (`apps/backend/tests/run_all.py`) picks the matching `apps/backend/.env.local` or `.env.remote`.

## 📜 Compose (repo root) and `scripts/`

| Script | Role |
|--------|------|
| **`compose.sh`** / **`compose.ps1`** (repo root) | `compose.sh local up -d` or `compose.ps1 remote up -d` — runs `docker compose --env-file .env.compose.<profile> …` from the repo root and updates `.soundhaus-compose-profile`. |
| **`deploy-digital-ocean.sh`** (`scripts/`) | Rsync `docker-compose.yml`, root **`.env`**, and `apps/backend/` to `/opt/soundhaus` on a droplet, open firewall ports, `docker compose up -d`. See **`scripts/DEPLOYMENT.md`**. |
| **`backup.sh`** | Backup helper (Gitea / DB-related; review script for flags). |
| **`run_desktop.sh`** | Local desktop app helper. |
| **`bootstrap_local_gitea_admin.py`** | Optional Gitea admin bootstrap (see script docstring). |

**PowerShell (Windows):** from repo root, `.\compose.ps1 local up -d`

**Legacy:** plain `docker compose up` without `--env-file .env.compose.local` uses default `BACKEND_ENV_FILE=./apps/backend/.env` if set nowhere else—prefer the **local** profile.

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for `apps/web` / `apps/desktop`)
- Python 3.11+ (for backend tests or non-Docker backend runs)

### 1. Clone and env templates

```bash
git clone <your-repo-url>
cd SoundHaus_0.2.0

cp .env.compose.local.example .env.compose.local
cp apps/backend/.env.local.example apps/backend/.env.local
# For remote host: also .env.compose.remote.example → .env.compose.remote, .env.remote.example → .env.remote
```

Fill in **`.env.compose.local`** (Gitea DB password, secrets, `HOME`) and **`apps/backend/.env.local`** (Supabase, Gitea admin token, `API_BASE_URL`, etc.).

### 2. Backend credentials (in `apps/backend/.env.local`)

```env
# Gitea (Docker internal URL for the API container)
GITEA_URL=http://gitea:3000
GITEA_PUBLIC_URL=http://localhost:3000
GITEA_ADMIN_TOKEN=your-gitea-admin-token

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUB_KEY=your-publishable-key
SUPABASE_SERVICE_KEY=your-service-role-key

# Clients / tests on the host
API_BASE_URL=http://localhost:8000
```

#### Getting Gitea Admin Token

1. Start the stack: `./compose.sh local up -d` (or `.\compose.ps1 local up -d` on Windows).
2. Open Gitea: http://localhost:3000
3. Log in as admin → **Settings → Applications → Manage Access Tokens**
4. Generate a token with **ALL** scopes (including **`write:admin`**).
5. Put the token in **`apps/backend/.env.local`** as `GITEA_ADMIN_TOKEN`, then restart FastAPI:  
   `./compose.sh local restart fastapi`

#### Getting Supabase Credentials

1. [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Settings → API**
2. Map **Project URL**, **anon public**, **service_role**, and **JWT Secret** into `apps/backend/.env.local` as documented in `apps/backend/.env.local.example`.

### 3. Start services (recommended: local profile)

```bash
./compose.sh local up -d --build
# Logs (optional): docker compose --env-file .env.compose.local logs -f
```

### 4. Verify services

```bash
docker compose --env-file .env.compose.local ps
curl http://localhost:8000/health
```

- API: http://localhost:8000 — Docs: http://localhost:8000/docs  
- Gitea: http://localhost:3000  

### 5. Web frontend (`apps/web`)

```bash
cd apps/web
npm install
npm run dev
```

Default Next.js dev URL is shown in the terminal (often http://localhost:3000—change one of Gitea or Next port if they conflict, or run web on another port per Next docs).

## 🧪 Testing the Application

### Backend integration test suite

Automated HTTP tests live under **`apps/backend/tests/`** (auth, Gitea, Supabase features). The runner is **`python tests/run_all.py`** from `apps/backend` (after `pip install -r tests/requirements.txt`).

Full detail: **[apps/backend/tests/README.md](apps/backend/tests/README.md)**.

Summary:

- Start the stack with the same profile you use for dev (`local` recommended).
- Set **`TEST_USER_EMAIL`** and **`TEST_USER_PASSWORD`** in `apps/backend/.env.local` for authenticated scenarios.
- **`POST /api/auth/login`** is rate-limited separately from `RATE_LIMIT_DEFAULT`. For a full suite in one minute, set **`RATE_LIMIT_AUTH`** high or **`RATE_LIMIT_ENABLED=false`** in the backend env file and **restart** the `fastapi` container so the process picks up changes.

Manual smoke checks and curl examples below.

### Test API Endpoints

#### 1. Test Root Endpoint
```bash
curl http://localhost:8000/
# Expected: {"message":"SoundHaus API","version":"1.0.0","status":"running"}
```

#### 2. Test Health Check
```bash
curl http://localhost:8000/health
# Expected: {"status":"healthy"}
```

#### 3. Test Authentication (Sign Up)
```bash
curl -X POST http://localhost:8000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword123",
    "name": "Test User"
  }'
```

#### 4. Test Authentication (Login)
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword123"
  }'

# Save the access_token from response for next requests
```

#### 5. Test List Repositories (Protected)
```bash
curl -X GET http://localhost:8000/repos \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### 6. Test Create Repository
```bash
curl -X POST http://localhost:8000/repos \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-music-project",
    "description": "My awesome music project",
    "private": true
  }'
```

### Test Full User Flow

1. **Sign Up**: Create account in the web app (when wired to this API).
2. **Login**: Sign in with credentials.
3. **Create Repository**, **upload**, **collaborate** as your UI exposes.

### Test with web frontend

```bash
docker compose --env-file .env.compose.local ps
cd apps/web && npm run dev
```

Exercise sign-up, login, repos, and uploads against your configured `API_BASE_URL`.

## 🛠️ Development

### Backend Development

```bash
docker compose --env-file .env.compose.local logs -f fastapi
# Hot reload: backend source is mounted into the container (see docker-compose.yml)

# Run backend on the host (without Docker)—use a local .env with GITEA_URL=http://localhost:3000
cd apps/backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Development

```bash
cd apps/web
npm run dev
npm run build
npm run start
```

### Database Access

Gitea’s database is the **`gitea_db`** Postgres service (not a container named `postgres`):

```bash
docker exec -it gitea_db psql -U gitea -d gitea
```

App-related data uses **Supabase** (connection string in `apps/backend/.env.*`).

### Gitea Management

```bash
# Access Gitea CLI
docker exec --user git gitea gitea admin user list

# Create admin user (if needed)
docker exec --user git gitea gitea admin user create \
  --username admin \
  --password adminpass \
  --email admin@example.com \
  --admin

# Regenerate admin token
# Go to http://localhost:3000 → Settings → Applications
```

## 🐛 Troubleshooting

### Common Issues

#### 1. "user does not exist" Error
**Problem**: Gitea admin token is invalid or missing `write:admin` scope

**Solution**:
```bash
# 1. Login to Gitea: http://localhost:3000
# 2. Go to Settings → Applications
# 3. Delete old token
# 4. Create new token with ALL scopes
# 5. Update GITEA_ADMIN_TOKEN in apps/backend/.env.local (or .env.remote)
# 6. Restart: docker compose --env-file .env.compose.local restart fastapi
```

#### 2. "401 Unauthorized" on Login
**Problem**: Supabase credentials incorrect

**Solution**:
```bash
# Verify apps/backend/.env.local (or .env.remote) matches Supabase dashboard
docker compose --env-file .env.compose.local restart fastapi
```

#### 3. Frontend Can't Connect to Backend
**Problem**: CORS or network issue

**Solution**:
```bash
curl http://localhost:8000/health
# Ensure CORS in backend config allows your web app origin

docker compose --env-file .env.compose.local restart fastapi
```

#### 4. Import Errors in Backend
**Problem**: Module not found or import path wrong

**Solution**:
```bash
docker compose --env-file .env.compose.local down
docker compose --env-file .env.compose.local build fastapi
docker compose --env-file .env.compose.local up -d
docker compose --env-file .env.compose.local logs fastapi
```

#### 5. Gitea: `password authentication failed for user "gitea"`
**Problem**: `GITEA_DB_PASSWORD` in `.env.compose.*` does not match the password Postgres was initialized with (common after changing compose env without recreating the **`gitea_pgdata`** volume).

**Solution**: Restore the original password, or reset the volume (⚠️ destroys Gitea DB):  
`docker compose --env-file .env.compose.local down -v` then `up -d` with a single chosen password.

#### 6. Gitea Database Locked
**Problem**: Gitea container crashed or database corrupt

**Solution**:
```bash
docker compose --env-file .env.compose.local down
docker compose --env-file .env.compose.local up -d gitea_db gitea
sleep 10
docker compose --env-file .env.compose.local up -d
```

### View Logs

```bash
docker compose --env-file .env.compose.local logs -f
docker compose --env-file .env.compose.local logs -f fastapi
docker compose --env-file .env.compose.local logs -f gitea
docker compose --env-file .env.compose.local logs -f gitea_db
docker compose --env-file .env.compose.local logs --tail=100 fastapi
```

### Reset Everything

```bash
# ⚠️ WARNING: This will delete Gitea Postgres data in the named volume!

docker compose --env-file .env.compose.local down -v
rm -rf gitea/
docker compose --env-file .env.compose.local up -d
```

## 📚 API Documentation

### Interactive API Docs

Once the backend is running, access the interactive API documentation:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### API Endpoints Overview

#### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/user` - Get current user info
- `PATCH /api/auth/user` - Update user info
- `POST /api/auth/reset-password` - Reset password

#### Repositories
- `GET /repos` - List user repositories
- `POST /repos` - Create new repository
- `GET /repos/{repo_name}/contents` - Get repository contents
- `POST /repos/{repo_name}/upload` - Upload file
- `DELETE /repos/{repo_name}/contents` - Delete file

#### Collaborators
- `POST /repos/{repo_name}/collaborators/invite` - Invite collaborator
- `GET /repos/{repo_name}/collaborators` - List collaborators
- `GET /invitations/pending` - Get pending invitations
- `POST /invitations/{id}/accept` - Accept invitation
- `DELETE /repos/{repo_name}/collaborators/{username}` - Remove collaborator

#### File Watching
- `POST /watch/start` - Start file watch session
- `POST /watch/stop` - Stop watch session
- `GET /watch/status/{watch_id}` - Get watch status
- `GET /watch/sessions` - List active sessions

## 🔒 Security Notes

- **Never commit `.env` files** - Contains sensitive credentials
- **Rotate tokens regularly** - Gitea and Supabase tokens
- **Use strong passwords** - Especially for admin accounts
- **Keep dependencies updated** - Regular security updates
- **Restrict Gitea admin token** - Only use for backend services

## 🚢 Deploying to DigitalOcean

See **[scripts/DEPLOYMENT.md](scripts/DEPLOYMENT.md)** for Spaces, Supabase, firewall, and **`scripts/deploy-digital-ocean.sh`**. On the droplet you can instead clone the repo and run **`./compose.sh remote up -d`** with **`.env.compose.remote`** and **`apps/backend/.env.remote`** if you align that workflow with your ops process.

## 🤝 Contributing

1. Create a feature branch
2. Make your changes
3. Run integration tests (`apps/backend/tests/README.md`) when touching the API
4. Open a pull request

## 📝 License

[Add your license here]

## 💡 Tips

- Use Git LFS for audio files (`.wav`, `.mp3`, `.als`, etc.)
- Keep repository sizes under 1GB for better performance
- Regularly backup Gitea and PostgreSQL data
- Monitor container resources with `docker stats`

## 📞 Support

For issues or questions:
- Check the [Troubleshooting](#-troubleshooting) section
- View logs: `docker compose --env-file .env.compose.local logs -f`
- Open an issue on GitHub
