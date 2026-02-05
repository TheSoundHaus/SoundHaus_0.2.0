# SoundHaus Digital Ocean Deployment Guide

This guide walks you through deploying the SoundHaus backend (FastAPI + Gitea) to Digital Ocean with LFS storage in Digital Ocean Spaces.

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

### 4. Local Setup
- Clone this repository
- Docker installed locally (for testing)
- `rsync` installed (usually pre-installed on macOS/Linux)

## Step 1: Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and fill in all required values:

   **Supabase Database:**
   ```env
   SUPABASE_DB_HOST=db.xxxxxxxxxxxxxx.supabase.co
   SUPABASE_DB_NAME=postgres
   SUPABASE_DB_USER=postgres
   SUPABASE_DB_PASSWORD=your-actual-password
   SUPABASE_DB_SSL_MODE=require
   ```

   **Supabase API:**
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

   **Note:** Leave `GITEA_ADMIN_TOKEN` empty for now. We'll generate it after first deployment.

## Step 2: Test Locally (Optional but Recommended)

Before deploying to production, test the configuration locally:

```bash
docker compose up
```

Access Gitea at `http://localhost:3000` and FastAPI at `http://localhost:8000/docs`.

If everything works, stop the containers:
```bash
docker compose down
```

## Step 3: Deploy to Digital Ocean

Run the deployment script:

```bash
./scripts/deploy-digital-ocean.sh [DROPLET_IP] [SSH_USER]
```

Example:
```bash
./scripts/deploy-digital-ocean.sh 142.93.123.45 root
```

The script will:
1. Validate your environment variables
2. Test SSH connection to the droplet
3. Install Docker if not present
4. Copy necessary files to the droplet
5. Configure firewall rules
6. Start the Docker containers
7. Perform health checks

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

4. **Update .env with Token:**
   - Edit your local `.env` file
   - Add the token:
     ```env
     GITEA_ADMIN_TOKEN=your-generated-token-here
     ```

5. **Redeploy with Token:**
   ```bash
   ./scripts/deploy-digital-ocean.sh [DROPLET_IP] [SSH_USER]
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

### View Logs
```bash
ssh [SSH_USER]@[DROPLET_IP] 'cd /opt/soundhaus && docker compose logs -f'
```

View specific service logs:
```bash
ssh [SSH_USER]@[DROPLET_IP] 'cd /opt/soundhaus && docker compose logs -f gitea'
ssh [SSH_USER]@[DROPLET_IP] 'cd /opt/soundhaus && docker compose logs -f fastapi'
```

### Restart Services
```bash
ssh [SSH_USER]@[DROPLET_IP] 'cd /opt/soundhaus && docker compose restart'
```

### Stop Services
```bash
ssh [SSH_USER]@[DROPLET_IP] 'cd /opt/soundhaus && docker compose down'
```

### Update Deployment
After making changes to your code or configuration:
```bash
./scripts/deploy-digital-ocean.sh [DROPLET_IP] [SSH_USER]
```

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

### Database Connection Issues

Verify Supabase credentials in `.env`:
```bash
ssh [SSH_USER]@[DROPLET_IP] 'cd /opt/soundhaus && cat .env | grep SUPABASE'
```

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
