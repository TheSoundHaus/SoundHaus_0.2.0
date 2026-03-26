# SoundHaus Digital Ocean Deployment Guide

This guide covers deploying the SoundHaus backend (**FastAPI + Gitea + token-broker**) to a **DigitalOcean droplet**, with optional **Spaces** for LFS-related configuration in the legacy deploy script.

## Two ways to run Compose

| Approach | When to use |
|----------|-------------|
| **Compose profiles (`local` / `remote`)** | Everyday dev on your laptop (`compose.sh local` / `compose.ps1 local`) or running the stack **on the server** with **`.env.compose.remote`** + **`apps/backend/.env.remote`**. Uses `docker compose --env-file .env.compose.<profile> …`. |
| **`deploy-digital-ocean.sh`** | One-shot **rsync** from your machine: copies **`docker-compose.yml`**, a root **`.env`**, and **`apps/backend/`** to **`/opt/soundhaus`**, then runs **`docker compose up -d`** **without** the profile env file. Expects certain variables in that root **`.env`** (see script + below). |

You can standardize the droplet on **profiles** instead: copy the repo, create **`.env.compose.remote`** and **`apps/backend/.env.remote`**, then `docker compose --env-file .env.compose.remote up -d` (or `./scripts/compose.sh remote up -d`). The deploy script is optional automation on top of the same `docker-compose.yml`.

**Secrets on the droplet:** use **different** `GITEA_DB_PASSWORD`, `GITEA_SECRET_KEY`, and `GITEA_INTERNAL_TOKEN` than on your laptop; each host has its own Postgres volume and Gitea data.

## Prerequisites

Before deploying, ensure you have:

### 1. Digital Ocean Droplet
- Ubuntu 22.04 LTS (recommended)
- Minimum 2GB RAM, 2 vCPUs
- SSH access configured
- Note your droplet's IP address

### 2. Digital Ocean Spaces
- Create a Space (e.g., `soundhaus-lfs`)
- Generate Spaces access keys (API → Spaces access keys)
- Note your region (e.g., `nyc3`, `sfo3`, `sgp1`)

### 3. Supabase Project
- Create a Supabase project
- Note database connection details (Settings → Database)
- Note API keys (Settings → API)

### 4. Local machine (for deploy script)
- Clone this repository
- Docker (optional, for local testing)
- `bash`, `ssh`, `rsync` (use **Git Bash** or **WSL** on Windows for `./scripts/deploy-digital-ocean.sh`)

### 5. Compose profiles (local / remote)
- Copy **`.env.compose.*.example`** and **`apps/backend/.env.*.example`** as in the root **README** for the recommended profile workflow.

## Step 1: Configure environment variables

### A) Profile-based (local laptop or remote server)

1. Copy templates:
   ```bash
   cp .env.compose.local.example .env.compose.local
   cp .env.compose.remote.example .env.compose.remote
   cp apps/backend/.env.local.example apps/backend/.env.local
   cp apps/backend/.env.remote.example apps/backend/.env.remote
   ```

2. Fill **`.env.compose.remote`** on the droplet (or locally before you copy the repo): `GITEA_DB_PASSWORD`, `GITEA_SECRET_KEY`, `GITEA_INTERNAL_TOKEN`, `HOME`, and **`BACKEND_ENV_FILE=./apps/backend/.env.remote`**.

3. Fill **`apps/backend/.env.remote`** with production URLs (`API_BASE_URL`, `GITEA_PUBLIC_URL`, `WEBHOOK_BASE_URL` reachable from Gitea on the droplet, Supabase keys, `DATABASE_URL`, etc.).

### B) Legacy `deploy-digital-ocean.sh` (root `.env` on your machine)

The script **sources a root `.env`** (same directory you run the script from) and validates **DO Spaces** + Supabase DB variables. It then rsyncs that **`.env`** to **`/opt/soundhaus/.env`** along with `docker-compose.yml` and `apps/backend/`.

Ensure **`apps/backend/.env`** on the droplet (or the merged layout after rsync) still satisfies FastAPI’s required settings—align **`apps/backend/.env.remote`** content with what you need in production, or maintain a single backend env file the script copies.

**Supabase Database (if used by script validation):**
   ```env
   SUPABASE_DB_HOST=db.xxxxxxxxxxxxxx.supabase.co
   SUPABASE_DB_NAME=postgres
   SUPABASE_DB_USER=postgres
   SUPABASE_DB_PASSWORD=your-actual-password
   SUPABASE_DB_SSL_MODE=require
   ```

**Supabase API (backend):**
   ```env
   SUPABASE_URL=https://xxxxxxxxxxxxxx.supabase.co
   SUPABASE_PUB_KEY=your-anon-key
   SUPABASE_SERVICE_KEY=your-service-key
   SUPABASE_JWT_SECRET=your-jwt-secret
   ```

**Digital Ocean Spaces:**
   ```env
   DO_SPACES_ENDPOINT=nyc3.digitaloceanspaces.com
   DO_SPACES_KEY=your-spaces-access-key
   DO_SPACES_SECRET=your-spaces-secret-key
   DO_SPACES_BUCKET=soundhaus-lfs
   DO_SPACES_REGION=nyc3
   ```

**Note:** Leave **`GITEA_ADMIN_TOKEN`** empty until after first Gitea setup; place the token in the backend env file the **`fastapi`** service loads (`env_file` in Compose).

## Step 2: Test locally (recommended)

```bash
./scripts/compose.sh local up -d
# Windows: .\scripts\compose.ps1 local up -d
```

- Gitea: http://localhost:3000  
- API docs: http://localhost:8000/docs  

Stop when done:

```bash
./scripts/compose.sh local down
```

## Step 3: Deploy to DigitalOcean

### Option 1 — `deploy-digital-ocean.sh` (from your laptop)

From the **repository root**, with root **`.env`** configured:

```bash
./scripts/deploy-digital-ocean.sh [DROPLET_IP] [SSH_USER]
# Example:
./scripts/deploy-digital-ocean.sh 142.93.123.45 root
```

The script will:

1. Validate required variables in **`.env`**
2. Test SSH to the droplet
3. Install Docker if missing
4. Rsync `docker-compose.yml`, **`.env`**, and **`apps/backend/`** to **`/opt/soundhaus`**
5. Open firewall ports (22, 80, 443, 3000, 2222, 8000)
6. Run **`docker compose up -d`** on the server (no `--env-file .env.compose.remote` unless you change the script)
7. Run basic health checks

### Option 2 — SSH to droplet and use **remote** profile

```bash
ssh user@droplet
cd /opt/soundhaus   # or your clone path
./scripts/compose.sh remote up -d --build
```

Requires **`.env.compose.remote`** and **`apps/backend/.env.remote`** on that machine.

## Step 4: Initial Gitea Setup

After successful deployment:

1. **Access Gitea** at `http://[DROPLET_IP]:3000`

2. **Complete initial setup** (first time only):
   - Database settings should be pre-filled from environment variables
   - Set administrator account details:
     - Username: `admin` (or your preference)
     - Password: Choose a strong password
     - Email: Your email
   - Click "Install Gitea"

3. **Generate Admin Token:**
   - Login with your admin account
   - Go to: Settings → Applications → Manage Access Tokens
   - Click "Generate New Token"
   - Name: `soundhaus-api`
   - Select ALL scopes (especially `write:admin`)
   - Click "Generate Token"
   - **IMPORTANT:** Copy the token immediately (you can't see it again)

4. **Update backend env with token**
   - If you use **Compose profiles**: set **`GITEA_ADMIN_TOKEN`** in **`apps/backend/.env.remote`** (or `.env.local` on the server) and restart **`fastapi`**.
   - If you use **deploy script**: add the token to the backend env file that the stack loads on the droplet (under **`/opt/soundhaus`**, typically inside **`apps/backend/.env`** or the file referenced by Compose **`env_file`**), then redeploy or restart.

5. **Redeploy or restart**
   ```bash
   ./scripts/deploy-digital-ocean.sh [DROPLET_IP] [SSH_USER]
   # or on server: docker compose restart fastapi
   ```

## Step 5: Verify LFS Storage

Test that LFS files are being stored in Digital Ocean Spaces:

1. Create a test repository in Gitea
2. Clone it locally and add a large file (>10MB)
3. Enable Git LFS and push:
   ```bash
   git lfs install
   git lfs track "*.wav"
   git add .gitattributes
   git add your-large-file.wav
   git commit -m "Test LFS"
   git push
   ```
4. Check your Digital Ocean Spaces bucket - you should see LFS objects

## Accessing Your Deployment

After deployment, your services are available at:

- **Gitea Web UI:** `http://[DROPLET_IP]:3000`
- **Gitea SSH:** `ssh://git@[DROPLET_IP]:2222`
- **FastAPI:** `http://[DROPLET_IP]:8000`
- **API Documentation:** `http://[DROPLET_IP]:8000/docs`

## Managing Your Deployment

### View logs
```bash
ssh [SSH_USER]@[DROPLET_IP] 'cd /opt/soundhaus && docker compose logs -f'
ssh [SSH_USER]@[DROPLET_IP] 'cd /opt/soundhaus && docker compose logs -f gitea'
ssh [SSH_USER]@[DROPLET_IP] 'cd /opt/soundhaus && docker compose logs -f fastapi'
```

If you started the stack with **`--env-file .env.compose.remote`**, run the same **`cd`** path you used and include that **`--env-file`** on **`docker compose`** commands.

### Restart / stop
```bash
ssh [SSH_USER]@[DROPLET_IP] 'cd /opt/soundhaus && docker compose restart'
ssh [SSH_USER]@[DROPLET_IP] 'cd /opt/soundhaus && docker compose down'
```

### Update deployment
```bash
./scripts/deploy-digital-ocean.sh [DROPLET_IP] [SSH_USER]
```
Or pull git on the droplet and **`compose.sh remote up -d --build`**.

### SSH into Droplet
```bash
ssh [SSH_USER]@[DROPLET_IP]
cd /opt/soundhaus
```

## Firewall Configuration

The deployment script automatically configures these ports:

- **22:** SSH
- **80:** HTTP (for future use)
- **443:** HTTPS (for future use)
- **3000:** Gitea web interface
- **2222:** Gitea SSH (for git operations)
- **8000:** FastAPI

## Troubleshooting

### Services Not Starting

Check container status:
```bash
ssh [SSH_USER]@[DROPLET_IP] 'cd /opt/soundhaus && docker compose ps'
```

Check logs for errors:
```bash
ssh [SSH_USER]@[DROPLET_IP] 'cd /opt/soundhaus && docker compose logs'
```

### Database connection issues

Verify Supabase-related vars in the env file the API container uses (often under **`apps/backend/`** on the droplet), not only the root **`.env`**.

Test database connection from droplet:
```bash
ssh [SSH_USER]@[DROPLET_IP]
apt-get install postgresql-client -y
psql "postgresql://[USER]:[PASSWORD]@[HOST]:5432/[NAME]?sslmode=require"
```

### LFS Not Working

Verify Digital Ocean Spaces configuration:
```bash
ssh [SSH_USER]@[DROPLET_IP] 'cd /opt/soundhaus && cat .env | grep DO_SPACES'
```

Check Gitea LFS settings in container:
```bash
ssh [SSH_USER]@[DROPLET_IP] 'cd /opt/soundhaus && docker compose exec gitea cat /data/gitea/conf/app.ini | grep -A 10 "\[lfs\]"'
```

### Health Checks Failing

Wait a bit longer - services can take 1-2 minutes to fully start.

Manual health check:
```bash
# Gitea
curl http://[DROPLET_IP]:3000/api/healthz

# FastAPI
curl http://[DROPLET_IP]:8000/health
```

## Security Considerations

### Production Deployment Checklist

- [ ] Use a strong password for Gitea admin account
- [ ] Keep `GITEA_ADMIN_TOKEN` secure and never commit to git
- [ ] Use strong, unique passwords for all services
- [ ] Consider setting up a domain name with SSL/TLS
- [ ] Regularly update Docker images: `docker compose pull && docker compose up -d`
- [ ] Set up regular database backups
- [ ] Monitor disk usage (LFS files can grow large)
- [ ] Consider setting up log rotation

### Future Enhancements

For production, consider:
- Setting up a domain name and SSL certificates (Let's Encrypt)
- Using nginx as a reverse proxy
- Implementing rate limiting
- Setting up monitoring and alerting
- Automated backups of Gitea data and Supabase database
- CDN for static assets

## Cost Estimation

Approximate monthly costs:

- **Droplet:** $12-24/month (2GB - 4GB RAM)
- **Spaces:** $5/month + $0.02/GB storage + $0.01/GB transfer
- **Supabase:** Free tier available, Pro starts at $25/month

Total: ~$17-54/month depending on configuration and usage.

## Support

For issues or questions:
- Check logs first
- Review this documentation
- Consult SOUNDHAUS.md for architecture details
- Check Gitea documentation: https://docs.gitea.com
- Check Digital Ocean Spaces documentation: https://docs.digitalocean.com/products/spaces/
