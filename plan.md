# SoundHaus — 2-Week Finalization Sprint

**Sprint Dates**: March 24 – April 4, 2026  
**Daily Commitment**: 6–8 hours  
**Owner**: Nathan (web + backend) — Desktop team handles Electron/Rust parser independently  
**Excluded**: Explore page (teammate-owned)

---

## Git Setup — Do This First

```bash
cd /Users/nathanhall/Desktop/Senior_Design/SoundHaus_0.2.0

# Fetch all remote updates
git fetch origin --prune

# You're currently on feature/pull-requests (tip of all 7 stacked branches)
# Create a fresh sprint branch off this tip:
git checkout feature/pull-requests
git checkout -b sprint/finalization

# If PRs get merged into integration first, do this instead:
# git checkout integration && git pull origin integration && git checkout -b sprint/finalization
```

---

## Architecture Overview

### New Diff Engine Component Tree
```
apps/web/components/diff/
  index.ts                    — barrel export
  DiffTimeline.tsx            — master layout: ruler + scrollable track list + summary panel
  PianoRollTrack.tsx          — canvas-based MIDI note renderer (pitch × time grid)
  WaveformTrack.tsx           — canvas-based waveform peak renderer
  ChangeOverlay.tsx           — transparent overlay for highlighted diff regions
  TrackLabel.tsx              — track name, type badge, instrument, change indicator
  TimeRuler.tsx               — beat/bar ruler with zoom
  DiffSummaryPanel.tsx        — collapsible sidebar listing all changes
  ABComparisonView.tsx        — side-by-side or inline HEAD vs new comparison
  hooks/
    usePianoRollRenderer.ts   — canvas drawing logic for MIDI notes
    useWaveformPeaks.ts       — fetch + cache waveform peak JSON from backend
    useTimelineZoom.ts        — zoom/pan state shared across all tracks
    useSyncedPlayback.ts      — synchronized audio playback across tracks
  types/
    diff.ts                   — TypeScript interfaces (THE contract for desktop team)
```

### Deployment Topology (Production)
```
soundhaus.app (or chosen domain)
  ├── nginx reverse proxy (SSL via Let's Encrypt)
  │   ├── /              → Next.js (port 3001)
  │   ├── /api/          → FastAPI (port 8000)
  │   └── /git/          → Gitea (port 3000)
  ├── Docker Compose (all services)
  └── Supabase (external, managed)
```

---

## Week 1 — Infrastructure + Landing Page + Diff Contracts

### Day 1 (Mon Mar 24) — Deployment Foundation

> **Goal**: Get the backend accessible over HTTPS with a real domain.

#### 1.1 Purchase Domain (~15 min)
- [ ] Go to [Namecheap](https://namecheap.com) or [Cloudflare Registrar](https://dash.cloudflare.com)
- [ ] Search for `soundhaus.app`, `soundhaus.io`, `soundhaus.dev`, or `thesoundhaus.com`
- [ ] Purchase (`.app` is recommended — enforces HTTPS by default, ~$14/year)
- [ ] Note your domain name: `____________`

#### 1.2 Configure DNS (~10 min)
- [ ] In your domain registrar's DNS panel, add an **A record**:
  - **Host**: `@` (root domain)
  - **Value**: Your Digital Ocean droplet IP: `____________`
  - **TTL**: 300 (5 minutes for fast propagation)
- [ ] Add a second A record for `www`:
  - **Host**: `www`
  - **Value**: Same droplet IP
- [ ] Add a third A record for staging:
  - **Host**: `staging`
  - **Value**: Same droplet IP
- [ ] Wait 5-15 minutes for DNS propagation
- [ ] Verify: `dig +short yourdomain.app` should return your droplet IP

#### 1.3 SSH into Droplet & Install Nginx (~20 min)
```bash
# SSH in
ssh root@YOUR_DROPLET_IP

# Update packages
apt update && apt upgrade -y

# Install nginx
apt install nginx -y

# Verify nginx is running
systemctl status nginx
# Visit http://YOUR_DROPLET_IP in browser — should see nginx welcome page
```

#### 1.4 Configure Nginx Reverse Proxy (~30 min)
```bash
# On the droplet, create nginx config
cat > /etc/nginx/sites-available/soundhaus << 'EOF'
server {
    listen 80;
    server_name yourdomain.app www.yourdomain.app;

    # FastAPI backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        client_max_body_size 50M;
    }

    # Health endpoint (no /api prefix)
    location /health {
        proxy_pass http://127.0.0.1:8000/health;
        proxy_set_header Host $host;
    }

    # Gitea (git web UI + API)
    location /git/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Next.js web app (catch-all — must be last)
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

# Enable the site
ln -sf /etc/nginx/sites-available/soundhaus /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test config
nginx -t

# Reload
systemctl reload nginx
```

#### 1.5 Install SSL with Let's Encrypt (~10 min)
```bash
# Install certbot
apt install certbot python3-certbot-nginx -y

# Get certificate (replace with your domain)
certbot --nginx -d yourdomain.app -d www.yourdomain.app

# Follow prompts:
#   - Enter email
#   - Agree to ToS
#   - Choose to redirect HTTP → HTTPS (option 2)

# Verify auto-renewal
certbot renew --dry-run
```

#### 1.6 Create Environment Files (~30 min)
- [ ] Create three env templates locally:

```bash
# In your project root
cp .env .env.production
cp .env .env.staging
cp .env .env.development
```

Key differences between environments:

| Variable | Development | Staging | Production |
|---|---|---|---|
| `ENVIRONMENT` | `development` | `staging` | `production` |
| `DEBUG` | `true` | `true` | `false` |
| `CORS_ORIGINS` | `localhost:*` | `staging.yourdomain.app` | `yourdomain.app` |
| `WEBHOOK_BASE_URL` | `ngrok URL` | `https://staging.yourdomain.app` | `https://yourdomain.app` |
| `LOG_LEVEL` | `DEBUG` | `INFO` | `WARNING` |

- [ ] Add all three to `.gitignore` (they contain secrets)

#### 1.7 Create Next.js Dockerfile (~20 min)
- [ ] Create `apps/web/Dockerfile` (skeleton provided in sprint branch)
- [ ] Add `next` service to `docker-compose.yml`

#### 1.8 Update docker-compose.yml for Next.js (~15 min)
Add this service block to `docker-compose.yml`:
```yaml
  next:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
    container_name: soundhaus_next
    ports:
      - "3001:3000"
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=https://yourdomain.app/api
    restart: unless-stopped
    networks:
      - appnet
```

#### 1.9 Deploy & Verify (~30 min)
```bash
# From local machine
./scripts/deploy-digital-ocean.sh YOUR_DROPLET_IP root

# After deploy, verify:
curl -I https://yourdomain.app/api/health     # Should return 200
curl -I https://yourdomain.app                 # Should return Next.js page (or 502 until Day 2)
```

---

### Day 2 (Tue Mar 25) — CI/CD + Environment Separation

> **Goal**: Automated deployments on push. Staging + production environments.

#### 2.1 Create GitHub Actions Workflow — PR Checks (~45 min)
- [ ] Create `.github/workflows/pr-check.yml` (skeleton provided)
- [ ] Runs on every PR: lint web, type-check web, lint backend (ruff)

#### 2.2 Create GitHub Actions Workflow — Deploy (~1 hr)
- [ ] Create `.github/workflows/deploy.yml` (skeleton provided)
- [ ] Triggered on push to `integration`
- [ ] Steps: build Docker images → SSH to droplet → pull + restart
- [ ] Production deploy requires manual approval

#### 2.3 Set GitHub Repository Secrets (~15 min)
Go to GitHub → Settings → Secrets and variables → Actions. Add:
- [ ] `DO_SSH_KEY` — Your droplet SSH private key
- [ ] `DO_HOST` — Droplet IP address
- [ ] `DO_USERNAME` — `root` (or your SSH user)
- [ ] `SUPABASE_URL` — From your .env
- [ ] `SUPABASE_PUB_KEY` — From your .env

#### 2.4 Create Staging Environment (~45 min)
```bash
# SSH into droplet
ssh root@YOUR_DROPLET_IP

# Create staging directory
mkdir -p /opt/soundhaus-staging

# Copy production compose as base
cp /opt/soundhaus/docker-compose.yml /opt/soundhaus-staging/docker-compose.yml

# Edit staging compose to use different ports:
#   FastAPI: 8001 instead of 8000
#   Next.js: 3002 instead of 3001
#   Gitea: 3003 instead of 3000
```

Add staging nginx block:
```bash
cat >> /etc/nginx/sites-available/soundhaus << 'EOF'

server {
    listen 80;
    server_name staging.yourdomain.app;

    location /api/ {
        proxy_pass http://127.0.0.1:8001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF

# Get SSL for staging too
certbot --nginx -d staging.yourdomain.app
systemctl reload nginx
```

#### 2.5 Test Pipeline (~30 min)
- [ ] Create a test branch, make a trivial change, push, open PR
- [ ] Verify PR check action runs (lint + build)
- [ ] Merge to integration
- [ ] Verify deploy action runs and staging updates
- [ ] Verify staging site is live: `https://staging.yourdomain.app/api/health`

---

### Day 3 (Wed Mar 26) — Diff Engine: Interfaces + Backend Schema

> **Goal**: Define the TypeScript interface contract, update backend schemas, create waveform endpoint.

#### 3.1 Create Diff Type Contracts (~1 hr)
- [ ] Create `apps/web/components/diff/types/diff.ts` (skeleton provided)
- [ ] This file IS the contract — share with desktop team
- [ ] Defines: `MidiNote`, `MidiClipDiff`, `AudioClipDiff`, `TrackDiff`, `ProjectDiff`, `WaveformPeaks`, `ParameterChange`

#### 3.2 Update Backend Diff Model (~45 min)
- [ ] Update `apps/backend/models/diff_models.py` — add Pydantic schemas matching TypeScript types
- [ ] Add `EnrichedDiffPayload` schema for validating incoming POSTs from desktop

#### 3.3 Update Commits Router (~30 min)
- [ ] Update `POST /repos/{owner}/{repo}/diff` to accept enriched schema
- [ ] Backward compatible — old payloads still accepted

#### 3.4 Create Waveform Endpoint (~1 hr)
- [ ] Create `apps/backend/routers/audio.py` (skeleton provided)
- [ ] `GET /repos/{owner}/{repo}/audio/{file_path}/waveform` — generates peak data from audio files
- [ ] Register router in `main.py`

#### 3.5 Create Web Dockerfile (~30 min)
- [ ] Create `apps/web/Dockerfile` (skeleton provided)
- [ ] Multi-stage build: install deps → build → minimal runtime

#### 3.6 Create Diff Component Skeletons (~1 hr)
- [ ] Create all files under `apps/web/components/diff/` with function signatures + JSDoc descriptions
- [ ] Wire barrel export via `index.ts`

#### 3.7 Share Interface Contract with Desktop Team
- [ ] Send desktop team the `diff.ts` types file
- [ ] Explain: "POST this JSON shape to `POST /repos/{owner}/{repo}/diff` after each push"
- [ ] Include example payload

---

## Week 2 — Visualization + Landing Page + QOL Features

### Day 4 (Thu Mar 27) — PianoRollTrack + TimeRuler Implementation

> **Goal**: Functional piano roll rendering with zoom/pan.

#### 4.1 Implement TimeRuler.tsx (~1.5 hr)
- [ ] SVG-based horizontal ruler
- [ ] Accept `totalBeats`, `tempo`, `timeSignature`, `zoom` props
- [ ] Render bar numbers, beat divisions, minor gridlines
- [ ] Respond to zoom changes from context

#### 4.2 Implement useTimelineZoom.ts (~1 hr)
- [ ] React context provider for shared zoom/pan state
- [ ] Mouse wheel to zoom (ctrl+scroll for horizontal zoom)
- [ ] Click-drag to pan
- [ ] Min/max zoom bounds
- [ ] `beatsToPixels(beat)` and `pixelsToBeat(px)` helper functions

#### 4.3 Implement usePianoRollRenderer.ts (~2 hr)
- [ ] Canvas 2D rendering logic
- [ ] Draw pitch grid (C, C#, D... rows, highlight C octaves)
- [ ] Draw notes as rounded rectangles
- [ ] Color by changeType: green=added, red=removed, blue=modified, gray=unchanged
- [ ] Velocity mapped to opacity (0.3 min, 1.0 max)
- [ ] Hover detection: find note at mouse position → show tooltip

#### 4.4 Implement PianoRollTrack.tsx (~1.5 hr)
- [ ] Wrapper component with canvas ref
- [ ] Calls usePianoRollRenderer on mount and data change
- [ ] Handles mouse events (hover tooltip, click to select)
- [ ] Renders pitch labels on left edge (C2, C3, C4...)

#### 4.5 Test with Mock Data (~1 hr)
- [ ] Create a mock `ProjectDiff` with MIDI tracks + notes
- [ ] Render PianoRollTrack standalone to verify canvas drawing
- [ ] Verify zoom/pan with TimeRuler

---

### Day 5 (Fri Mar 28) — WaveformTrack + ChangeOverlay

> **Goal**: Waveform rendering and change highlight overlays.

#### 5.1 Implement useWaveformPeaks.ts (~45 min)
- [ ] Fetch from `GET /repos/{owner}/{repo}/audio/{path}/waveform`
- [ ] Cache in state by `(repo, path, sha)` key
- [ ] Return `{ peaks, isLoading, error }`
- [ ] Handle fallback: if no audio file, return empty peaks

#### 5.2 Implement WaveformTrack.tsx (~2 hr)
- [ ] Canvas renderer: draw mirrored waveform from peak data
- [ ] Colors: zinc-400 unchanged, green-tinted added, red-tinted removed
- [ ] X-axis synced with TimeRuler zoom via shared context
- [ ] Smooth rendering with requestAnimationFrame

#### 5.3 Implement ChangeOverlay.tsx (~1.5 hr)
- [ ] Absolutely positioned transparent layer over any track
- [ ] Draws semi-transparent colored rectangles at change regions
- [ ] Hover shows popover: change title, time range, description
- [ ] Click scrolls/zooms to that region

#### 5.4 Implement DiffSummaryPanel.tsx (~1 hr)
- [ ] Right sidebar listing all changes as cards
- [ ] Each card: track name, change type badge, description snippet
- [ ] Click card → scroll to that track + region
- [ ] Collapsible with toggle button

#### 5.5 Assemble DiffTimeline.tsx (~1.5 hr)
- [ ] Master layout: TimeRuler on top, track list in middle, summary panel on right
- [ ] Each track row: TrackLabel + (PianoRollTrack | WaveformTrack) + ChangeOverlay
- [ ] Wrap in TimelineZoomProvider
- [ ] Accept `ProjectDiff` data as prop
- [ ] Loading and empty states

---

### Day 6 (Mon Mar 31) — Landing Page Full Redesign

> **Goal**: High-conversion landing page following Brand Bible.

#### 6.1 Build Navbar Component (~45 min)
- [ ] Logo on left
- [ ] Anchor links: Features, How It Works, About
- [ ] Login / Sign Up CTAs on right
- [ ] Transparent over hero, solid on scroll (intersection observer)

#### 6.2 Build Hero Section (~1.5 hr)
- [ ] Large headline: "Version Control for Music Producers"
- [ ] Animated waveform SVG background (CSS keyframe, glass-blue-400 at low opacity)
- [ ] Subtitle text
- [ ] Two CTAs: "Get Started Free" → /signup, "See How It Works" → smooth scroll
- [ ] Subtle grain texture overlay

#### 6.3 Build Features Grid (~1 hr)
- [ ] 3 columns: "Git-Powered Versioning", "Stem Separation", "Visual Diff Engine"
- [ ] Each: icon (lucide-react), headline, 2-line description
- [ ] Hover: icon scales up, card border glows glass-blue-500/40
- [ ] Use intersection observer for fade-in animation

#### 6.4 Build "How It Works" Section (~1 hr)
- [ ] 3-step numbered flow with connecting lines
- [ ] Step 1: "Push your project" (Upload icon)
- [ ] Step 2: "See every change" (BarChart icon)
- [ ] Step 3: "Collaborate async" (Users icon)
- [ ] Each step has a brief description

#### 6.5 Build Screenshot/Demo Section (~1 hr)
- [ ] Section heading: "See SoundHaus in Action"
- [ ] Static screenshot of DiffTimeline (create with mock data)
- [ ] Or: live embedded DiffTimeline with hardcoded mock data
- [ ] Dark card container with subtle border

#### 6.6 Build Footer (~30 min)
- [ ] Logo, column of nav links, GitHub link
- [ ] Copyright notice
- [ ] Same zinc-900/zinc-800 palette

#### 6.7 Responsive Pass (~1 hr)
- [ ] Test all sections at 375px, 768px, 1024px, 1440px
- [ ] Adjust grid columns, font sizes, spacing
- [ ] Ensure hero text doesn't overflow on mobile

---

### Day 7 (Tue Apr 1) — Dashboard Wire-up + Audio Preview on Hover

> **Goal**: Real data on dashboard. Delightful hover previews on repo cards.

#### 7.1 Wire Dashboard to Real Data (~2 hr)
- [ ] Create `apps/web/lib/api/dashboard.ts` with:
  - `getDashboardStats()` — aggregates repo count, commit count, collaborator count
  - `getRecentActivity()` — fetches recent push events across user's repos
  - `getRecentRepos()` — fetches user's 5 most recently updated repos
- [ ] Rewrite `dashboard/page.tsx` to call these APIs on mount
- [ ] Replace all hardcoded data with real API responses
- [ ] Add loading skeletons while data fetches

#### 7.2 Audio Preview on Hover (~2 hr)
- [ ] Modify `RepositoryCard.tsx`:
  - On mouse enter: if repo has `audio_snippet`, start loading audio
  - Show mini waveform + play indicator
  - On mouse leave: fade out and stop
- [ ] Create `apps/web/components/MiniAudioPreview.tsx`:
  - Tiny wavesurfer instance (height: 24px)
  - Auto-plays on mount (muted initially, unmute on click)
  - Fades in/out with CSS transition
- [ ] Debounce hover (300ms) to avoid rapid load/unload

#### 7.3 Landing Page Polish (~2 hr)
- [ ] Add smooth scroll behavior to anchor links
- [ ] Intersection observer fade-in animations on all sections
- [ ] Final responsive adjustments
- [ ] Test in Chrome, Firefox, Safari

---

### Day 8 (Wed Apr 2) — A/B Comparison + DiffView Integration

> **Goal**: Side-by-side comparison and swap the old DiffView for the new engine.

#### 8.1 Implement ABComparisonView.tsx (~3 hr)
- [ ] Two modes: "Side by Side" and "Inline" (toggle button)
- [ ] Side by Side: two DiffTimeline panels with synced scroll/zoom
- [ ] Inline: single panel with toggle between HEAD and new versions
- [ ] For MIDI: HEAD piano roll on left, new on right, changed notes highlighted
- [ ] For Audio: HEAD waveform on top, new on bottom

#### 8.2 Integrate New DiffTimeline into RepoDetailClient (~1.5 hr)
- [ ] Rename old `DiffView.tsx` → `DiffViewLegacy.tsx`
- [ ] In `RepoDetailClient.tsx`, render `DiffTimeline` when enriched diff data present
- [ ] Fallback to `DiffViewLegacy` for old-format data
- [ ] Detection: check if `diff_data` has `tracks[0].midiClips` or `tracks[0].audioClips`

#### 8.3 Test End-to-End Diff Flow (~1.5 hr)
- [ ] Create test page with mock enriched diff data
- [ ] Verify: PianoRoll renders MIDI notes
- [ ] Verify: Waveform renders audio peaks
- [ ] Verify: ChangeOverlay highlights regions
- [ ] Verify: ABComparison syncs scroll between panels
- [ ] Verify: Legacy fallback works for old data

---

### Day 9 (Thu Apr 3) — QOL Features

> **Goal**: Snippet comments, repo README, keyboard shortcuts.

#### 9.1 Time-Stamped Snippet Comments (~3 hr)

**Backend:**
- [ ] New Supabase table: `snippet_comments`
  ```sql
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id INTEGER REFERENCES repo_data(gitea_id),
  user_id UUID NOT NULL,
  timestamp_seconds FLOAT NOT NULL,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
  ```
- [ ] New model: `apps/backend/models/comment_models.py`
- [ ] New endpoints in `apps/backend/routers/snippets.py`:
  - `POST /repos/{owner}/{repo}/snippet/comments` — add comment at timestamp
  - `GET /repos/{owner}/{repo}/snippet/comments` — list all comments
  - `DELETE /repos/{owner}/{repo}/snippet/comments/{id}` — delete own comment

**Frontend:**
- [ ] Extend `AudioPlayer.tsx`:
  - Click on waveform → opens comment input at that timestamp
  - Render vertical marker lines at each comment's timestamp
  - Hover marker → show comment tooltip
- [ ] Add comment list below player (sorted by timestamp)
- [ ] Add `apps/web/lib/api/comments.ts` with server actions

#### 9.2 Repo README/Description (~1.5 hr)

**Backend:**
- [ ] Add `description TEXT` and `readme_content TEXT` columns to `repo_data` table
- [ ] New endpoints in `apps/backend/routers/repos.py`:
  - `PUT /repos/{owner}/{repo}/readme` — update readme (owner-only)
  - `GET /repos/{owner}/{repo}/readme` — get readme content

**Frontend:**
- [ ] Install `react-markdown` (or use simple markdown renderer)
- [ ] Add "About" tab to `RepoDetailClient.tsx` with:
  - Rendered markdown README
  - Edit button for owner → textarea with live preview
- [ ] Show description on `RepositoryCard.tsx`

#### 9.3 Keyboard Shortcuts (~1 hr)
- [ ] Create `apps/web/hooks/useKeyboardShortcuts.ts` — global keyboard handler
- [ ] Shortcuts:
  - `Space` — play/pause audio
  - `←` / `→` — navigate between commits (Snapshots tab)
  - `J` / `K` — scroll through tracks in diff view
  - `+` / `-` — zoom in/out on timeline
  - `?` — show shortcuts modal
- [ ] Create `apps/web/components/KeyboardShortcutsModal.tsx` — displays all shortcuts
- [ ] Integrate into dashboard layout

---

### Day 10 (Fri Apr 4) — Integration Testing + Polish + Ship

> **Goal**: Everything works end-to-end. Push to production.

#### 10.1 Full Integration Test (~2 hr)
- [ ] Test auth flow: signup → login → dashboard shows real data
- [ ] Test repo flow: create repo → upload snippet → trigger stems → view in player
- [ ] Test diff flow: view snapshots tab → click commit → DiffTimeline renders
- [ ] Test landing page: all sections, CTAs, responsiveness
- [ ] Test snippet comments: add comment → refresh → comment persists
- [ ] Test keyboard shortcuts: space, arrows, j/k, +/-

#### 10.2 TypeScript Build Verification (~30 min)
```bash
cd apps/web && npm run build
# Must pass with zero errors
```

#### 10.3 Fix Issues Found (~2 hr)
- [ ] Address any TypeScript errors
- [ ] Fix responsive layout issues
- [ ] Fix API edge cases (empty states, error handling)
- [ ] Fix any CORS or cookie issues on staging

#### 10.4 Deploy to Production (~1 hr)
- [ ] Push to `integration` branch
- [ ] GitHub Actions runs PR check → deploy to staging
- [ ] Verify staging: `https://staging.yourdomain.app`
- [ ] Trigger production deploy (manual approval in GitHub Actions)
- [ ] Verify production: `https://yourdomain.app`

#### 10.5 Create Desktop Team Handoff (~30 min)
- [ ] Write `HANDOFF.md` documenting:
  - The diff TypeScript interfaces
  - Example JSON payload for `POST /repos/{owner}/{repo}/diff`
  - Waveform endpoint usage
  - How to test locally vs staging

---

## QOL Features — Detailed Implementation Guide

### Feature 1: Time-Stamped Snippet Comments (SoundCloud-style)

**Why**: Core collaboration UX — producers can leave feedback at exact moments in the audio.

**Step-by-step**:
1. Create Supabase migration for `snippet_comments` table (schema above in Day 9.1)
2. Create `apps/backend/models/comment_models.py` with SQLAlchemy model + Pydantic schemas
3. Add CRUD endpoints to `apps/backend/routers/snippets.py` (or new `comments.py` router)
4. Create `apps/web/lib/api/comments.ts` server actions
5. Extend `AudioPlayer.tsx`:
   - Add click handler on wavesurfer instance: `wavesurfer.on('click', (relativeX) => { ... })`
   - Calculate timestamp from click position: `relativeX * duration`
   - Show floating input positioned at click point
   - On submit, call `addComment(repoOwner, repoName, timestamp, text)`
6. Fetch comments on mount and render as vertical lines on waveform
7. Render comment list below player, sorted chronologically
8. Add delete button on own comments

**Libraries**: None extra (wavesurfer already handles click events)

### Feature 2: Repo README/Description

**Why**: Gives repos personality, context, and documentation.

**Step-by-step**:
1. Add columns to `repo_data` table: `description TEXT`, `readme_content TEXT`
2. Add Pydantic schemas for update request
3. Add `PUT /repos/{owner}/{repo}/readme` endpoint (owner-only, max 10KB)
4. Add `GET /repos/{owner}/{repo}/readme` endpoint (public)
5. Install `react-markdown` in web app: `npm install react-markdown`
6. Add "About" tab to `RepoDetailClient.tsx`
7. Render markdown in a styled container
8. Add edit mode with textarea + "Preview" / "Edit" toggle
9. Show truncated description on RepositoryCard.tsx

### Feature 3: Audio Preview on Hover

**Why**: Delightful UX moment — users can preview a project's audio without navigating.

**Step-by-step**:
1. Create `apps/web/components/MiniAudioPreview.tsx`
   - Takes `snippetUrl: string` prop
   - Creates a tiny wavesurfer instance (height: 24px, no controls)
   - Auto-plays on mount with a fade in
   - Stops and fades out on unmount
2. Modify `RepositoryCard.tsx`:
   - Add `onMouseEnter` / `onMouseLeave` handlers with 300ms debounce
   - On hover: render `MiniAudioPreview` in an absolute-positioned overlay
   - Pass `repo.audio_snippet` URL
3. Style: small waveform bar at bottom of card with glass-blue-400 color

**Libraries**: wavesurfer.js (already installed)

### Feature 4: Keyboard Shortcuts

**Why**: Power user appeal — producers expect DAW-like keyboard control.

**Step-by-step**:
1. Create `apps/web/hooks/useKeyboardShortcuts.ts`
   - Uses `useEffect` with `keydown` listener on `document`
   - Ignores shortcuts when user is typing in input/textarea
   - Maps keys to actions via a configurable shortcuts map
2. Define shortcut map:
   - `Space` → dispatch `PLAY_PAUSE` action
   - `ArrowLeft` → dispatch `PREV_COMMIT`
   - `ArrowRight` → dispatch `NEXT_COMMIT`
   - `j` → dispatch `SCROLL_DOWN`
   - `k` → dispatch `SCROLL_UP`
   - `+` / `=` → dispatch `ZOOM_IN`
   - `-` → dispatch `ZOOM_OUT`
   - `?` → dispatch `SHOW_HELP`
3. Create `apps/web/components/KeyboardShortcutsModal.tsx`
   - Headless UI Dialog with shortcuts table
   - Triggered by `?` key or help button
4. Integrate hook into `(dashboard)/layout.tsx`
5. Each page subscribes to relevant actions via context or callback refs

### Feature 5: Fork & Remix (Stretch Goal)

**Why**: One-click project fork — Gitea already has a fork API.

**Step-by-step**:
1. Add `POST /repos/{owner}/{repo}/fork` endpoint to `repos.py`
   - Calls Gitea API: `POST /api/v1/repos/{owner}/{repo}/forks`
   - Creates corresponding `repo_data` entry in Supabase
2. Add "Fork" button to repo detail page header
3. Add fork count to repo stats
4. Show "Forked from {owner}/{repo}" badge on forked repos

### Feature 6: Project Activity Heatmap (Stretch Goal)

**Why**: Visual flair — GitHub-style contribution graph for a single project.

**Step-by-step**:
1. Create `apps/web/components/ActivityHeatmap.tsx`
   - Takes array of `{ date: string, count: number }` from commit history
   - Renders 52-week × 7-day grid of colored squares
   - Colors: zinc-800 (no activity) → glass-blue-400 (high activity)
2. Add `GET /repos/{owner}/{repo}/activity` endpoint to aggregate commit counts by day
3. Display on repo detail page's overview section

### Feature 7: Real-time Notifications (Stretch Goal)

**Why**: Keeps users engaged — bell icon shows invites, pushes, comments.

**Step-by-step**:
1. Create `notifications` table in Supabase: `id, user_id, type, title, body, read, created_at`
2. Create CRUD endpoints for notifications
3. Create `apps/web/components/NotificationBell.tsx`
   - Polls `/api/notifications/unread-count` every 30 seconds
   - Dropdown with notification list
   - Mark as read on click
4. Integrate into Navbar
5. Create notifications on events: invite received, push to collaborated repo, comment on snippet

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Canvas rendering takes longer than expected | Medium | High — blocks Days 4-5 | Start with simplest implementation, add detail iteratively |
| Desktop team diff format doesn't match contract | Low | Medium | Share types file ASAP (Day 3), iterate on contract |
| SSL/domain propagation delays | Low | Low | Use IP fallback until DNS resolves |
| Next.js Docker build issues | Medium | Medium | Test locally before deploying, Dockerfile is straightforward |
| wavesurfer.js SSR issues in Next.js | Medium | Medium | Dynamic import with `ssr: false`, already done in existing code |

---

## Daily Standup Template

```
## Date: ____

### Yesterday
-

### Today
-

### Blockers
-

### Notes
-
```

---

## Definition of Done

- [ ] `npm run build` passes with zero errors
- [ ] All new components have TypeScript types (no `any` unless absolutely necessary)
- [ ] Responsive at 375px, 768px, 1024px, 1440px breakpoints
- [ ] Loading and error states handled for all API calls
- [ ] Backend endpoints have error handling with proper HTTP status codes
- [ ] Brand Bible color palette followed (no off-palette colors)
- [ ] Production deploy is accessible over HTTPS
- [ ] Desktop team has received the diff interface contract
