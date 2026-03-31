# SoundHaus

A collaborative music project management platform with version control powered by Gitea, user authentication via Supabase, and real-time file syncing.

## Architecture

- **Frontend**: Next.js (`apps/web`), Electron desktop (`apps/desktop`)
- **Backend**: FastAPI (Python) in `apps/backend`
- **Git Server**: Gitea (self-hosted, Docker)
- **Database**: PostgreSQL (Gitea's `gitea_db`); app data via Supabase
- **Auth**: Supabase (httpOnly cookies)
- **Cache / Rate Limiting**: Redis
- **File Storage**: Git LFS &rarr; Cloudflare R2 (S3-compatible, zero egress)
- **Hosting**: DigitalOcean droplet + Nginx + Let's Encrypt SSL

## Project Structure

```
SoundHaus_0.2.0/
├── apps/
│   ├── backend/           # FastAPI API (main.py, routers, services, tests/)
│   ├── web/               # Next.js web app
│   ├── desktop/           # Electron + Vite desktop app
│   └── token-broker/      # Token broker microservice
├── scripts/               # compose wrappers, deploy, backup, helpers
├── workers/               # stem_worker (Demucs audio separation)
├── gitea/                 # Gitea bind-mount data (local dev)
├── docker-compose.yml     # Stack: gitea_db, gitea, redis, fastapi, worker, token-broker
└── .env.compose.local     # Compose profile files (see below)
```

## Configuration: local vs remote

SoundHaus uses **two layers** of environment files:

| Layer | Purpose |
|--------|---------|
| `.env.compose.local` / `.env.compose.remote` | Compose variable substitution (`GITEA_DB_PASSWORD`, `GITEA_SECRET_KEY`, `GITEA_INTERNAL_TOKEN`, `HOME` for SSH mount, etc.) and `BACKEND_ENV_FILE` |
| `apps/backend/.env.local` / `apps/backend/.env.remote` | FastAPI settings (Supabase, Gitea URLs/tokens, `API_BASE_URL`, `REDIS_URL`, rate limits, test users) loaded into the `fastapi` container via `env_file` |

Copy from the `*.example` files at the repo root and under `apps/backend/`.

- **Local development:** use **local** profile with `BACKEND_ENV_FILE=./apps/backend/.env.local`, `GITEA_URL=http://gitea:3000`, and `API_BASE_URL=http://localhost:8000`.
- **DigitalOcean droplet:** use **remote** profile with `apps/backend/.env.remote` containing public hostnames, webhook URLs, etc.

**Important:** `GITEA_DB_PASSWORD`, `GITEA_SECRET_KEY`, and `GITEA_INTERNAL_TOKEN` are tied to the **Gitea Postgres volume** on that machine. Use **different** values on a droplet than on your laptop; do not change `GITEA_DB_PASSWORD` on an existing volume without updating Postgres or recreating the volume.

## Scripts

| Script | Role |
|--------|------|
| `compose.sh` / `compose.ps1` | `compose.sh local up -d` runs `docker compose --env-file .env.compose.<profile>` and updates `.soundhaus-compose-profile`. |
| `deploy-digital-ocean.sh` | Rsync files to `/opt/soundhaus` on a droplet, open firewall ports, `docker compose up -d`. |
| `backup.sh` | Backup helper (Gitea / DB-related). |
| `run_desktop.sh` | Local desktop app helper. |

## Quick Start (Local Development)

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for `apps/web` / `apps/desktop`)

### 1. Clone and env templates

```bash
git clone <your-repo-url>
cd SoundHaus_0.2.0
cp .env.compose.local.example .env.compose.local
cp apps/backend/.env.local.example apps/backend/.env.local
```

Fill in `.env.compose.local` (Gitea DB password, secrets, HOME) and `apps/backend/.env.local` (Supabase, Gitea admin token, API_BASE_URL, etc.).

### 2. Backend credentials (in `apps/backend/.env.local`)

```env
GITEA_URL=http://gitea:3000
GITEA_PUBLIC_URL=http://localhost:3000
GITEA_ADMIN_TOKEN=your-gitea-admin-token

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUB_KEY=your-publishable-key
SUPABASE_SERVICE_KEY=your-service-role-key

API_BASE_URL=http://localhost:8000
REDIS_URL=redis://redis:6379/0
```

#### Getting Gitea Admin Token

1. Start the stack: `./scripts/compose.sh local up -d`
2. Open Gitea: http://localhost:3000
3. Log in as admin, go to **Settings > Applications > Manage Access Tokens**
4. Generate a token with **ALL** scopes (including `write:admin`).
5. Put the token in `apps/backend/.env.local` as `GITEA_ADMIN_TOKEN`, then: `./scripts/compose.sh local restart fastapi`

#### Getting Supabase Credentials

1. [Supabase Dashboard](https://supabase.com/dashboard) > your project > **Settings > API**
2. Map **Project URL**, **anon public**, **service_role**, and **JWT Secret** into `apps/backend/.env.local`.

### 3. Start services

```bash
./scripts/compose.sh local up -d --build
```

### 4. Verify

```bash
docker compose --env-file .env.compose.local ps
curl http://localhost:8000/health
```

- API: http://localhost:8000 | Docs: http://localhost:8000/docs
- Gitea: http://localhost:3000

### 5. Web frontend

```bash
cd apps/web
npm install
npm run dev
```

---

## Deploying to DigitalOcean

### Infrastructure Overview

| Service | Provider | Cost |
|---------|----------|------|
| Droplet (4 GB / 2 vCPU / 80 GB) | DigitalOcean | $24/mo |
| Domain (`thesound.haus`) | Namecheap | ~$15/yr |
| Object Storage (LFS + audio) | Cloudflare R2 | ~$0 (free tier) |
| Auth + App DB | Supabase | $0 (free tier) |
| Web Frontend | Vercel (or self-host) | $0 (free tier) |
| **Total** | | **~$25/mo** |

### DNS Records (DigitalOcean Networking)

Set Namecheap nameservers to `ns1.digitalocean.com`, `ns2.digitalocean.com`, `ns3.digitalocean.com`.

In DO **Networking > Domains**, add `thesound.haus` and create:

| Type | Hostname | Value | TTL |
|------|----------|-------|-----|
| A | `@` | `<DROPLET_IP>` | 3600 |
| A | `api` | `<DROPLET_IP>` | 3600 |
| A | `git` | `<DROPLET_IP>` | 3600 |
| CNAME | `www` | `thesound.haus.` | 3600 |

This gives you: `thesound.haus` (web), `api.thesound.haus` (FastAPI), `git.thesound.haus` (Gitea).

### Prepare the Droplet

```bash
ssh root@<DROPLET_IP>

# Ubuntu 24.04 LTS, 4 GB RAM / 2 vCPUs / 80 GB SSD ($24/mo)
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
systemctl enable docker
apt install docker-compose-plugin -y

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 2222/tcp   # Gitea SSH
ufw enable
```

### Deploy the Stack

```bash
# Option A: Clone on droplet
cd /opt
git clone <YOUR_REPO_URL> soundhaus
cd /opt/soundhaus

# Option B: Deploy script from laptop
./scripts/deploy-digital-ocean.sh <DROPLET_IP> root
```

Create env files on the server:

```bash
cp .env.compose.remote.example .env.compose.remote
cp apps/backend/.env.remote.example apps/backend/.env.remote
```

**`.env.compose.remote`**:
```env
GITEA_DB_PASSWORD=<strong-random-password>
GITEA_SECRET_KEY=<gitea generate secret SECRET_KEY>
GITEA_INTERNAL_TOKEN=<gitea generate secret INTERNAL_TOKEN>
BACKEND_ENV_FILE=./apps/backend/.env.remote
HOME=/root
```

**`apps/backend/.env.remote`**:
```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_PUB_KEY=<anon-key>
SUPABASE_SERVICE_KEY=<service-key>
SUPABASE_JWT_SECRET=<jwt-secret>
DATABASE_URL=postgresql://postgres:<pass>@db.xxxx.supabase.co:5432/postgres

GITEA_URL=http://gitea:3000
GITEA_PUBLIC_URL=https://git.thesound.haus
GITEA_ADMIN_TOKEN=              # fill after first Gitea setup

TOKEN_BROKER_URL=http://token-broker:9000
WEBHOOK_BASE_URL=https://api.thesound.haus
API_BASE_URL=https://api.thesound.haus
REDIS_URL=redis://redis:6379/0
```

Build and start:

```bash
docker compose --env-file .env.compose.remote up -d --build
docker compose ps
curl http://localhost:8000/health
```

### SSL with Nginx + Let's Encrypt

```bash
apt install nginx certbot python3-certbot-nginx -y
```

Create `/etc/nginx/sites-available/soundhaus`:

```nginx
# API
server {
    listen 80;
    server_name api.thesound.haus;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50M;
    }
}

# Gitea
server {
    listen 80;
    server_name git.thesound.haus;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 200M;
    }
}

# Web (if self-hosting on droplet)
server {
    listen 80;
    server_name thesound.haus www.thesound.haus;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/soundhaus /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

certbot --nginx -d api.thesound.haus -d git.thesound.haus -d thesound.haus -d www.thesound.haus
```

### Initial Gitea Setup

1. Access Gitea at `https://git.thesound.haus`
2. Complete initial setup (DB pre-filled from env)
3. Create admin account
4. **Settings > Applications > Generate Token** with ALL scopes
5. Set `GITEA_ADMIN_TOKEN` in `apps/backend/.env.remote`
6. `docker compose --env-file .env.compose.remote restart fastapi`

### Deploy Next.js Frontend (Vercel, recommended)

1. Import the monorepo at [vercel.com/new](https://vercel.com/new)
2. Set **Root Directory** to `apps/web`
3. Set env vars: `NEXT_PUBLIC_API_URL=https://api.thesound.haus`
4. Deploy, then add `thesound.haus` and `www.thesound.haus` in Vercel Domains
5. Update DO DNS: point `@` A record and `www` CNAME to Vercel values
6. Remove the `thesound.haus` server block from Nginx if using Vercel

### Updating the Deployment

```bash
ssh root@<DROPLET_IP>
cd /opt/soundhaus
git pull origin backend-hosting
docker compose --env-file .env.compose.remote up -d --build
```

---

## Storage: Cloudflare R2

Audio files (LFS, snippets, stems) use **Cloudflare R2**, S3-compatible with zero egress fees. Free tier covers 10 GB + 10M requests/mo.

### Setup

1. [dash.cloudflare.com](https://dash.cloudflare.com) > **R2 Object Storage** > **Create Bucket** (`soundhaus-audio`)
2. **Manage R2 API Tokens** > **Create API Token** (Object Read & Write, scoped to `soundhaus-audio`)
3. Save Access Key ID, Secret Access Key, and Account ID

### Connect to Gitea (LFS)

Add to the `gitea` service environment in `docker-compose.yml`:

```env
GITEA__lfs__STORAGE_TYPE=minio
GITEA__lfs__MINIO_ENDPOINT=<ACCOUNT_ID>.r2.cloudflarestorage.com
GITEA__lfs__MINIO_ACCESS_KEY_ID=<R2_ACCESS_KEY>
GITEA__lfs__MINIO_SECRET_ACCESS_KEY=<R2_SECRET_KEY>
GITEA__lfs__MINIO_BUCKET=soundhaus-audio
GITEA__lfs__MINIO_USE_SSL=true
GITEA__lfs__MINIO_LOCATION=auto
```

### Connect to FastAPI (snippet storage)

Add to `apps/backend/.env.remote`:

```env
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_ACCESS_KEY=<R2_ACCESS_KEY>
S3_SECRET_KEY=<R2_SECRET_KEY>
S3_BUCKET=soundhaus-audio
S3_REGION=auto
```

### Optional: CDN Domain

In R2 bucket settings, enable Public Access with custom domain `cdn.thesound.haus`.

---

## Redis

Redis is included in the Docker Compose stack (`redis:7-alpine`). It provides:

- **Distributed rate limiting**: `limiter` and `user_limiter` use Redis-backed storage via SlowAPI
- **Session/cache store**: available via `services/redis_service.py` async client

Default URL: `redis://redis:6379/0` (pre-configured in all `.env.example` files).

Redis starts automatically with docker compose. No additional setup needed.

---

## Testing

### Backend integration tests

```bash
cd apps/backend
pip install -r tests/requirements.txt
python tests/run_all.py
```

See [apps/backend/tests/README.md](apps/backend/tests/README.md) for details.

Set `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` in `apps/backend/.env.local` for authenticated tests.

### Smoke checks

```bash
curl http://localhost:8000/              # API info
curl http://localhost:8000/health        # Health check
curl http://localhost:8000/docs          # Swagger UI
```

---

## Development

### Backend

```bash
docker compose --env-file .env.compose.local logs -f fastapi
# Hot reload: backend source is mounted into the container
```

### Frontend

```bash
cd apps/web
npm run dev
```

### Database Access

```bash
# Gitea Postgres
docker exec -it gitea_db psql -U gitea -d gitea

# App data uses Supabase (connection string in apps/backend/.env.*)
```

### Gitea Management

```bash
docker exec --user git gitea gitea admin user list
docker exec --user git gitea gitea admin user create \
  --username admin --password adminpass --email admin@example.com --admin
```

---

## Troubleshooting

### "user does not exist" Error
Gitea admin token is invalid or missing `write:admin` scope. Regenerate at Gitea > Settings > Applications with ALL scopes, update `GITEA_ADMIN_TOKEN`, restart fastapi.

### "401 Unauthorized" on Login
Supabase credentials incorrect. Verify `apps/backend/.env.*` matches Supabase dashboard.

### Frontend Can't Connect to Backend
Check CORS config and that `API_BASE_URL` is correct. `curl http://localhost:8000/health` to verify backend is up.

### Gitea Password Auth Failed
`GITEA_DB_PASSWORD` doesn't match the Postgres volume. Restore the original password or `docker compose down -v` and recreate (destroys Gitea DB).

### View Logs

```bash
docker compose --env-file .env.compose.local logs -f
docker compose --env-file .env.compose.local logs -f fastapi
docker compose --env-file .env.compose.local logs -f redis
```

### Reset Everything

```bash
# WARNING: This will delete all Gitea/Postgres/Redis data!
docker compose --env-file .env.compose.local down -v
rm -rf gitea/
docker compose --env-file .env.compose.local up -d
```

---

## Post-Deploy Checklist

- [ ] `curl https://api.thesound.haus/health` returns ok
- [ ] `curl https://git.thesound.haus` returns Gitea login page
- [ ] `https://thesound.haus` loads the landing page
- [ ] Gitea admin token set and fastapi restarted
- [ ] Test signup, login, create repo, push via desktop
- [ ] Verify SSL: `curl -I https://api.thesound.haus` returns HTTP/2 200
- [ ] Certbot auto-renewal: `certbot renew --dry-run`

## API Docs

Once the backend is running: **Swagger UI** at `/docs`, **ReDoc** at `/redoc`.

## Security Notes

- **Never commit `.env` files**
- **Rotate tokens regularly** (Gitea and Supabase)
- **Use strong passwords** (especially admin accounts)
- **Keep dependencies updated**

## License

[Add your license here]
