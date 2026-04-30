# Manual Smoke Testing — `experimental-changes`

Step-by-step instructions to **run the stack yourself** and verify core flows plus the newer surfaces (billing, marketplace, classroom, LTI, admin backfill, sync).

> **Companion:** `docs/local-env-checklist.md` (migrations, env vars, compose). This doc is the **click path + curl** matrix.

---

## Prerequisites (do these first)

1. **Repository path** — work from your `experimental-changes` clone (e.g. `SoundHaus_0.2.0-experimental`).

2. **Compose env file** — copy the example and fill values:

   ```bash
   cd /path/to/SoundHaus_0.2.0-experimental
   cp .env.compose.local.example .env.compose.local
   # Edit .env.compose.local: DATABASE_URL, Supabase keys, Gitea admin token, etc.
   ```

3. **Backend secrets file** — the compose file references `BACKEND_ENV_FILE` (usually `apps/backend/.env.local`). Copy from example and fill:

   ```bash
   cp apps/backend/.env.local.example apps/backend/.env.local
   # Minimum: DATABASE_URL, SUPABASE_*, GITEA_*, etc. per README
   ```

4. **Migrations V002–V006** — apply to the **same** Postgres as `DATABASE_URL` (Supabase SQL Editor or `psql`). See `docs/local-env-checklist.md` §1. Without them, repo stats queries error on missing columns/tables.

5. **Web env** — `apps/web/.env.local` with at least `API_URL=http://localhost:8000` (and any `NEXT_PUBLIC_*` your pages need). See `apps/web/README.md`.

---

## Start services

From repo root:

```bash
./compose.sh local up -d --build
```

Watch API until DB init succeeds:

```bash
docker compose --env-file .env.compose.local logs -f fastapi
# Look for: db_init ... status=success
```

**Terminal B — Next.js (if you are not running web in Docker):**

```bash
cd apps/web
npm install
npm run dev
```

Default URLs: **API** `http://localhost:8000`, **Web** `http://localhost:3000`.

---

## Smoke matrix (run in order)

### 1. API liveness

```bash
curl -s http://localhost:8000/health | jq .
```

**Pass:** JSON with `"status"` (or your existing health shape) and HTTP 200.

---

### 2. OpenAPI — new routers present

```bash
curl -s http://localhost:8000/openapi.json | jq -r '.paths | keys[]' | \
  grep -E '^/(admin|billing|classrooms|marketplace|lti|\.well-known)/' | sort -u
```

**Pass:** You see paths under `/billing`, `/classrooms`, `/marketplace`, `/lti`, `/admin`, and optionally `/.well-known/jwks.json`.

---

### 3. Web — public shell

| Step | Action | Pass criteria |
|------|--------|----------------|
| 3a | Open `http://localhost:3000/` | Page loads, no blank screen / 500 overlay |
| 3b | Open `http://localhost:3000/explore` | Public explore loads (may be empty) |
| 3c | Open `http://localhost:3000/login` | Login form visible |

---

### 4. Auth — sign in

| Step | Action | Pass criteria |
|------|--------|----------------|
| 4a | Register or log in with a **real** test user (Supabase) | Redirect to dashboard or intended post-login route |
| 4b | Open `http://localhost:3000/dashboard` while logged in | Dashboard loads, navbar shows user |

---

### 5. Repositories — stats + commits (Phase 2 sync)

Pick **one** repo you know exists in Gitea and is registered in SoundHaus (`owner` / `repo` slug).

| Step | Action | Pass criteria |
|------|--------|----------------|
| 5a | Open `http://localhost:3000/repository/<owner>/<repo>` | Page loads |
| 5b | Check stats (stars, forks, last activity, clone block) | Numbers match your expectations vs Gitea **within webhook delay** |
| 5c | Check commit list / timeline | SHAs or messages match Gitea history for recent commits |
| 5d | Hard refresh (Cmd+Shift+R) twice | Stats do **not** flip back to stale values (Next fetch uses `no-store` for API reads) |

**API drift check (optional):**

```bash
curl -s "http://localhost:8000/repos/<owner>/<repo>/stats/sync-check" | jq .
```

**Pass:** JSON includes drift fields; if `out_of_sync: true`, run admin backfill (step 8) then re-check.

---

### 6. Explore + clone UX

| Step | Action | Pass criteria |
|------|--------|----------------|
| 6a | From explore, open a public repo | Remix / clone entry points work |
| 6b | Open clone modal or clone page | Copied URL has **no** embedded `user:pass@`, no stray `.git` if you expect a browser link |

---

### 7. WIP product pages (expect 503 if not configured)

| URL | What to verify |
|-----|----------------|
| `http://localhost:3000/marketplace` | Grid or empty state; **no** white screen |
| `http://localhost:3000/marketplace/new` | Form renders; submit may 503 if Stripe not set — **acceptable** |
| `http://localhost:3000/classroom` | List or empty state |
| `http://localhost:3000/settings/billing` | Plan UI or “billing not configured” style message — **not** a crash |

**Stripe:** set `STRIPE_SECRET_KEY` and price IDs in `apps/backend/.env.local` only when you want real Checkout tests.

**LTI:** configure `LTI_*` vars only when testing Canvas handshake; otherwise `/lti/*` may return 503 — acceptable locally.

---

### 8. Admin backfill (optional, needs `ADMIN_TOKEN`)

In `apps/backend/.env.local`:

```env
ADMIN_TOKEN=your-long-random-secret
```

Restart `fastapi`, then:

```bash
curl -s -X POST "http://localhost:8000/admin/backfill-commits?owner=<owner>&repo=<repo>" \
  -H "X-Admin-Token: your-long-random-secret" | jq .
```

**Pass:** HTTP 200 and a JSON body describing work done (or “nothing to do”). Then repeat step **5c** — commit list should align with Gitea if drift was from missed webhooks.

---

### 9. Regression — collaborators / invites

| Step | Action | Pass criteria |
|------|--------|----------------|
| 9a | Invite a collaborator on a repo you own | Invitation created (UI + or email depending on config) |
| 9b | Decline / accept from invitee | State updates without 500 |

---

## Shutdown

```bash
./compose.sh local down
```

---

## What we verified in CI/agent environments

- Automated smoke against `localhost:8000` / `localhost:3000` was **not** run in this session: no `.env.compose.local` was present and no containers were listening on 8000/3000.
- After you complete Prerequisites + Start services, work through sections **1–9** and note any failure at the exact step (helps narrow DB vs auth vs Stripe vs LTI).
