# SoundHaus — Learning Notes

## Landing Page Animations

### Animated WaveformDivider
The `WaveformDivider` component in `apps/web/app/page.tsx` uses **SVG `<animate>` elements** to morph the waveform path between keyframes. Three layered `<path>` elements animate independently at different speeds (5s, 6s, 8s) to create a pulsating, alive feel — like a beat is playing.

Key technique: SVG `<animate attributeName="d">` interpolates between path data strings. The `values` attribute lists semicolon-separated path states. No JavaScript needed — the browser handles the animation natively, which is more performant than canvas for static-layout elements.

### Animated EQBarsDivider
The `EQBarsDivider` was upgraded with a CSS `@keyframes eqPulse` animation that uses `scaleY()` to make each bar bounce. Each bar gets a staggered `animation-delay` (calculated as `i * 0.06s`) creating a ripple effect across the 80 bars. Transform origin defaults to center, so bars pulse symmetrically.

### Login Page Visualizer
Added a `LoginVisualizer` canvas component to the login page's right panel (the studio image side). It renders:
1. **Floating particles** — 30 particles drifting upward with sinusoidal wobble
2. **EQ bars** — 60 bars along the bottom that animate using `sin(time + i)` for organic movement
3. **Pulse rings** — Concentric circles that breathe in/out from the center

This overlays on top of the blurred studio photograph, adding life without competing with the form.

### Divider Ordering (Landing Page)
Dividers alternate between WaveformDivider and EQBarsDivider between sections:
- Hero → **EQBarsDivider** → Features
- Features → **WaveformDivider** → How It Works
- How It Works → **EQBarsDivider** → Demo
- Demo → **WaveformDivider (flipped)** → Get Started

## Explore Page — Real Backend Connection

### What Changed
`apps/web/app/(dashboard)/explore/page.tsx` was updated to fetch real data from the backend instead of using mock data from `lib/mockData/repositories.ts`.

**Before:** `import { mockExploreRepos } from "@/lib/mockData/repositories"` — static array of fake repos.

**After:** Calls `getPublicRepos()` from `lib/api/repos.ts` which hits `GET /repos/public` on the FastAPI backend.

### How It Works
1. `getPublicRepos()` is a server action (`"use server"`) that calls `authFetch<{ repos: PublicRepo[] }>("/repos/public")`
2. The explore page calls it from `useEffect` on mount, setting `repos`, `reposLoading`, and `error` state
3. Cards display `PublicRepo` fields: `repo_name`, `owner`, `stars`, `clone_count`, `genres`, `thumbnail_url`, `audio_snippet`
4. Trending sidebar uses the same data, sorted by stars, top 5

### PublicRepo Type (from `lib/types/api.ts`)
Fields: `gitea_id`, `owner`, `repo_name`, `clone_count`, `clone_url`, `audio_snippet`, `snippet_metadata`, `genres[]`, `thumbnail_url`, `thumbnail_type`, `description?`, `stars?`, `updated_at?`

### Backend Endpoint
`GET /repos/public` in `apps/backend/routers/repos.py`:
- No auth required
- Optional query: `?genres=Lo-fi,Synthwave&match=any`
- Returns repos with Gitea metadata (stars, description, updated_at) merged with SoundHaus metadata (genres, thumbnail, snippet)

## Login Error: ECONNRESET

The error `TypeError: fetch failed` with `cause: ECONNRESET` means the Next.js server action is trying to connect to the FastAPI backend at `http://localhost:8000` but nothing is listening there. This is expected when Docker containers aren't running. Once you `docker compose up`, the backend will be available and login will work.

The `API_BASE_URL` is set in `apps/web/actions/auth.ts` from `process.env.API_URL` (defaults to `http://localhost:8000`).

## Package.json `type: "module"`

Added `"type": "module"` to `apps/web/package.json` to eliminate the Node.js warning:
> Module type of file:///...tailwind.config.ts is not specified and it doesn't parse as CommonJS

This tells Node.js to treat `.ts`/`.js` files as ES modules by default, which is what Next.js already expects.

## Redis Integration

### What Was Added

**Docker Compose** — New `redis` service (redis:7-alpine) with:
- AOF persistence (`--appendonly yes`)
- 256MB memory cap with LRU eviction (`--maxmemory-policy allkeys-lru`)
- Healthcheck via `redis-cli ping`
- Volume `redis_data` for persistence across restarts
- Both `fastapi` and `worker` services depend on Redis being healthy

**Python Backend** — Changes:
1. **`requirements.txt`** — Added `redis>=5.0.0`
2. **`config.py`** — New `redis_url` setting (default: `redis://redis:6379/0`)
3. **`services/redis_service.py`** — Async Redis singleton with connection pool (max 20 connections, decode_responses=True). Exposes `get_redis()` and `close_redis()`
4. **`main.py`** — Added `lifespan` context manager that calls `close_redis()` on shutdown
5. **`dependencies.py`** — Rate limiters (`limiter` and `user_limiter`) now use `storage_uri=settings.redis_url` for distributed rate limiting (previously in-memory, which didn't scale across workers)

**Environment Files** — All `.env.example` files updated with `REDIS_URL=redis://redis:6379/0`

### Why Redis

| Use Case | Before | After |
|----------|--------|-------|
| Rate Limiting | In-memory (slowapi default) — lost on restart, doesn't share across workers | Redis-backed storage — persistent, shared |
| Future: Task Queue | Stem worker polls DB every 5s | Can use Redis lists/streams for instant push |
| Future: Caching | No caching layer | Cache hot endpoints (public repos, stats) |
| Future: Real-time | Not implemented | Redis Pub/Sub for live notifications |

### Key Config

```
REDIS_URL=redis://redis:6379/0     # Docker internal network
REDIS_URL=redis://localhost:6379/0  # Local dev without Docker
```

---

## Deployment to Digital Ocean

### Current Infrastructure
- **Domain**: Purchased from Namecheap
- **Digital Ocean Droplet**: Active instance
- **Code**: Monorepo with docker-compose (fastapi, gitea, gitea_db, redis, worker, token-broker, web)

### Deployment Checklist

#### 1. DNS Configuration (Namecheap → Digital Ocean)
- In Namecheap DNS settings, set nameservers to Digital Ocean (`ns1.digitalocean.com`, `ns2.digitalocean.com`, `ns3.digitalocean.com`)
- OR add A record pointing to your droplet's IP address
- Add a CNAME for `www` → your domain

#### 2. Droplet Setup
```bash
# SSH into droplet
ssh root@<droplet-ip>

# Install Docker + Docker Compose (if not already)
apt update && apt upgrade -y
apt install -y docker.io docker-compose-plugin
systemctl enable docker && systemctl start docker

# Install Node.js for the web build (or build locally and push image)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

#### 3. Upload Code
```bash
# Option A: Git clone from your remote
git clone <your-repo-url> /app/soundhaus
cd /app/soundhaus

# Option B: rsync from local machine
rsync -avz --exclude node_modules --exclude .next --exclude __pycache__ \
  ./ root@<droplet-ip>:/app/soundhaus/
```

#### 4. Environment Files
Create the production `.env` files on the server:
- `/app/soundhaus/.env.compose.remote`
- `/app/soundhaus/apps/backend/.env.remote`

Key differences from local:
- `GITEA_PUBLIC_URL` → your actual domain (e.g., `https://git.yourdomain.com`)
- `SUPABASE_URL` / keys → your Supabase project
- `CORS_ORIGINS` → your actual domain
- `ENVIRONMENT=production`
- `REDIS_URL=redis://redis:6379/0` (stays the same, internal Docker network)

#### 5. Start Services
```bash
cd /app/soundhaus
docker compose --env-file .env.compose.remote up -d --build
```

#### 6. Reverse Proxy (Caddy or Nginx)
You need a reverse proxy for:
- HTTPS/TLS termination (automatic with Caddy)
- Routing: `yourdomain.com` → web (port 3001), `api.yourdomain.com` → fastapi (port 8000)

**Caddy (recommended — auto HTTPS)**:
```bash
apt install -y caddy
```

Example Caddyfile (`/etc/caddy/Caddyfile`):
```
yourdomain.com {
    reverse_proxy localhost:3001
}

api.yourdomain.com {
    reverse_proxy localhost:8000
}

git.yourdomain.com {
    reverse_proxy localhost:3000
}
```

### Do You Need Kubernetes?

**Short answer: No, not yet.**

For a senior design project / early-stage app, a single Docker Compose instance on a DO droplet is the right approach. Kubernetes adds significant complexity:

- You'd need a managed K8s cluster ($$$) or self-managed (complex)
- docker-compose already handles service orchestration, networking, and health checks
- You're running ~6 containers — well within a single server's capacity
- Horizontal scaling isn't needed until you have significant traffic

**When to consider K8s later:**
- Multiple replicas of the API needed for load
- Zero-downtime rolling deployments become critical
- You need auto-scaling based on traffic
- The stem worker needs to scale independently

**What's sufficient now:**
- Single DO droplet (2-4GB RAM should be plenty)
- Docker Compose for orchestration
- Caddy for HTTPS + reverse proxy
- Watchtower or a simple deploy script for updates
