# Local Environment Readiness — `experimental-changes`

A copy-pasteable checklist to take a fresh clone of `experimental-changes` from "git checkout" to "every WIP feature loads in the browser without crashing the backend". Each item is independently verifiable. Run them in order.

> **Why this doc exists:** the experimental branch has substantial new product surface (billing, marketplace, classroom, LTI) that is feature-complete at the service-layer but not wired up in `main.py`, `config.py`, or the database. This file is the gap list.

> **Companion docs:** `README.md` (canonical setup), `ARCHITECTURE.md` (system map), `docs/hosting-decision.md` (production hosting). This doc is *only* about getting `experimental-changes` running locally.

---

## 0. Repo + worktree assumption

If you followed the move-to-`experimental-changes` flow, your working directory is:

```
/Users/<you>/.../SoundHaus_0.2.0-experimental
```

(the original `SoundHaus_0.2.0` directory now sits on `invitation-fixes` and is unrelated to this checklist).

Sanity check:

```bash
git -C /path/to/SoundHaus_0.2.0-experimental rev-parse --abbrev-ref HEAD
# expected: experimental-changes
git -C /path/to/SoundHaus_0.2.0-experimental log --oneline -3
# expected: e76ed97 docs(arch): ARCHITECTURE.md
#           c93e016 fix(sync): repo stats fields...
#           db43a84 fix(web): remove duplicate forkRepo...
```

---

## 1. Apply Postgres migrations V002–V006

These are **NOT** auto-applied by SQLAlchemy `init_db()`. They're hand-written SQL files under `apps/backend/scripts/migrations/`. Apply them in numeric order to your **Supabase** database (the same one `DATABASE_URL` points at).

```bash
cd apps/backend/scripts/migrations

# Each file is idempotent (CREATE TABLE IF NOT EXISTS, etc.) so re-running is safe.
for f in V002_explore_score.sql V003_fork_count.sql V004_billing.sql V005_marketplace.sql V006_classroom_lti.sql; do
  echo "Applying $f"
  psql "$DATABASE_URL" -f "$f"
done
```

If you can't connect with `psql`, paste each file into the Supabase SQL Editor (Dashboard → SQL → New query) and run them one at a time, V002 first.

**Why it matters:** the new `/stats` endpoint reads `repo_data.fork_count` and `repo_data.explore_score`. Without V002 + V003 you'll get `column "fork_count" does not exist` on every repo page load.

**Verify:**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'repo_data'
  AND column_name IN ('fork_count', 'explore_score', 'forked_from')
ORDER BY column_name;
-- expected: 3 rows
```

```sql
SELECT to_regclass('public.subscriptions'),
       to_regclass('public.sample_listings'),
       to_regclass('public.classrooms'),
       to_regclass('public.lti_deployments');
-- expected: 4 non-null rows
```

---

## 2. Backend gaps to wire up

**Status:** the new feature code exists; it just isn't plugged into the FastAPI app. Until you do these edits, FastAPI will start fine (because nothing imports the new routers), but visiting `/billing/*`, `/classroom/*`, `/lti/*`, or `/marketplace/*` will 404, and any code that reads `settings.stripe_secret_key` will raise `AttributeError`.

### 2a. Register the four routers in `main.py`

Edit `apps/backend/main.py`:

```python
# In the import block (around line 25):
from routers import (
    admin,
    audio,
    auth,
    billing,        # <-- add
    classroom,      # <-- add
    collaborators,
    commits,
    dashboard,
    desktop,
    genres,
    health,
    lti,            # <-- add
    marketplace,    # <-- add
    repos,
    reviews,
    snippets,
    webhooks,
)
```

Then in the router registration block (around line 134):

```python
app.include_router(admin.router)        # already registered as of c93e016
app.include_router(billing.router)      # <-- add: /billing/*
app.include_router(marketplace.router)  # <-- add: /marketplace/*
app.include_router(classroom.router)    # <-- add: /classroom/*
app.include_router(lti.router)          # <-- add: /lti/*
```

### 2b. Force model imports so `init_db()` sees the new tables

In the same file, near the existing `import models.seen_models  # noqa: F401`:

```python
import models.seen_models           # noqa: F401
import models.billing_models        # noqa: F401  <-- add
import models.classroom_models      # noqa: F401  <-- add
import models.marketplace_models    # noqa: F401  <-- add
```

This makes SQLAlchemy aware of the model classes so `init_db()` includes them in `Base.metadata`. Even if you ran the migrations in step 1, importing the models prevents an "unknown table" warning from SQLAlchemy when `init_db()` introspects.

### 2c. Add the missing settings to `config.py`

The four WIP services reference `settings.<name>` for fields that don't exist yet. Add this block to `apps/backend/config.py` between the existing `# === Encryption ===` and the `@field_validator` block:

```python
    # === Admin (X-Admin-Token guarded endpoints) ===
    admin_token: Optional[str] = Field(
        default=None,
        description="Shared token for /admin/* endpoints. Empty = admin API disabled.",
    )

    # === Stripe (Phase 6 billing) ===
    stripe_secret_key: Optional[str] = Field(default=None, description="Stripe secret key (sk_test_...)")
    stripe_webhook_secret: Optional[str] = Field(default=None, description="Stripe webhook signing secret")
    stripe_price_pro: Optional[str] = Field(default=None, description="Stripe Price ID for Pro tier")
    stripe_price_team: Optional[str] = Field(default=None, description="Stripe Price ID for Team tier")
    stripe_checkout_success_url: str = Field(
        default="http://localhost:3000/settings/billing?status=success",
        description="Where Stripe Checkout returns the user on success",
    )
    stripe_checkout_cancel_url: str = Field(
        default="http://localhost:3000/settings/billing?status=cancelled",
        description="Where Stripe Checkout returns the user on cancel",
    )
    stripe_portal_return_url: str = Field(
        default="http://localhost:3000/settings/billing",
        description="Where Stripe Customer Portal returns the user",
    )

    # === LTI 1.3 (Phase 8 classroom) ===
    lti_client_id: Optional[str] = Field(default=None, description="Tool client_id registered in Canvas")
    lti_private_key_pem: Optional[str] = Field(
        default=None,
        description="RSA private key (PEM) for signing LTI JWTs. Multi-line; quote in .env.",
    )
    lti_public_jwks_url: Optional[str] = Field(
        default=None,
        description="Public JWKS URL for tool key discovery (often points back at our /lti/jwks)",
    )
    lti_auth_login_url: Optional[str] = Field(
        default=None,
        description="Default OIDC auth login endpoint (per-deployment override stored in lti_deployments)",
    )
```

All optional — when the corresponding feature isn't configured, the routes will return graceful 503 errors instead of crashing.

### 2d. Add the Python deps

Append to `apps/backend/requirements.txt`:

```
stripe>=9.0.0
pyjwt[crypto]>=2.8.0
```

`pyjwt[crypto]` brings in `cryptography` for RS256 signing (LTI requires it). Stripe SDK is mandatory for `billing_service.py`.

Then rebuild the FastAPI image:

```bash
./compose.sh local up -d --build fastapi
```

---

## 3. Environment variables

Add to `apps/backend/.env.local` (and the `.example` file for new contributors):

```env
# Admin endpoints (set this to a long random string and use it as X-Admin-Token)
ADMIN_TOKEN=

# Stripe — leave blank in dev unless you're testing billing.
# All Stripe routes return 503 when these are missing, so absence is safe.
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PRO=
STRIPE_PRICE_TEAM=
# These default to localhost:3000; override only if your web app runs elsewhere.
# STRIPE_CHECKOUT_SUCCESS_URL=
# STRIPE_CHECKOUT_CANCEL_URL=
# STRIPE_PORTAL_RETURN_URL=

# LTI 1.3 — leave blank unless integrating with Canvas.
LTI_CLIENT_ID=
LTI_PRIVATE_KEY_PEM=
LTI_PUBLIC_JWKS_URL=
LTI_AUTH_LOGIN_URL=
```

---

## 4. Bring up the stack

From the repo root (worktree root):

```bash
# 1. Start everything (Postgres for Gitea, Gitea, Redis, FastAPI, worker, token-broker)
./compose.sh local up -d --build

# 2. Watch FastAPI logs for clean startup
docker compose --env-file .env.compose.local logs -f fastapi
```

Expected log lines (from `main.py`):

```
api_startup    message=Starting SoundHaus API
db_init        message=Attempting database connection
db_connection  status=success
db_init        message=Creating database tables
db_init        status=success
```

If you see `db_init` `status=failed` — your `DATABASE_URL` is wrong, or the migrations from step 1 weren't applied.

### 4a. Health checks

```bash
curl -s http://localhost:8000/health | jq
# expected: {"status":"ok",...}

curl -s http://localhost:8000/docs > /dev/null && echo "Swagger UI loads"

# Verify the new routes show up in the OpenAPI schema
curl -s http://localhost:8000/openapi.json | jq -r '.paths | keys[]' | \
  grep -E '^/(admin|billing|classroom|lti|marketplace)/' | head -20
# expected: at least one route from each prefix
```

### 4b. Sync-check endpoint (proves Phase 2 fix is live)

Pick any registered repo:

```bash
curl -s 'http://localhost:8000/repos/<owner_username>/<repo_name>/stats/sync-check' | jq
# expected fields:
#   cached_total_commits, db_commit_details_count, gitea_commit_count, commit_drift, out_of_sync
```

If `out_of_sync: true`, run the new admin backfill (replace `$ADMIN_TOKEN` with whatever you set):

```bash
curl -X POST 'http://localhost:8000/admin/backfill-commits?owner=<owner_username>&repo=<repo_name>' \
  -H "X-Admin-Token: $ADMIN_TOKEN" | jq
```

---

## 5. Frontend bring-up

```bash
cd apps/web
npm install
npm run dev
```

In a second terminal:

```bash
# Should be 200 with HTML
curl -I http://localhost:3000/

# Should be 200 (server-rendered, no auth needed for the public explore page)
curl -I http://localhost:3000/explore
```

Walk through these screens in the browser; they're the smoke test for the WIP wiring:

| URL | Expects | Renders cleanly when… |
|---|---|---|
| `http://localhost:3000/` | Marketing landing | Always |
| `/login` | Login form | Always |
| `/dashboard` | Logged-in dashboard | Logged in, repo_data has rows |
| `/repository/<owner>/<repo>` | Repository detail | All eight `/repos/*` endpoints in step 3 of `ARCHITECTURE.md` §3 return 200 |
| `/explore` | Public repo grid | `/repos/public` returns 200 with at least one public repo |
| `/marketplace` | Sample listings grid | Migrations applied, `marketplace.router` registered, frontend `/lib/api/marketplace.ts` wired |
| `/marketplace/new` | Create-listing form | Same as above + Stripe configured (otherwise the create button 503s) |
| `/classroom` | Classroom dashboard | Migrations + `classroom.router` registered |
| `/settings/billing` | Plan + Stripe portal link | Stripe configured + `billing.router` registered |

If a page renders but data is missing, it's almost certainly a wiring issue from §2 — check `docker compose logs -f fastapi` for the actual error.

---

## 6. Tests

```bash
cd apps/backend
pip install -r tests/requirements.txt

# Full suite (assumes the local stack is up)
python tests/run_all.py

# Filter to the WIP feature tests this branch added
python tests/run_all.py --feature test_billing_webhooks
python tests/run_all.py --feature test_classroom_service
python tests/run_all.py --feature test_marketplace_service
python tests/run_all.py --feature test_require_repo_access
```

Set `RATE_LIMIT_ENABLED=false` in `.env.local` and restart the `fastapi` container if you're hitting "10 logins/min" 429s in the auth tests.

---

## 7. Common failure modes (fast triage)

| Symptom | Most likely cause | Fix |
|---|---|---|
| `column "fork_count" does not exist` on any repo page | Migrations V002/V003 not applied | §1 |
| `AttributeError: 'Settings' object has no attribute 'stripe_secret_key'` | Settings field missing | §2c |
| `404 Not Found` on `/billing/*`, `/classroom/*`, `/lti/*`, `/marketplace/*` | Router not registered | §2a |
| `ModuleNotFoundError: No module named 'stripe'` | Dep not installed; image not rebuilt | §2d + `compose up -d --build fastapi` |
| `LTI tool not configured` from `/lti/launch` | `LTI_PRIVATE_KEY_PEM` missing | §3 (only set if testing LTI) |
| Repo page shows 0 commits but Gitea has 5 | Webhook drift | `GET /repos/<o>/<r>/stats/sync-check` then `POST /admin/backfill-commits?owner=…&repo=…` |
| Pages render fine but stats stay stale forever | Pre-c93e016 cache bug | Already fixed on this branch — check `git log --oneline | grep c93e016` |
| Webhook doesn't fire at all | Gitea webhook config missing or secret mismatch | Check Gitea repo → Settings → Webhooks. URL must be `<WEBHOOK_BASE_URL>/api/webhooks/gitea`, secret must match `GITEA_WEBHOOK_SECRET` |
| `tree -I 'node_modules\|...'` regenerates `structure.txt` differently each run | Filesystem changes between runs (caches, builds) | Commit `structure.txt` only when shape actually changes |

---

## 8. Pre-flight checklist (run before merging `experimental-changes` to main)

- [ ] All five migrations applied to staging Supabase (`SELECT to_regclass(...)` returns non-null for new tables)
- [ ] `apps/backend/main.py` registers all five routers (`admin`, `billing`, `marketplace`, `classroom`, `lti`)
- [ ] `apps/backend/config.py` declares all 11 new settings
- [ ] `apps/backend/requirements.txt` includes `stripe>=9.0.0`, `pyjwt[crypto]>=2.8.0`
- [ ] `python tests/run_all.py` passes against staging, including the four new feature tests
- [ ] `curl /openapi.json | jq '.paths | keys[]'` includes routes from all five new prefixes
- [ ] `curl /repos/<o>/<r>/stats/sync-check` returns the new payload shape
- [ ] Frontend builds: `cd apps/web && npm run build` exits 0 with no type errors
- [ ] Web smoke: `/dashboard`, `/repository/<o>/<r>`, `/explore`, `/marketplace`, `/classroom`, `/settings/billing` all return 200 and render
- [ ] `git log --oneline experimental-changes ^main` is the expected commit set; no stray WIP commits
