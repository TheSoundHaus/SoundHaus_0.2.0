# SoundHaus — Master Product + Engineering Plan
**Last updated:** 2026-04-08
**Branch:** `manage-repos-full`
**Server:** Digital Ocean (FastAPI + Gitea via Docker Compose). Web: Next.js on Vercel (migrate to Fly.io). Storage: Supabase Storage (migrate to Cloudflare R2).

---

## Table of Contents
1. [Known Issues — Fix Before Anything Else](#1-known-issues)
2. [Infrastructure Migration](#2-infrastructure-migration)
3. [Private Repo System — Proper Fix](#3-private-repo-system)
4. [Repo Forking](#4-repo-forking)
5. [Commit Review Process](#5-commit-review-process)
6. [Audio Files in Desktop Changelog](#6-audio-files-in-desktop-changelog)
7. [Explore Algorithm](#7-explore-algorithm)
8. [Sample Marketplace (DO FIRST after fixes)](#8-sample-marketplace)
9. [Collaboration Marketplace](#9-collaboration-marketplace)
10. [Classroom Mode](#10-classroom-mode)
11. [Monetization / Stripe](#11-monetization--stripe)
12. [Plugin Ecosystem (Later)](#12-plugin-ecosystem)
13. [Sequencing Summary](#13-sequencing-summary)
14. [Appendices](#14-appendices)

---

## 1. Known Issues

Fix all of these before building any new feature. They undermine trust and will cause data integrity problems at scale.

---

### 1.1 — Private repos have no access control on data endpoints

**Severity: CRITICAL** | **Status: Unfixed**

`is_public` exists on `repo_data` but is only checked on the explore/public-listing endpoints. Every other endpoint exposes data regardless of privacy:

- `GET /repos/{owner}/{repo}/commits` — no is_public check
- `GET /repos/{owner}/{repo}/commits/{sha}` — no is_public check
- `GET /repos/{owner}/{repo}/commits/{sha}/diff` — no is_public check
- `GET /repos/{owner}/{repo}/snippet` — no is_public check
- `GET /repos/{owner}/{repo}/snippet/metadata` — no is_public check
- `GET /repos/{owner}/{repo}/snippet/comments` — no is_public check
- `GET /api/repos/{owner}/{repo}/audio/waveform` — no is_public check
- `GET /api/webhooks/repo/{owner}/{repo}/activity` — no is_public check
- `GET /api/webhooks/repo/{owner}/{repo}/events` — no is_public check

**Fix:** Add `require_repo_access(owner, repo, caller_id, db)` to `apps/backend/dependencies.py`:
1. Resolve owner → UUID via `resolve_owner_id()`
2. Look up `RepoData` row — 404 if not found
3. If `is_public=True` → allow
4. If `is_public=False` → verify caller is owner OR has `CollaboratorInvitation` with `status="accepted"` for this repo
5. Return `HTTP 404` for unauthorized private repos (never 403 — don't confirm the repo exists)

Call this helper at the top of each affected route function body. Do not use `Depends()` for this one since it needs the URL path params.

**Files:** `dependencies.py`, `routers/commits.py`, `routers/snippets.py`, `routers/comments.py`, `routers/audio.py`, `routers/webhooks.py`

---

### 1.2 — `is_public` not synced on repo creation or settings change

**Severity: HIGH** | **Status: Unfixed**

`RepoData` has `is_public = Column(Boolean, default=True)`. When a user creates a repo with `private=True`, Gitea stores it as private but `repo_data.is_public` stays `True`. All 137 repos in the live DB have `is_public=True`.

**Fix — three parts:**

1. In `create_repo` route (`repos.py`): after `svc.create_user_repo()` succeeds, set `repo_data.is_public = not create_request.private` before commit.
2. In `patch_repo_settings` route: when `private` field changes, also update `repo_data.is_public`.
3. One-time script `apps/backend/scripts/sync_repo_visibility.py`: iterate all `repo_data` rows, call Gitea `GET /api/v1/repos/{owner}/{repo}`, write `is_public = not repo["private"]`.

---

### 1.3 — Explore endpoint makes N+1 Gitea API calls

**Severity: HIGH (performance)** | **Status: Unfixed**

`GET /repos/public` calls `svc.get_repo(owner, repo_name)` for every `repo_data` row to verify Gitea visibility and fetch `description` + `stars_count`. At 137 repos = 137 HTTP calls per page load. Will timeout at scale.

**Fix:** Once 1.2 is resolved, `is_public` on `repo_data` IS the source of truth. Remove the inner Gitea call entirely. Use the already-cached `repo.description` and `repo.stars_count` columns. The webhook handler already keeps these current.

**Files:** `apps/backend/routers/repos.py` lines ~395–435.

---

### 1.4 — UUID-as-username in display fields (partially fixed)

**Severity: MEDIUM** | **Status: Partially fixed 2026-04-08**

`commits.py` and `webhooks.py` were fixed to filter non-UUID strings before `Profile.id.in_()`. Still needs audit on:
- `GET /repos/user/{username}/stats` response fields
- `GET /api/auth/profile/{username}/public` response
- Any response body that returns `owner_id` instead of `owner_username`

**Audit command:**
```bash
grep -n "owner_id\|user_id" apps/backend/routers/repos.py | grep -v "filter\|==\|FK"
```
Verify each hit returns `username`, not the UUID, in the JSON response.

---

### 1.5 — `RepoData.total_commits` stale for most repos

**Severity: LOW** | **Status: Known**

Only increments on webhook push events. Pre-webhook repos show `0`.

**Fix:** One-time SQL:
```sql
UPDATE repo_data r
SET total_commits = (
  SELECT COUNT(*) FROM commit_details c WHERE c.repo_id = r.gitea_id
);
```
Add as `apps/backend/scripts/backfill_commit_counts.py`.

---

### 1.6 — Desktop diff can still produce "Unnamed Track" edge cases

**Severity: LOW** | **Status: Claimed fixed — verify**

`diffTransformer.ts` now uses `t.user_name || t.effective_name` from `project.tracks`. Verify with a fresh ALS file where a track has `user_name: null` and `effective_name: "AudioTrack 1"`. The `ensureTrack()` fallback update only fires when `track.trackName === 'Unnamed Track'`, which should cover this.

---

## 2. Infrastructure Migration

### 2.1 — Storage: Supabase → Cloudflare R2

**Priority: HIGH — before any marketplace feature**

**Why R2 over AWS S3:**
- Zero egress fees — S3 charges $0.09/GB egress. R2 charges $0. For an audio platform serving snippets, stems, and waveforms constantly, this is the most important cost driver.
- S3-compatible API — use `boto3` with a custom endpoint, zero code changes vs S3
- Simpler ops than AWS

**What to migrate:** snippets, thumbnails, avatars, stem files. Everything currently in Supabase Storage.

**What stays on Supabase:** Auth + PostgreSQL database. Nothing else.

**Steps:**

1. Add to `requirements.txt`: `boto3==1.34.*`

2. Add to `apps/backend/config.py`:
   ```python
   r2_account_id: str
   r2_access_key_id: str
   r2_secret_access_key: str
   r2_bucket_name: str = "soundhaus-media"
   r2_public_domain: str    # e.g., "media.thesound.haus"
   ```

3. Create `apps/backend/services/storage_service.py` wrapping boto3:
   - Endpoint: `https://{account_id}.r2.cloudflarestorage.com`
   - Methods: `upload(key, data, content_type)`, `delete(key)`, `get_public_url(key)`, `generate_signed_url(key, expires_in=3600)`
   - Public URL pattern: `{r2_public_domain}/{key}`

4. Replace Supabase storage calls in `SnippetService`, `repos.py` thumbnail routes, `auth.py` avatar routes with `StorageService`.

5. Create `apps/backend/scripts/migrate_to_r2.py`:
   - Iterate all `repo_data` rows with `audio_snippet` URLs
   - Download from Supabase, re-upload to R2, update DB URL
   - Same for `thumbnail_url` in `repo_data` and `avatar_url` in `profiles`

6. Set up Cloudflare R2 bucket with a custom domain (`media.thesound.haus`) via Cloudflare dashboard.

---

### 2.2 — Hosting: Vercel → Fly.io

**Priority: MEDIUM — before launch**

**Why Fly.io:**
- No surprise billing (Vercel charges per function invocation — unpredictable for a social platform)
- True Docker container — full SSR support, no cold starts on hobby plan
- Can colocate in Newark (same region as DO droplet)
- Supports WebSockets natively (needed for future real-time features)

**Steps:**

1. Add `output: 'standalone'` to `next.config.ts`

2. Create `apps/web/Dockerfile`:
   ```dockerfile
   FROM node:20-alpine AS builder
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci
   COPY . .
   RUN npm run build

   FROM node:20-alpine AS runner
   WORKDIR /app
   ENV NODE_ENV=production
   COPY --from=builder /app/.next/standalone ./
   COPY --from=builder /app/.next/static ./.next/static
   COPY --from=builder /app/public ./public
   EXPOSE 3000
   CMD ["node", "server.js"]
   ```

3. Create `apps/web/fly.toml`:
   ```toml
   app = "soundhaus-web"
   primary_region = "ewr"
   [build]
     dockerfile = "Dockerfile"
   [http_service]
     internal_port = 3000
     auto_stop_machines = true
     auto_start_machines = true
   ```

4. Move all `NEXT_PUBLIC_*` and API keys to Fly secrets via `fly secrets set`.

5. Point `thesound.haus` CNAME to `soundhaus-web.fly.dev`.

---

## 3. Private Repo System

Full implementation of the access control dependency (expands on Issue 1.1 and 1.2).

### `require_repo_access()` helper (add to `dependencies.py`)

```python
from models.repo_models import RepoData
from models.invitation_models import CollaboratorInvitation

def require_repo_access(
    owner: str,
    repo: str,
    db: Session,
    caller_id: Optional[str] = None,
    caller_email: Optional[str] = None,
) -> RepoData:
    """
    Returns RepoData if the caller has access.
    - Public repos: always accessible
    - Private repos: owner or accepted collaborator only
    - Returns 404 (not 403) for unauthorized private repos
    """
    owner_id = resolve_owner_id(owner, db)
    repo_id = f"{owner_id}/{repo}"
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    if not repo_data:
        raise HTTPException(status_code=404, detail="Repository not found")
    if repo_data.is_public:
        return repo_data
    if caller_id is None:
        raise HTTPException(status_code=404, detail="Repository not found")
    if str(caller_id) == str(owner_id):
        return repo_data
    # Check collaborator invitation
    if caller_email:
        collab = db.query(CollaboratorInvitation).filter(
            CollaboratorInvitation.repo_name == repo_id,
            CollaboratorInvitation.invitee_email == caller_email,
            CollaboratorInvitation.status == "accepted",
        ).first()
        if collab:
            return repo_data
    raise HTTPException(status_code=404, detail="Repository not found")
```

### Web app error handling

`apps/web/app/(dashboard)/repository/[owner]/[repo]/page.tsx` — catch `404` from backend and render:
```tsx
<div>This repository is private or does not exist.</div>
```
rather than a generic crash page.

---

## 4. Repo Forking

**Complexity: Low** — Gitea has a native fork API. This is 1 service method + 1 route + frontend.

### Backend

**Add to `RepoData` model:**
```python
forked_from = Column(String(255), nullable=True, index=True)  # gitea_id of source repo
fork_count   = Column(Integer, default=0, nullable=False)
```

**Add to `apps/backend/services/repo_service.py`:**
```python
def fork_repo(self, source_owner: str, source_repo: str, fork_owner_id: str, new_name: Optional[str] = None) -> Dict[str, Any]:
    """Fork via Gitea POST /api/v1/repos/{owner}/{repo}/forks"""
    payload = {"organization": fork_owner_id}
    if new_name:
        payload["name"] = new_name
    resp = requests.post(
        self._url(f"repos/{source_owner}/{source_repo}/forks"),
        headers=self._admin_headers(),
        json=payload,
    )
    if resp.status_code not in (200, 202):
        return {"success": False, "message": resp.text}
    return {"success": True, "repo": resp.json()}
```

**New route in `repos.py`:** `POST /repos/{owner}/{repo}/fork`
1. Verify source repo access (must be public or caller is collaborator)
2. Prevent forking your own repo
3. Call `svc.fork_repo(owner_uuid, repo, caller_uuid, optional_new_name)`
4. Create new `RepoData` row with `forked_from=source_gitea_id`, copy `genres`, `description`, `thumbnail_url`
5. Create webhook on forked repo via `_create_repo_webhook()`
6. Increment `source.fork_count` and commit
7. Return new repo URL

### Web UI

- Fork button in repo header (next to Star)
- "Forked from [owner/repo]" badge below repo name when `forked_from` is set
- `apps/web/components/ForkModal.tsx` — confirm dialog + optional rename input
- New web API route: `apps/web/app/api/repos/[owner]/[repo]/fork/route.ts`

---

## 5. Commit Review Process

**Goal:** Owner pushes freely to `main`. Collaborators submit changes that require owner approval before appearing in the public timeline.

**Decision: Use Gitea branch protection + PR flow.** Don't build a custom git layer. Gitea already handles branch merging, conflict detection, and PR state.

### How It Works

- Gitea branch protection is enabled on `main` at repo creation time
- Owner is whitelisted to push directly to `main`
- Collaborator pushes go to `contrib/{their-gitea-uuid}` automatically (enforced by branch protection rejecting `main` pushes from non-owners)
- A PR is created on Gitea either by the collaborator or automatically
- Owner sees pending contributions in SoundHaus dashboard
- Accept → Gitea merge API; Decline → Gitea close PR API
- The commit timeline on SoundHaus only shows commits on `main` — unreviewed contributions are invisible publicly

### Implementation

**Step 1 — Enable branch protection on creation** (`repo_service.py`):
```python
def _protect_main_branch(self, owner: str, repo: str):
    requests.post(
        self._url(f"repos/{owner}/{repo}/branch_protections"),
        headers=self._admin_headers(),
        json={
            "branch_name": "main",
            "enable_push": True,
            "enable_push_whitelist": True,
            "push_whitelist_usernames": [owner],
            "required_approvals": 0,
        }
    )
```
Call this after `_create_repo_webhook()` in `create_user_repo()`.

**Step 2 — New model: `apps/backend/models/contribution_models.py`**
```python
class Contribution(Base):
    __tablename__ = "contributions"
    id              = Column(String, PK, default=uuid4)
    repo_id         = Column(String(255), FK "repo_data.gitea_id")
    contributor_id  = Column(String(255), FK "profiles.id")
    gitea_pr_index  = Column(Integer, nullable=False)
    branch_name     = Column(String(255), nullable=False)
    title           = Column(String(255), nullable=True)
    status          = Column(String(20), default="pending")  # pending/merged/declined
    created_at      = Column(DateTime, server_default=func.now())
    reviewed_at     = Column(DateTime, nullable=True)
    reviewed_by     = Column(String(255), nullable=True)
```

**Step 3 — Handle `pull_request` webhook events** in `webhooks.py`:
When `event_type == "pull_request"` and `action == "opened"`, insert a `Contribution` row.

**Step 4 — New routes** (add to `repos.py` or a new `contributions.py`):
```
GET  /repos/{owner}/{repo}/contributions          — list pending (owner only)
POST /repos/{owner}/{repo}/contributions/{id}/accept  — merge PR
POST /repos/{owner}/{repo}/contributions/{id}/decline — close PR
```

Gitea merge call:
```
POST /api/v1/repos/{owner}/{repo}/pulls/{index}/merge
body: {"Do": "merge", "merge_message_field": "Merged contribution"}
```
Gitea decline call:
```
PATCH /api/v1/repos/{owner}/{repo}/pulls/{index}
body: {"state": "closed"}
```

**Step 5 — Web UI:** "Contributions" tab on repo page, visible only to owner when `pending > 0`. Shows diffs, accept/decline per contribution.

---

## 6. Audio Files in Desktop Changelog

**Goal:** When a commit contains changed audio files, show them in the desktop changelog and optionally let the user add a note about what changed.

### Current State

`CommitDetail.files_added/modified/removed` already captures all changed file paths from the Gitea webhook. The `diffTransformer.ts` processes only the ALS semantic diff and ignores raw file paths entirely.

### Implementation

**Step 1 — Extend `ProjectDiff` in `diffTransformer.ts`:**
```typescript
interface AudioFileChange {
    path: string;
    changeType: 'added' | 'removed' | 'modified';
    userComment?: string;
}

// Add to ProjectDiff:
audioFileChanges?: AudioFileChange[];
```

**Step 2 — Detect audio files after push** in `apps/desktop/src/electron/project.ts`:
After git push completes, run `git diff --name-only {prev_sha}..{new_sha}` and filter for extensions: `.wav`, `.aif`, `.aiff`, `.mp3`, `.flac`, `.ogg`, `.m4a`, and paths matching `Samples/`, `samples/`, `Audio/`, `audio/`.

**Step 3 — Comment dialog** in `apps/desktop/src/components/AudioFileCommentDialog.tsx`:
- Triggered in `ProjectPage.tsx` before the diff is POSTed to the API
- Only shown if `audioFileChanges.length > 0`
- Shows each changed file path with an optional single-line comment input
- User can dismiss without commenting — comments are optional
- Populates `audioFileChanges[i].userComment` from inputs

**Step 4 — Backend storage:** No schema changes needed. `AlsDiff.diff_data` is a JSON column — `audioFileChanges` flows through automatically as part of the `ProjectDiff` payload.

**Step 5 — Web display** in `apps/web/components/diff/DiffTimeline.tsx`:
Add an "Audio Files" section after track rows when `diff.audioFileChanges?.length > 0`. Render each file as a simple row: change type badge + file name + user comment (if any).

---

## 7. Explore Algorithm

**Current:** Flat list, `is_public` filter only, N+1 Gitea calls (137 HTTP requests per page load).
**Goal:** Ranked, social-media-style feed. No Gitea calls. Personalized for logged-in users.

### Scoring Formula

```
score = (
    log(stars_count + 1)            * 3.0  +
    log(clone_count + 1)            * 2.5  +
    log(recent_commits_30d + 1)     * 4.0  +
    (1.0 if audio_snippet else 0.0) * 2.0  +
    (1.0 if thumbnail_url else 0.0) * 0.5
) * time_decay * genre_affinity
```

- `time_decay = 1.0 / (hours_since(last_activity_at) + 2.0) ** 0.4`
- `genre_affinity` = 1.0 for anonymous users; 1.0 + (0.3 × genre_overlap_count) for authenticated users
- `recent_commits_30d` = subquery from `commit_details WHERE timestamp > NOW() - INTERVAL '30 days'`

### Already-Seen Suppression

`user_repo_seen` table already exists. For authenticated users, repos seen in the last 24 hours get score × 0.3 (suppressed, not removed).

### Pre-computation (Recommended)

Add `explore_score = Column(Float, default=0.0, index=True)` to `RepoData`.

Add background route `POST /api/admin/recompute-explore-scores` (called by a server-side cron every 15 minutes):
- Runs the scoring SQL in bulk and writes back to `explore_score`
- The explore endpoint then does `ORDER BY explore_score DESC` — one fast indexed query

### Updated `get_public_repos` Route

1. Remove all `svc.get_repo()` calls — use cached columns only
2. Add pagination: `?page=1&limit=20`
3. Add sort modes: `?sort=trending` (default, `explore_score DESC`), `?sort=new` (`last_activity_at DESC`), `?sort=top` (`stars_count DESC`)
4. For authenticated users: apply seen-suppression via `user_repo_seen` LEFT JOIN
5. Genre filter stays as-is

### Interaction Tracking

Add `POST /repos/{owner}/{repo}/viewed` — fired by web app when a repo page is opened. Upserts `user_repo_seen`. This is the signal that drives personalization.

---

## 8. Sample Marketplace

**Priority: DO FIRST after bug fixes and storage migration**

The core insight: audio files are already in the repo (git LFS). The marketplace is just a sales and delivery layer on top of files that already exist.

### Database Schema (`apps/backend/models/marketplace_models.py`)

```python
class MarketplaceListing(Base):
    __tablename__ = "marketplace_listings"
    id             = Column(String, PK, default=uuid4)
    repo_id        = Column(String(255), FK "repo_data.gitea_id")
    seller_id      = Column(String(255), FK "profiles.id")
    file_path      = Column(String(500))     # path in repo, e.g. "Samples/kick.wav"
    file_name      = Column(String(255))     # display name
    price_cents    = Column(Integer)         # USD cents; 0 = free
    currency       = Column(String(3), default="usd")
    description    = Column(Text, nullable=True)
    preview_url    = Column(String(500), nullable=True)   # 15s preview clip on R2
    sample_type    = Column(String(50), nullable=True)    # "one-shot"|"loop"|"stem"|"project"
    bpm            = Column(Float, nullable=True)
    key            = Column(String(20), nullable=True)
    tags           = Column(JSON, default=list)
    is_active      = Column(Boolean, default=True)
    download_count = Column(Integer, default=0)
    created_at     = Column(DateTime, server_default=func.now())

class MarketplacePurchase(Base):
    __tablename__ = "marketplace_purchases"
    id                       = Column(String, PK, default=uuid4)
    listing_id               = Column(String, FK "marketplace_listings.id")
    buyer_id                 = Column(String(255), FK "profiles.id")
    stripe_payment_intent_id = Column(String(255), unique=True)
    amount_cents             = Column(Integer)
    status = Column(String(20), default="pending")  # pending/completed/refunded
    created_at               = Column(DateTime, server_default=func.now())
    completed_at             = Column(DateTime, nullable=True)
```

### API Routes (`apps/backend/routers/marketplace.py`)

```
POST   /marketplace/listings              — create listing (must own the repo)
GET    /marketplace/listings/{id}         — listing detail + preview URL
PATCH  /marketplace/listings/{id}         — update (seller only)
DELETE /marketplace/listings/{id}         — remove listing (seller only)

GET    /marketplace                       — browse (?type=loop&bpm_min=120&key=Cm&sort=popular&page=1)
GET    /marketplace/seller/{username}     — a seller's listings

POST   /marketplace/listings/{id}/checkout    — create Stripe PaymentIntent → returns client_secret
POST   /marketplace/webhook/stripe            — Stripe webhook: mark purchase complete
GET    /marketplace/purchases                 — buyer's purchase history
GET    /marketplace/purchases/{id}/download   — issue signed R2 URL (time-limited, buyer only)
```

### Seller Payout — Stripe Connect

- Use **Stripe Connect** (Standard Accounts) so sellers receive direct payouts
- Add to `profiles`: `stripe_account_id = Column(String(255), nullable=True)`, `stripe_onboarded = Column(Boolean, default=False)`
- `POST /marketplace/connect/onboard` → redirect to Stripe hosted onboarding
- Platform fee: 15% via `application_fee_amount` on each PaymentIntent
- Free listings (price_cents=0): skip Stripe, record download, issue signed URL directly

### File Delivery

After purchase confirmed:
1. Call Gitea LFS API to get raw file URL, or
2. For files already on R2: `boto3.generate_presigned_url(ExpiresIn=3600)`
3. Issue the signed URL to the buyer — valid 1 hour
4. Increment `listing.download_count`

### Preview Generation

On listing creation for audio files:
1. Use the existing `pydub` pipeline (already in `SnippetService`) to trim to 15 seconds
2. Upload to R2 at `marketplace/{listing_id}/preview.mp3`
3. Store URL in `listing.preview_url` — this URL is public (no auth for previewing)

### Web UI (new pages)

- `apps/web/app/(dashboard)/marketplace/page.tsx` — browse grid, filter sidebar
- `apps/web/app/(dashboard)/marketplace/[id]/page.tsx` — listing detail, waveform preview, buy button
- `apps/web/app/(dashboard)/marketplace/sell/page.tsx` — seller dashboard: manage listings, Stripe onboarding, earnings
- Listing creation: "Sell a file from this project" button on repo page you own → modal showing file tree → pick file → fill in listing details

---

## 9. Collaboration Marketplace

**Priority: After sample marketplace is live**

A scoped musician job board tied to actual SoundHaus projects. Producers post "looking for" listings. Others apply. Accepting an application fires a collaboration invite (reusing the existing `CollaboratorInvitation` pipeline).

### Database Schema

```python
class CollabListing(Base):
    __tablename__ = "collab_listings"
    id                 = Column(String, PK, default=uuid4)
    poster_id          = Column(String(255), FK "profiles.id")
    repo_id            = Column(String(255), nullable=True)   # optional — link to a project
    title              = Column(String(255))
    description        = Column(Text)
    role_needed        = Column(String(100))   # "Vocalist"|"Mixing Engineer"|"Mastering"|"Producer"
    genre              = Column(String(100), nullable=True)
    budget_description = Column(String(100), nullable=True)   # "Rev share"|"$100-200"|"Free"
    is_remote          = Column(Boolean, default=True)
    is_active          = Column(Boolean, default=True)
    created_at         = Column(DateTime, server_default=func.now())
    expires_at         = Column(DateTime, nullable=True)

class CollabApplication(Base):
    __tablename__ = "collab_applications"
    id           = Column(String, PK, default=uuid4)
    listing_id   = Column(String, FK "collab_listings.id")
    applicant_id = Column(String(255), FK "profiles.id")
    message      = Column(Text, nullable=True)
    status       = Column(String(20), default="pending")  # pending/accepted/declined
    created_at   = Column(DateTime, server_default=func.now())
    # UNIQUE (listing_id, applicant_id)
```

### API Routes (`apps/backend/routers/collab_market.py`)

```
POST   /collab/listings                          — post listing
GET    /collab/listings                          — browse (?role=Vocalist&genre=HipHop)
GET    /collab/listings/{id}                     — detail
POST   /collab/listings/{id}/apply               — apply with message
GET    /collab/listings/{id}/applications        — poster sees applicants (auth + own listing)
PATCH  /collab/applications/{id}                 — accept or decline
GET    /collab/my-listings                       — your posted listings
GET    /collab/my-applications                   — your submitted applications
```

When application accepted: automatically fire `POST /repos/{repo}/collaborators/invite` for the linked repo.

### Web UI

- `apps/web/app/(dashboard)/collab/page.tsx` — browseable grid
- `apps/web/app/(dashboard)/collab/[id]/page.tsx` — detail + apply + applicant list (if owner)

---

## 10. Classroom Mode

**Priority: Medium — after marketplace + billing foundations**
**Tier required: Team ($40/mo)**

### Database Schema (`apps/backend/models/classroom_models.py`)

```python
class Classroom(Base):
    __tablename__ = "classrooms"
    id          = Column(String, PK, default=uuid4)
    owner_id    = Column(String(255), FK "profiles.id")
    name        = Column(String(255))
    description = Column(Text, nullable=True)
    invite_code = Column(String(16), unique=True)
    is_active   = Column(Boolean, default=True)
    created_at  = Column(DateTime, server_default=func.now())

class ClassroomMember(Base):
    __tablename__ = "classroom_members"
    classroom_id = Column(String, FK "classrooms.id")
    user_id      = Column(String(255), FK "profiles.id")
    role         = Column(String(20))  # "instructor"|"student"
    joined_at    = Column(DateTime, server_default=func.now())
    # PK: (classroom_id, user_id)

class Assignment(Base):
    __tablename__ = "assignments"
    id               = Column(String, PK, default=uuid4)
    classroom_id     = Column(String, FK "classrooms.id")
    title            = Column(String(255))
    instructions     = Column(Text, nullable=True)
    template_repo_id = Column(String(255), nullable=True)  # fork this on "Start"
    deadline         = Column(DateTime, nullable=True)
    allow_late       = Column(Boolean, default=False)
    created_at       = Column(DateTime, server_default=func.now())

class Submission(Base):
    __tablename__ = "submissions"
    id            = Column(String, PK, default=uuid4)
    assignment_id = Column(String, FK "assignments.id")
    student_id    = Column(String(255), FK "profiles.id")
    repo_id       = Column(String(255), nullable=True)
    submitted_at  = Column(DateTime, nullable=True)
    is_frozen     = Column(Boolean, default=False)
    grade         = Column(String(20), nullable=True)
    feedback      = Column(Text, nullable=True)
    graded_by     = Column(String(255), nullable=True)
    graded_at     = Column(DateTime, nullable=True)
    # UNIQUE (assignment_id, student_id)
```

### Submission Freeze

Add `post_deadline = Column(Boolean, default=False)` to `CommitDetail`. When a push arrives for a repo that is a frozen submission, still record the commit but set `post_deadline=True`. Surface this in the grading view. Don't block the actual git push.

### Assignment Templates

"Start Assignment" button (when `template_repo_id` exists):
1. Calls `svc.fork_repo()` (requires Section 4)
2. Creates `Submission` row linking student to the forked repo

### API Routes (`apps/backend/routers/classroom.py`)

```
POST   /classrooms                                     — create (Team tier required)
GET    /classrooms                                     — list own + enrolled
GET    /classrooms/{id}                                — detail
DELETE /classrooms/{id}                                — archive (sets is_active=False)
POST   /classrooms/{id}/join                           — student joins by invite_code
POST   /classrooms/{id}/assignments                    — create
GET    /classrooms/{id}/assignments                    — list
POST   /assignments/{id}/start                         — fork template + create submission
POST   /assignments/{id}/submit                        — link existing repo
GET    /assignments/{id}/submissions                   — instructor view (auth + instructor)
POST   /submissions/{id}/grade                         — grade
```

### Web Pages

- `apps/web/app/(dashboard)/classroom/page.tsx` — list owned + enrolled classrooms
- `apps/web/app/(dashboard)/classroom/[id]/page.tsx` — classroom overview + assignment list
- `apps/web/app/(dashboard)/classroom/[id]/assignments/[assignment_id]/page.tsx` — assignment detail; instructor sees submission list; student sees submit/start button
- Grading view: embed the student's repo `DiffTimeline` component directly — instructors review specific versions, not just a final file

---

## 11. Monetization / Stripe

**Implement before Classroom Mode.** Classroom requires tier enforcement.

### Tier Table

| Tier | Price | Private Repos | Storage | Collaborators | Classroom |
|--|--|--|--|--|--|
| Free | $0 | 0 | 2 GB | 2 per repo | No |
| Pro | $12/mo | Unlimited | 20 GB | Unlimited | No |
| Team | $40/mo | Unlimited | 100 GB | Unlimited | Yes |

### Database (`apps/backend/models/billing_models.py`)

```python
class Subscription(Base):
    __tablename__ = "subscriptions"
    id                       = Column(String, PK, default=uuid4)
    user_id                  = Column(String(255), FK "profiles.id", unique=True)
    stripe_customer_id       = Column(String(255), unique=True)
    stripe_subscription_id   = Column(String(255), nullable=True, unique=True)
    tier                     = Column(String(20), default="free")
    status                   = Column(String(20), default="active")  # active/past_due/canceled
    storage_quota_bytes      = Column(BigInteger, default=2_000_000_000)
    storage_used_bytes       = Column(BigInteger, default=0)
    current_period_end       = Column(DateTime, nullable=True)
    created_at               = Column(DateTime, server_default=func.now())
```

### Storage Quota Tracking

**Add to `apps/backend/services/storage_service.py`** (alongside R2 methods):
```python
def add_usage(user_id: str, delta_bytes: int, db: Session):
    """Atomically increment storage_used_bytes."""
    db.query(Subscription).filter(Subscription.user_id == user_id).update(
        {Subscription.storage_used_bytes: Subscription.storage_used_bytes + delta_bytes}
    )

def check_quota(user_id: str, new_bytes: int, db: Session):
    """Raise HTTP 402 if upload would exceed quota."""
    sub = db.query(Subscription).filter(Subscription.user_id == user_id).first()
    quota = sub.storage_quota_bytes if sub else 2_000_000_000
    used  = sub.storage_used_bytes  if sub else 0
    if used + new_bytes > quota:
        raise HTTPException(status_code=402, detail="storage_limit_exceeded")
```

Call `check_quota()` before: snippet upload, thumbnail upload, avatar upload, stem job creation.
Call `add_usage()` after each successful upload. Call with negative delta on delete.

### API Routes (`apps/backend/routers/billing.py`)

```
POST /billing/checkout         — create Stripe Checkout Session → returns {checkout_url}
POST /billing/portal           — Stripe Customer Portal session (manage/cancel)
POST /billing/webhook          — Stripe webhook (raw body, verified with Stripe-Signature)
GET  /billing/subscription     — current tier, limits, renewal date
GET  /billing/storage          — used_bytes, quota_bytes, percent
```

**Webhook events to handle:**
- `checkout.session.completed` → write new tier to `subscriptions`, update `storage_quota_bytes`
- `customer.subscription.updated` → sync tier
- `customer.subscription.deleted` → downgrade to free
- `invoice.payment_failed` → set `status="past_due"`

**Security:** Verify `stripe.Webhook.construct_event(payload, sig_header, webhook_secret)`. Never trust the webhook payload without this.

**Stripe Checkout:** Use hosted Checkout — no custom payment form. This reduces PCI scope to zero.

### Tier Enforcement (`dependencies.py`)

```python
TIER_RANK = {"free": 0, "pro": 1, "team": 2}

def require_tier(min_tier: str, user_id: str, db: Session):
    sub = db.query(Subscription).filter(Subscription.user_id == user_id).first()
    current = sub.tier if sub else "free"
    if TIER_RANK.get(current, 0) < TIER_RANK[min_tier]:
        raise HTTPException(status_code=403, detail=f"Upgrade to {min_tier} required")
```

Call in: `POST /classrooms` (require "team"), private repo creation beyond free limit.

### Web UI

- `apps/web/app/(dashboard)/settings/billing/page.tsx` — current plan card, usage bar, upgrade/manage buttons
- Upgrade CTAs appear inline on feature-gated flows (e.g., "Create Private Repo" → soft paywall if on free tier)

---

## 12. Plugin Ecosystem

**Priority: Last — needs user base first**

Outbound webhook system so third-party developers can build DAW-specific integrations (Pro Tools, Logic, FL Studio, etc.).

**Architecture:**
- New table `user_webhooks` (`user_id`, `target_url`, `secret`, `events[]` JSON)
- On each incoming Gitea event, fan out to subscribed `user_webhooks` via Redis queue (already present)
- Mirrors GitHub's webhook system

Deferred until SoundHaus has enough users to attract external developers.

---

## 13. Sequencing Summary

Execute in this exact order. Each phase is a prerequisite for the next.

| Phase | What | Timeline |
|--|--|--|
| **0 — Fix bugs** | Issues 1.1–1.6 (access control, is_public sync, N+1 query) | Weeks 1–2 |
| **1 — Infrastructure** | Cloudflare R2 storage, Fly.io hosting | Weeks 2–4 (parallel with Phase 0) |
| **2 — Explore Algorithm** | Score column, background job, no Gitea calls, pagination | Week 3 |
| **3 — Forking + Review** | Fork API, branch protection, contribution review UI | Weeks 3–4 |
| **4 — Audio Changelog** | Desktop dialog, diffTransformer extension, web render | Week 4 |
| **5 — Sample Marketplace** | Listings, Stripe Connect, R2 delivery, seller dashboard | Weeks 5–7 |
| **6 — Billing + Tiers** | Subscriptions table, Stripe Checkout, tier enforcement | Week 7 |
| **7 — Collab Marketplace** | CollabListing, apply flow, web browse UI | Weeks 8–9 |
| **8 — Classroom Mode** | Classroom/Assignment/Submission, grading, template forks | Weeks 9–12 |
| **9 — Plugin Ecosystem** | Outbound webhooks, third-party API | Months 4–6 |

---

## 14. Appendices

### A — Libraries

| Library | Version | Purpose | Used in |
|--|--|--|--|
| `stripe` | `7.x` | Payments + Connect | backend |
| `boto3` | `1.34.x` | Cloudflare R2 (S3-compatible) | backend |
| `wavesurfer.js` | `7.x` | Waveform A/B playback | web |
| `@stripe/stripe-js` | `3.x` | Stripe Checkout redirect | web |

No new libraries are needed for: forking (Gitea API via existing `requests`), branch protection (same), explore algorithm (SQLAlchemy math), audio file detection (Node.js `path` built-in), or review process (Gitea PR API via `requests`).

---

### B — Database Migrations

Store scripts in `apps/backend/scripts/migrations/`. Apply in order.

| Script | Table | Change |
|--|--|--|
| `V001_sync_visibility.sql` | `repo_data` | Data fix — run `sync_repo_visibility.py` |
| `V002_explore_score.sql` | `repo_data` | `ADD explore_score FLOAT DEFAULT 0` |
| `V003_fork.sql` | `repo_data` | `ADD forked_from VARCHAR(255)`, `ADD fork_count INT DEFAULT 0` |
| `V004_contributions.sql` | (new) | `CREATE TABLE contributions` |
| `V005_post_deadline.sql` | `commit_details` | `ADD post_deadline BOOLEAN DEFAULT FALSE` |
| `V006_marketplace.sql` | (new) | `CREATE TABLE marketplace_listings`, `marketplace_purchases` |
| `V007_billing.sql` | (new) | `CREATE TABLE subscriptions`, `ADD stripe_account_id` to `profiles` |
| `V008_collab_market.sql` | (new) | `CREATE TABLE collab_listings`, `collab_applications` |
| `V009_classroom.sql` | (new) | `CREATE TABLE classrooms`, `classroom_members`, `assignments`, `submissions` |

---

### C — Files Changed Per Feature (Quick Reference)

**Private Repo Fix (Phase 0)**
- `apps/backend/dependencies.py` — add `require_repo_access()`
- `apps/backend/routers/commits.py` — add access check to 4 routes
- `apps/backend/routers/snippets.py` — add access check to 4 routes
- `apps/backend/routers/comments.py` — add access check
- `apps/backend/routers/audio.py` — add access check
- `apps/backend/routers/webhooks.py` — add access check to activity + events
- `apps/backend/routers/repos.py` — sync `is_public` in create + settings patch
- `apps/backend/scripts/sync_repo_visibility.py` — NEW

**Storage Migration (Phase 1)**
- `apps/backend/requirements.txt` — add `boto3`
- `apps/backend/config.py` — add R2 settings
- `apps/backend/services/storage_service.py` — NEW
- `apps/backend/services/snippet_service.py` — swap Supabase → StorageService
- `apps/backend/routers/repos.py` — swap thumbnail uploads
- `apps/backend/routers/auth.py` — swap avatar uploads
- `apps/backend/scripts/migrate_to_r2.py` — NEW

**Explore Algorithm (Phase 2)**
- `apps/backend/models/repo_models.py` — add `explore_score`
- `apps/backend/routers/repos.py` — rewrite `get_public_repos()`, add `viewed` route
- `apps/web/app/(dashboard)/repository/[owner]/[repo]/page.tsx` — fire `viewed` on load

**Forking (Phase 3)**
- `apps/backend/models/repo_models.py` — add `forked_from`, `fork_count`
- `apps/backend/services/repo_service.py` — add `fork_repo()`
- `apps/backend/routers/repos.py` — add `POST /repos/{owner}/{repo}/fork`
- `apps/web/app/(dashboard)/repository/[owner]/[repo]/page.tsx` — Fork button
- `apps/web/components/ForkModal.tsx` — NEW

**Review Process (Phase 3)**
- `apps/backend/models/contribution_models.py` — NEW
- `apps/backend/services/repo_service.py` — add `_protect_main_branch()`
- `apps/backend/routers/repos.py` or `contributions.py` — review endpoints
- `apps/backend/routers/webhooks.py` — handle `pull_request` events

**Audio Changelog (Phase 4)**
- `apps/desktop/src/electron/diffTransformer.ts` — add `AudioFileChange`
- `apps/desktop/src/components/AudioFileCommentDialog.tsx` — NEW
- `apps/desktop/src/pages/ProjectPage.tsx` — trigger dialog on push
- `apps/web/components/diff/DiffTimeline.tsx` — render `audioFileChanges`

**Sample Marketplace (Phase 5)**
- `apps/backend/models/marketplace_models.py` — NEW
- `apps/backend/routers/marketplace.py` — NEW
- `apps/backend/services/billing_service.py` — NEW
- `apps/web/app/(dashboard)/marketplace/page.tsx` — NEW
- `apps/web/app/(dashboard)/marketplace/[id]/page.tsx` — NEW
- `apps/web/app/(dashboard)/marketplace/sell/page.tsx` — NEW

**Billing (Phase 6)**
- `apps/backend/models/billing_models.py` — NEW
- `apps/backend/routers/billing.py` — NEW
- `apps/backend/dependencies.py` — add `require_tier()`
- `apps/web/app/(dashboard)/settings/billing/page.tsx` — NEW

---

## 15. CI/CD Pipeline

### Overview

Three-branch model mirroring the three environments. All runs happen in **GitHub Actions** (already available via the repo).

```
main         → production    (auto-deploy gated on all checks passing)
staging      → staging       (auto-deploy on push)
develop      → dev/preview   (test runner only — no auto-deploy)
```

### Workflow Files

Create `.github/workflows/`:

```
.github/workflows/
  backend-ci.yml      — lint + test FastAPI on every push/PR
  web-ci.yml          — type-check + lint + build Next.js on every push/PR
  desktop-ci.yml      — type-check + lint Electron app on every push/PR
  deploy-staging.yml  — push to staging on merge to staging branch
  deploy-prod.yml     — push to production on merge to main (requires manual approval)
```

---

### `backend-ci.yml`

Fires on: push to any branch, PR to `staging` or `main`.

```yaml
name: Backend CI
on:
  push:
    paths: ["apps/backend/**"]
  pull_request:
    paths: ["apps/backend/**"]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: soundhaus
          POSTGRES_PASSWORD: test
          POSTGRES_DB: soundhaus_test
        ports: ["5432:5432"]
        options: --health-cmd pg_isready --health-interval 5s --health-retries 5
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
          cache: "pip"

      - name: Install dependencies
        run: |
          cd apps/backend
          pip install -r requirements.txt
          pip install -r tests/requirements.txt

      - name: Lint (ruff)
        run: cd apps/backend && ruff check .

      - name: Type check (pyright)
        run: cd apps/backend && pyright --pythonpath $(which python)

      - name: Run integration tests
        env:
          DATABASE_URL: postgresql://soundhaus:test@localhost/soundhaus_test
          REDIS_URL: redis://localhost:6379
          SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_KEY }}
          GITEA_BASE_URL: ${{ secrets.TEST_GITEA_BASE_URL }}
          GITEA_ADMIN_TOKEN: ${{ secrets.TEST_GITEA_ADMIN_TOKEN }}
          TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
          TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
          RATE_LIMIT_ENABLED: "false"
        run: cd apps/backend && python tests/run_all.py
```

**Required GitHub Secrets:**
```
TEST_SUPABASE_URL
TEST_SUPABASE_SERVICE_KEY
TEST_GITEA_BASE_URL          # points to staging gitea, not prod
TEST_GITEA_ADMIN_TOKEN
TEST_USER_EMAIL
TEST_USER_PASSWORD
```

---

### `web-ci.yml`

Fires on: push to any branch, PR to `staging` or `main`.

```yaml
name: Web CI
on:
  push:
    paths: ["apps/web/**"]
  pull_request:
    paths: ["apps/web/**"]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: apps/web/package-lock.json

      - run: cd apps/web && npm ci
      - run: cd apps/web && npm run lint
      - run: cd apps/web && npx tsc --noEmit
      - run: cd apps/web && npm run build
        env:
          # stub — CI doesn't hit real API
          FASTAPI_URL: http://localhost:8000
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}
```

---

### `desktop-ci.yml`

Fires on: push to any branch, PR to `staging` or `main`.

```yaml
name: Desktop CI
on:
  push:
    paths: ["apps/desktop/**"]
  pull_request:
    paths: ["apps/desktop/**"]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: apps/desktop/package-lock.json
      - run: cd apps/desktop && npm ci
      - run: cd apps/desktop && npx tsc --noEmit -p tsconfig.app.json
      - run: cd apps/desktop && npx tsc --noEmit -p tsconfig-electron.json
      - run: cd apps/desktop && npm run lint
```

For desktop releases (builds `.dmg`, `.exe`, `.AppImage`), a separate `release.yml` workflow triggers on version tags (`v*.*.*`) and runs `electron-forge make` on a matrix of `[macos-latest, windows-latest, ubuntu-latest]`.

---

### `deploy-staging.yml`

Fires on: merge to `staging` branch. No manual approval required.

```yaml
name: Deploy Staging
on:
  push:
    branches: [staging]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to DO staging
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_HOST }}
          username: ${{ secrets.STAGING_SSH_USER }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          script: |
            cd /opt/soundhaus-staging
            git pull origin staging
            bash compose.sh remote up -d --build fastapi worker

  deploy-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyio-actions/setup-flyctl@master
      - run: cd apps/web && flyctl deploy --app soundhaus-web-staging
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_STAGING_TOKEN }}
```

---

### `deploy-prod.yml`

Fires on: merge to `main`. Requires **manual approval** via GitHub environment protection rules (configure in repo Settings → Environments → `production` → require reviewer).

```yaml
name: Deploy Production
on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    environment: production        # ← triggers the manual approval gate
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to DO production
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ${{ secrets.PROD_SSH_USER }}
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            cd /opt/soundhaus
            git pull origin main
            bash compose.sh remote up -d --build fastapi worker

  deploy-web:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyio-actions/setup-flyctl@master
      - run: cd apps/web && flyctl deploy --app soundhaus-web
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_PROD_TOKEN }}
```

---

## 16. Testing Suite

### Backend Tests

The existing `tests/` layout (`auth/`, `gitea/`, `supabase/`) is integration-test-only. Expand it with unit tests for services.

**Add to `apps/backend/tests/`:**
```
tests/
  unit/
    test_repo_service.py          — fork_repo(), _protect_main_branch(), explore score math
    test_storage_service.py       — mock boto3 calls
    test_billing_service.py       — quota check, tier enforcement
    test_marketplace_service.py   — listing create, Stripe PaymentIntent mock
    test_auth_service.py          — token verification, resolve_owner_id edge cases
  integration/
    auth/           (existing)
    gitea/          (existing)
    supabase/       (existing)
    marketplace/    (NEW)
      test_listings.py
      test_checkout.py           — use Stripe test mode keys
    classroom/      (NEW)
      test_classrooms.py
      test_assignments.py
      test_submissions.py
    billing/        (NEW)
      test_tiers.py
      test_webhooks.py           — replay Stripe webhook payloads
  conftest.py        (NEW) — shared fixtures: db session, mock Gitea, mock Stripe, mock R2
  requirements.txt   (update) — add pytest, pytest-asyncio, httpx, respx, moto[s3]
```

**New `conftest.py` fixtures:**
```python
@pytest.fixture
def mock_gitea(respx_mock):
    """Intercept all Gitea HTTP calls — tests never hit real Gitea."""
    respx_mock.get(re.compile(r"/api/v1/repos/.*")).mock(return_value=Response(200, json={"private": False}))
    yield respx_mock

@pytest.fixture
def mock_r2(monkeypatch):
    """Use moto to simulate S3/R2 in memory."""
    with mock_aws():
        import boto3
        boto3.client("s3", region_name="auto").create_bucket(Bucket="soundhaus-media")
        yield

@pytest.fixture
def mock_stripe(monkeypatch):
    """Patch stripe.PaymentIntent.create to return fixture data."""
    monkeypatch.setattr("stripe.PaymentIntent.create", lambda **kw: {"id": "pi_test", "client_secret": "pi_test_secret"})
    yield
```

**Run unit tests only (fast — no network):**
```bash
cd apps/backend && pytest tests/unit/ -v
```

**Run full suite:**
```bash
cd apps/backend && python tests/run_all.py
```

---

### Web Tests

Add to `apps/web/`:
```
__tests__/
  components/
    DiffTimeline.test.tsx        — snapshot + interaction tests
    CloneModal.test.tsx
    ForkModal.test.tsx
  app/
    marketplace.test.tsx
    classroom.test.tsx
  lib/
    utils.test.ts
```

**Tooling:** Vitest (already compatible with Vite) + React Testing Library + MSW (Mock Service Worker) for API mocking. Do not use Jest — Vitest is the correct choice for Next.js + Vite setups.

**Install:**
```bash
cd apps/web && npm install -D vitest @vitest/ui @testing-library/react @testing-library/user-event msw
```

**`apps/web/vitest.config.ts`:**
```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

**Run:**
```bash
cd apps/web && npx vitest run         # CI
cd apps/web && npx vitest             # watch mode
```

---

### Desktop Tests

**Electron renderer (React):** Same Vitest + RTL setup as web. Share `vitest.config.ts`.

**IPC handlers:** Test in Node environment without Electron. Each handler in `src/electron/` should export its logic as a testable function, injecting the full Electron `app` only at registration time.

**End-to-end:** Use Playwright's Electron driver (`@playwright/test` with `_electron` import) for smoke tests of critical flows:
- Login → see repo list
- Open project → see changelog
- Clone repo
- Push commit → confirm webhook fires

---

## 17. Environments

### Environment Matrix

| Property | Dev | Staging | Production |
|--|--|--|--|
| Branch | `develop` | `staging` | `main` |
| Backend URL | `localhost:8000` | `https://api-staging.thesound.haus` | `https://api.thesound.haus` |
| Web URL | `localhost:3000` | `https://staging.thesound.haus` | `https://thesound.haus` |
| Gitea URL | `localhost:3001` | `https://git-staging.thesound.haus` | `https://git.thesound.haus` |
| Database | Local Postgres or Supabase dev project | Separate Supabase staging project | Supabase production project |
| Storage | Local Docker MinIO (R2-compatible) | Cloudflare R2 staging bucket | Cloudflare R2 production bucket |
| Stripe | Test mode keys | Test mode keys | Live mode keys |
| Rate limiting | Off | Off | On |
| Log level | DEBUG | INFO | WARNING |

---

### Dev Environment Setup

**Backend (one-time):**
```bash
cd apps/backend
cp .env.example .env.local
# Fill in: SUPABASE_URL, SUPABASE_SERVICE_KEY (dev project), GITEA_BASE_URL=http://localhost:3001
pip install -r requirements.txt
pip install -r tests/requirements.txt
uvicorn main:app --reload
```

**MinIO (local R2 substitute) — add to `docker-compose.yml`:**
```yaml
minio:
  image: minio/minio
  ports:
    - "9000:9000"
    - "9001:9001"          # Web console
  environment:
    MINIO_ROOT_USER: soundhaus
    MINIO_ROOT_PASSWORD: soundhaus123
  command: server /data --console-address ":9001"
  volumes:
    - minio_data:/data
```

Then set `R2_ENDPOINT=http://localhost:9000` in `.env.local`. MinIO is fully S3-compatible, so `boto3` works with zero changes.

**Environment files convention:**
```
apps/backend/
  .env.local     — dev secrets (never commit)
  .env.staging   — staging secrets (never commit, stored in CI secrets)
  .env.remote    — production secrets (never commit, stored in CI secrets)
  .env.example   — all keys with blank values (commit this)
```

---

### Staging Environment

- Separate DO Droplet (`soundhaus-staging`) — same size as prod but never both down at the same time
- Separate Supabase project (`soundhaus-staging`)
- Separate Cloudflare R2 bucket (`soundhaus-media-staging`)
- Separate Gitea instance or Gitea organization (`staging-*` users)
- Stripe test mode — use Stripe's built-in test card numbers
- Deploys automatically on every merge to `staging` branch

**Maintenance:** Staging DB schema should always match production. After each DB migration, apply it to staging first, run integration tests, then promote to prod.

---

### Production Environment

- Secrets stored in GitHub Actions environment `production` (not accessible to other workflows)
- Manual approval gate before deploy (see `deploy-prod.yml`)
- Database migrations run **before** code deploy:
  ```bash
  # In deploy script, before compose up:
  cd apps/backend && python scripts/run_migrations.py
  ```
- Post-deploy smoke test: `curl https://api.thesound.haus/health` — fail deployment if not 200

---

### `apps/backend/scripts/run_migrations.py`

A lightweight migration runner that executes SQL files from `scripts/migrations/` in order, tracking applied migrations in a `schema_migrations` table. Do not use Alembic — the existing codebase uses raw SQLAlchemy, and adding Alembic requires model registration that would touch every model file.

```python
"""
Run pending SQL migrations from scripts/migrations/*.sql
Tracks applied migrations in schema_migrations table.
"""
import os, psycopg2
from config import settings

MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "migrations")

def run():
    conn = psycopg2.connect(settings.database_url)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            filename TEXT PRIMARY KEY,
            applied_at TIMESTAMP DEFAULT NOW()
        )
    """)
    conn.commit()
    applied = {r[0] for r in cur.execute("SELECT filename FROM schema_migrations").fetchall()}
    for fname in sorted(os.listdir(MIGRATIONS_DIR)):
        if not fname.endswith(".sql") or fname in applied:
            continue
        print(f"Applying {fname}...")
        with open(os.path.join(MIGRATIONS_DIR, fname)) as f:
            cur.execute(f.read())
        cur.execute("INSERT INTO schema_migrations (filename) VALUES (%s)", (fname,))
        conn.commit()
        print(f"  ✓ {fname}")
    conn.close()

if __name__ == "__main__":
    run()
```

---

## 18. Infrastructure Tiers & Services

Recommendations are based on the current DO + Supabase + Vercel stack and what SoundHaus will need at each growth stage.

---

### Tier 0 — Current (0–500 users) — ~$80/mo

This is essentially what you have now. Fine for development and early beta.

| Service | Tier | Cost | Notes |
|--|--|--|--|
| Digital Ocean Droplet | Basic 2 vCPU / 4 GB RAM | $24/mo | FastAPI + Gitea + Redis on one droplet |
| Supabase | Free | $0 | 500 MB DB, 1 GB storage — migrate storage to R2 ASAP |
| Vercel | Hobby | $0 | Fine, but move to Fly.io before launch |
| Cloudflare R2 | Free | $0 | 10 GB/mo free, no egress ever |
| Cloudflare (DNS + CDN) | Free | $0 | DDoS protection, CDN for R2 public assets |
| GitHub | Free | $0 | Actions CI/CD (2,000 min/mo free) |
| Stripe | No monthly fee | 2.9% + 30¢/txn | Standard — no commitment |

---

### Tier 1 — Early Launch (500–5,000 users) — ~$200/mo

Separate the droplet, add observability, upgrade Supabase.

| Service | Tier | Cost | Notes |
|--|--|--|--|
| Digital Ocean Droplet (FastAPI + redis) | General Purpose 2 vCPU / 8 GB | $48/mo | FastAPI + worker + redis |
| Digital Ocean Droplet (Gitea) | Basic 2 vCPU / 4 GB | $24/mo | Gitea gets its own droplet |
| Supabase | Pro ($25/mo) | $25/mo | 8 GB DB, no storage cap (you're on R2), daily backups, SLA |
| Fly.io (web) | Pay-as-you-go | ~$10–20/mo | 2 × shared-cpu-1x@256MB, auto-pause |
| Cloudflare R2 | Pay-as-you-go | ~$5–15/mo | $0.015/GB storage, $0 egress |
| Cloudflare Pro | $20/mo | $20/mo | WAF, advanced rate limiting, analytics |
| Sentry | Team ($26/mo) | $26/mo | Error tracking for FastAPI + Next.js + Electron |
| Uptime Robot | Free | $0 | Ping prod endpoints every 5 min |
| Stripe | Standard | 2.9% + 30¢/txn | Revenue share on marketplace included via Connect |

**Do not use Kubernetes here.** It adds operational complexity with no benefit at this scale. Docker Compose on dedicated droplets is simpler and cheaper.

---

### Tier 2 — Growth (5,000–50,000 users) — ~$600–900/mo

This is where you consider managed services, not self-hosted anything.

| Service | Tier | Cost | Notes |
|--|--|--|--|
| Digital Ocean Managed Kubernetes (DOKS) | 3 × standard-4 nodes (2 vCPU / 4 GB each) | ~$150/mo | FastAPI pods: 2 replicas + worker pods: 2 replicas |
| Digital Ocean Managed Database (Postgres) | 2 vCPU / 4 GB | $60/mo | If you move off Supabase; keep Supabase longer if team is small |
| Supabase (or DOKS DB) | Pro | $25/mo | Pro handles 50K users comfortably — upgrade to Team at 50K |
| Digital Ocean Managed Redis | 1 GB | $15/mo | Move Redis off the app droplet |
| Fly.io (web) | Pay-as-you-go | ~$30–50/mo | Scale to 4 machines |
| Cloudflare R2 | Pay-as-you-go | ~$30–60/mo | Audio files grow fast |
| Cloudflare Pro | $20/mo | $20/mo | Keep WAF |
| Sentry | Business | $80/mo | More seats, performance monitoring |
| GitHub Actions | Team ($4/user/mo) | ~$20/mo | Faster runners |
| Stripe | Standard | 2.9% + 30¢/txn | Negotiate custom pricing at $50K+ MRR |

**Why DOKS over AWS EKS:**
- Less vendor lock-in for small team
- DOKS clusters are $12/node/mo cheaper than equivalent EKS
- Everything already on DO — no cross-cloud egress fees
- If you need to migrate to AWS later, the Docker images and Kubernetes manifests are portable

**If you eventually move to AWS (>100K users):**
| Service | AWS Equivalent | Reason |
|--|--|--|
| DO Droplets | EC2 (t3.medium) | ~Same cost, more ecosystem |
| DO Kubernetes | EKS (with Fargate) | Managed K8s, serverless pods |
| DO Managed Postgres | RDS PostgreSQL (db.t3.medium) | Multi-AZ, automated failover |
| Cloudflare R2 | S3 + CloudFront (egress ~$87/TB) | **R2 is better for audio — stay on R2** |
| Supabase Auth | Cognito or Auth0 | Only migrate if Supabase is a bottleneck |

---

### Services to Avoid

| Service | Avoid Because |
|--|--|
| **AWS S3 + CloudFront** | $0.09/GB egress — catastrophic for audio streaming. Stay on Cloudflare R2. |
| **Vercel (long-term)** | Per-function billing, no long-running connections, expensive at scale. Move to Fly.io. |
| **Heroku** | 2–3x overpriced vs DO/Fly for the same resources |
| **PlanetScale** | Branches are neat but MySQL-only. Postgres is non-negotiable for Supabase compatibility. |
| **Kubernetes before Tier 2** | K8s with <5,000 users is operational overhead with no benefit. Docker Compose is the right choice. |
| **Self-hosted Stripe** | Never. PCI compliance is not worth it. Always use Stripe hosted Checkout. |
| **Elasticsearch** | Postgres full-text search handles SoundHaus querying at Tier 0–2. Save $50–100/mo. |

---

### Observability Stack (add at Tier 1, free or near-free)

| Tool | Purpose | Cost |
|--|--|--|
| **Sentry** | Exception + performance monitoring for backend, web, desktop | $26/mo (Team) |
| **Uptime Robot** | Uptime checks on `/health`, Gitea, and R2 public URL | Free |
| **Grafana Cloud** | Metrics from FastAPI (via `prometheus-fastapi-instrumentator`) + DO droplet metrics | Free up to 10K metrics |
| **Loki (via Grafana)** | Log aggregation — ship Docker logs via Promtail | Free tier covers Tier 0–1 |
| **Cloudflare Analytics** | Traffic, bot, DDoS detection, R2 request analytics | Included with Cloudflare |

**Setup for Grafana/Prometheus in FastAPI:**
```bash
pip install prometheus-fastapi-instrumentator
```
```python
# main.py — add after app creation
from prometheus_fastapi_instrumentator import Instrumentator
Instrumentator().instrument(app).expose(app)
```
Point Grafana Cloud's Prometheus scrape config at `https://api.thesound.haus/metrics`.

---

### GitHub Actions Cost

At Tier 0 (free plan), GitHub gives 2,000 minutes/month. Each CI run is roughly:
- Backend CI: ~3 min
- Web CI: ~2 min
- Desktop CI: ~1 min

At 10 pushes/day × 5 min avg = 1,500 min/mo. Fine on free. Once you hit Tier 1 with multiple devs, upgrade to GitHub Team ($4/user/mo) for 3,000 min/mo and spend-limit controls.

---

### Summary — Spend by Stage

| Stage | Users | Monthly Infra Cost | Key Additions |
|--|--|--|--|
| Tier 0 (now) | 0–500 | ~$50–80/mo | Fix R2 + Fly.io migration |
| Tier 1 (launch) | 500–5K | ~$180–240/mo | Split droplets, Supabase Pro, Sentry, Cloudflare Pro |
| Tier 2 (growth) | 5K–50K | ~$600–900/mo | DOKS, managed Redis, managed Postgres |
| Tier 3 (scale) | 50K+ | $2,000+/mo | Evaluate AWS, CDN tuning, Stripe custom pricing |
