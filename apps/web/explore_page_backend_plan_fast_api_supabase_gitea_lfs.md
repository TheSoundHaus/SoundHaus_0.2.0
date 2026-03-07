# Explore Page Backend Plan

**Scope:** Discovery-only Explore page for music projects. Uses **FastAPI**, **Supabase/Postgres**, **Redis**, and **Gitea (Git LFS)**. No project detail pages, no stems, no editing flows.

---

## 1. What the Explore Page Does

Explore returns **project cards** only:
- Title, artist, cover
- Tags (small set)
- BPM / key (optional)
- Lightweight engagement stats
- **Playable 30–60s preview** (derived asset)
- Cursor-based pagination (lazy loading)

Explore does **not** return:
- Full descriptions
- Repo metadata
- Stems or full mixes
- Comments or collaboration data

---

## 2. Architecture Overview

**Postgres (Supabase)**
- Source of truth for projects, assets, tags, and scores
- Indexed for fast list queries

**Redis**
- Caching Explore lists and project cards
- Queues for background jobs (preview generation, scoring)

**FastAPI**
- Explore API
- Media proxy for Git LFS previews
- Auth + permission enforcement

**Gitea (Git LFS)**
- Stores raw audio + derived preview files
- Accessed server-side only

---

## 3. Postgres Data Model (Explore-only)

### 3.1 `projects`
Fields required for Explore:
- `id uuid pk`
- `owner_id uuid`
- `title text`
- `description text`
- `visibility enum('public','unlisted','private')`
- `status enum('draft','published','archived')`
- `published_at timestamptz`
- `cover_asset_id uuid null`
- `primary_preview_asset_id uuid null`
- `bpm int null`
- `key text null`
- `duration_sec int null`

**Indexes**
- `(status, visibility, published_at desc, id desc)`
- `(owner_id, published_at desc)`

---

### 3.2 `project_tags`
- `project_id uuid`
- `tag text`

**Index**
- `(tag, project_id)`

---

### 3.3 `assets` (Git LFS pointers)
Represents both source and derived files.

- `id uuid pk`
- `project_id uuid`
- `kind enum('mix','stem','preview','cover','waveform')`
- `gitea_owner text`
- `gitea_repo text`
- `git_ref text` (commit SHA recommended)
- `repo_path text`
- `lfs_oid text null`
- `bytes bigint null`
- `content_type text null`
- `created_at timestamptz`
- `derived_from_asset_id uuid null`

**Indexes**
- `(project_id, kind)`
- `(kind, created_at desc)`

---

### 3.4 `project_scores` (materialized ordering)
Used for trending queries.

- `project_id uuid pk`
- `score_24h double precision`
- `score_7d double precision`
- `updated_at timestamptz`

**Index**
- `(score_24h desc)`

---

## 4. Explore API (FastAPI)

### 4.1 Main endpoint
`GET /explore`

**Query params**
- `mode`: `newest | trending`
- `tag` (optional)
- `q` (optional search)
- `limit` (default 20, max 50)
- `cursor` (opaque)

**Response**
```json
{
  "items": [
    {
      "id": "uuid",
      "title": "Project",
      "owner": {"id": "uuid", "handle": "artist"},
      "cover_url": "signed-url",
      "preview_url": "signed-url",
      "tags": ["house"],
      "bpm": 128,
      "key": "Am",
      "duration_sec": 45,
      "stats": {"plays_24h": 120},
      "published_at": "timestamp"
    }
  ],
  "next_cursor": "opaque"
}
```

---

### 4.2 Cursor Pagination

**Newest**
- Ordered by `(published_at desc, id desc)`
- Cursor stores `(published_at, id)`

**Trending**
- Ordered by `(score_24h desc, project_id desc)`
- Cursor stores `(score_24h, project_id)`

Cursors are base64-encoded JSON.

---

## 5. Query Strategy (Performance)

1. Query Postgres for **project IDs only**
2. Fetch project card payloads from Redis cache
3. Hydrate missing cards from Postgres and cache them

This avoids heavy joins on every request.

---

## 6. Redis Caching Strategy

### 6.1 Explore list cache
Key:
- `explore:list:{mode}:{tag}:{qhash}:{cursor}:{limit}`

TTL:
- newest: 10–30s
- trending: 30–90s

---

### 6.2 Project card cache
Key:
- `explore:card:{project_id}`

TTL:
- 5–30 minutes

Does **not** include signed URLs.

---

### 6.3 Stampede protection
- Use Redis locks: `SET lock:{key} NX PX 1500`

---

## 7. Git LFS Media Serving (Previews Only)

**Rule:** Explore serves **derived preview assets only**.

### 7.1 Proxy streaming approach (recommended MVP)

`GET /media/preview/{asset_id}?token=...`

- Token is short-lived (HMAC/JWT)
- FastAPI fetches file from Gitea (LFS resolved server-side)
- Supports `Range` requests for scrubbing

Gitea tokens are **never** exposed to clients.

---

## 8. Background Jobs (Redis Queues)

Triggered on project publish:

1. **Generate preview** (required)
   - 30–60s AAC/MP3
   - Normalized

2. **Generate cover thumbnail** (optional)

3. **Extract metadata** (optional)
   - duration, BPM, key

4. **Update trending scores** (periodic)

Queue names:
- `q:derive_preview`
- `q:derive_cover`
- `q:extract_meta`
- `q:update_scores`

---

## 9. Trending Score (Simple & Effective)

- Aggregate plays/likes/saves in Redis or lightweight stats table
- Periodically compute:

```
score = plays * 1 + likes * 3 + saves * 4 + shares * 6
```

- Apply time decay
- Write result into `project_scores`

Explore queries never compute scores live.

---

## 10. Publish Flow (Explore-safe)

1. Project marked `published`
2. Project appears immediately in Explore
3. Preview job runs asynchronously
4. `primary_preview_asset_id` updated when ready
5. Explore cache invalidated

Preview may be temporarily `null`.

---

## 11. MVP Defaults

- Preview length: **45s**
- Preview format: **AAC or MP3 (~128kbps)**
- Cover size: **512×512**
- Explore page size: **20**
- Signed media TTL: **60s**
- Newest cache TTL: **15s**
- Trending cache TTL: **60s**

---

## 12. Implementation Order

1. `/explore?mode=newest`
2. Cursor pagination
3. Redis list + card caching
4. Preview proxy endpoint
5. Publish → preview job
6. Trending scores + `/explore?mode=trending`

---

**Result:** A fast, scalable Explore page that feels production-grade without overengineering.

