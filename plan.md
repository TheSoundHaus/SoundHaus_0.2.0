# SoundHaus Implementation Plan
> **Replaces:** `plan-soundHausMvp30Day.prompt.md` (that file can be deleted — it's the old 30-day overview)
> **Last updated:** March 2026
> This plan covers the feature build-out across backend models, webhooks, diff upload, snippet versioning, and the web repo page.
> Scaffolded files have been created — your job is to fill in the `TODO: implement` stubs.

---

## Quick Reference — Scaffolded Files

| File | Status | Your task |
|------|--------|-----------|
| `apps/backend/models/commit_models.py` | ✅ Created | No changes needed — it's complete |
| `apps/backend/models/diff_models.py` | ✅ Created | Decide Design Decision C (commit FK vs SHA) |
| `apps/backend/models/snippet_models.py` | ✅ Created | Decide Design Decision A (retention policy) |
| `apps/backend/models/repo_models.py` | ✅ Edited | New columns + relationships added |
| `apps/backend/routers/commits.py` | ✅ Created | Fill in all 4 `raise NotImplementedError` stubs |
| `apps/backend/services/webhook_service.py` | ✅ Edited | Fill in two `# TODO` blocks |
| `apps/backend/services/snippet_service.py` | ✅ Edited | Fill in `_get_next_version_number` + `_snapshot_existing_snippet` |
| `apps/web/lib/api/commits.ts` | ✅ Created | Uncomment the `authFetch` calls in each function |
| `apps/desktop/src/services/gitService.ts` | ✅ Edited | Fill in `pushAndDiff` IPC calls (Step 2 & 3 TODOs) |
| `apps/web/app/(dashboard)/repository/[id]/page.tsx` | ✅ Rewritten | Wire up API calls, replace TODO comments |

---

## Phase 0 — Decisions to Make Before Writing Code

Go through each scaffolded file's "DESIGN DECISION" sections and pick an option.
Do this first — the implementation depends on these choices.

- [ ] `commit_models.py` — **Decision A**: JSON columns (simple) vs normalized `commit_file_changes` table? **Recommendation:** JSON for MVP.
- [ ] `commit_models.py` — **Decision B**: `push_event_id` nullable or not? **Recommendation:** `nullable=False` for MVP.
- [ ] `diff_models.py` — **Decision A**: One table with `diff_type` discriminator vs two separate tables? **Recommendation:** One table.
- [ ] `diff_models.py` — **Decision B**: Two rows per push (one per system) vs single combined row? **Recommendation:** Single combined row for MVP.
- [ ] `diff_models.py` — **Decision C**: `commit_sha` String vs FK to `commit_details.id`? **Recommendation:** String (loose coupling) for now.
- [ ] `snippet_models.py` — **Decision A**: Keep versioned files forever vs delete after N versions? **Recommendation:** Keep forever (1 GB Supabase free tier).
- [ ] `snippet_models.py` — **Decision B**: Per-repo version numbering (1, 2, 3 per repo) vs global? **Recommendation:** Per-repo.
- [ ] `commits.py` router — **Pagination decision**: Offset-based (`page=1&limit=20`) vs cursor-based? **Recommendation:** Offset for MVP.
- [ ] `commits.py` router — **Short SHA decision**: Accept short (8 char) SHAs? If so, how to handle ambiguity? **Recommendation:** Accept short, reject 400 if multiple matches.
- [ ] `page.tsx` — **URL encoding decision**: How is `id` encoded in `/repository/[id]`? Matches `${owner}__${repoSlug}` or is it a separate numeric ID? Must align with how explore/list pages build the link.

---

## Phase 1 — Database Migrations

The new models need to be registered with SQLAlchemy's `Base.metadata` and migrated to Postgres.

### Step 1.1 — Import new models in `main.py`

**File:** `apps/backend/main.py`

Add imports after the existing router imports. SQLAlchemy's `create_all` only creates tables for models that have been imported somewhere in the process.

```python
# Add after existing model imports (or after router imports — anywhere before init_db)
from models.commit_models import CommitDetail      # noqa: F401
from models.diff_models import AlsDiff             # noqa: F401
from models.snippet_models import SnippetHistory   # noqa: F401
```

- [ ] Add the three import lines to `apps/backend/main.py` (after the router imports block, before `init_db` is called)

### Step 1.2 — Also import in the webhook_service (for runtime use)

**File:** `apps/backend/services/webhook_service.py`

Add to the imports at the top of the file (around line 97, after the existing model imports):

```python
from models.commit_models import CommitDetail  # for _handle_push Phase 2
```

- [ ] Add `CommitDetail` import to `apps/backend/services/webhook_service.py`

### Step 1.3 — Add `Boolean` to repo_models imports

**File:** `apps/backend/models/repo_models.py`

`Boolean` was added to the Column import line already via the scaffold edit.

- [x] Already done by scaffold — verify `Boolean` is in the import at line 1

### Step 1.4 — Run migration

The backend uses a `Base.metadata.create_all` approach (not Alembic migrations).

**If using `create_all` (auto-creates missing tables):**
```bash
# In Docker, the init happens in main.py via init_db()
# Just restart the backend container:
docker compose restart backend
```

**If adding Alembic (recommended for production):**
```bash
cd apps/backend
alembic revision --autogenerate -m "add_commit_diff_snippet_history_tables"
alembic upgrade head
```

- [ ] Restart the backend and verify the three new tables appear in your database (Supabase Table Editor or `psql`)
- [ ] Check that `repo_data` now has `needs_update` (boolean) and `last_push_commit_sha` (varchar) columns

### Step 1.5 — Register `commits` router in `main.py`

**File:** `apps/backend/main.py`

```python
# Add to the routers import block at the top
from routers import (
    health,
    auth,
    repos,
    collaborators,
    desktop,
    genres,
    snippets,
    webhooks,
    commits,  # ← ADD THIS
)
```

Then add the include call in the router mounting section:
```python
app.include_router(commits.router, prefix="/api")
```

- [ ] Add `commits` to the router import block
- [ ] Add `app.include_router(commits.router, prefix="/api")` line
- [ ] Test: `GET http://localhost:8000/api/repos/test/test/commits` should return a 500 (NotImplementedError) not 404 — confirms the route registered

---

## Phase 2 — Webhook Enhancement (`_handle_push`)

**File:** `apps/backend/services/webhook_service.py`

Find the two `# TODO` comment blocks that were added by the scaffold (search for `# ── TODO: Create CommitDetail rows` and `# ── TODO: Set needs_update flag`).

### Step 2.1 — Add `CommitDetail` creation loop

After `db.add(push_event)`, add `db.flush()` and the commit detail loop.

The exact location is the `# ── TODO: Create CommitDetail rows (Phase 2 implementation)` block.

```python
# Replace the TODO comment block with:
db.flush()  # populate push_event.id before FK reference

for commit in commits:
    cd = CommitDetail(
        push_event_id=push_event.id,
        repo_id=repo_full_name,
        sha=commit["id"],
        short_sha=commit["id"][:8],
        message=commit.get("message", ""),
        author_name=commit.get("author", {}).get("name", "unknown"),
        author_email=commit.get("author", {}).get("email"),
        timestamp=commit.get("timestamp"),
        files_added=commit.get("added", []),
        files_modified=commit.get("modified", []),
        files_removed=commit.get("removed", []),
    )
    db.add(cd)
```

- [ ] Replace the `# ── TODO: Create CommitDetail rows` block with the loop above
- [ ] Confirm `CommitDetail` is imported at the top of the file (Step 1.2)

### Step 2.2 — Set `needs_update` and `last_push_commit_sha`

In the same `_handle_push` method, find the `# ── TODO: Set needs_update flag` block and replace with:

```python
repo_data.needs_update = True
repo_data.last_push_commit_sha = after_sha
```

- [ ] Replace the `# ── TODO: Set needs_update flag` block with the two assignments above

### Step 2.3 — Test the webhook

- [ ] Trigger a test push from the Desktop (or simulate via `curl` POST to `/api/webhooks/gitea`)
- [ ] Verify `commit_details` table has new rows after the push
- [ ] Verify `repo_data.needs_update = true` and `repo_data.last_push_commit_sha` is set

---

## Phase 3 — Implement Commit Router Endpoints

**File:** `apps/backend/routers/commits.py`

Fill in the four `raise NotImplementedError` stubs. Tackle them in this order.

### Step 3.1 — `GET /repos/{owner}/{repo}/commits` (list)

```python
async def get_commit_list(request, owner, repo, page, limit, db):
    repo_id = f"{owner}/{repo}"

    # Check repo exists
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    if not repo_data:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Count total
    total = db.query(CommitDetail).filter(CommitDetail.repo_id == repo_id).count()

    # Fetch page
    offset = (page - 1) * limit
    commits = (
        db.query(CommitDetail)
        .filter(CommitDetail.repo_id == repo_id)
        .order_by(desc(CommitDetail.timestamp))
        .offset(offset)
        .limit(limit)
        .all()
    )

    # Check which commits have diffs
    diff_shas = set(
        row.commit_sha
        for row in db.query(AlsDiff.commit_sha).filter(AlsDiff.repo_id == repo_id).all()
    )

    return {
        "success": True,
        "repo": repo_id,
        "page": page,
        "limit": limit,
        "total": total,
        "commits": [
            {
                "id": c.id,
                "sha": c.sha,
                "short_sha": c.short_sha,
                "message": c.message,
                "author_name": c.author_name,
                "author_email": c.author_email,
                "timestamp": c.timestamp.isoformat() if c.timestamp else None,
                "files_added": c.files_added or [],
                "files_modified": c.files_modified or [],
                "files_removed": c.files_removed or [],
                "has_diff": c.sha in diff_shas,
            }
            for c in commits
        ],
    }
```

- [ ] Add `from sqlalchemy import desc` to imports in commits.py
- [ ] Implement `get_commit_list` replacing the `raise NotImplementedError`

### Step 3.2 — `GET /repos/{owner}/{repo}/commits/{sha}` (single)

Similar to the list, but filter by SHA or short SHA. Return 404 if not found.

```python
# Within get_commit_detail:
repo_id = f"{owner}/{repo}"
query = db.query(CommitDetail).filter(CommitDetail.repo_id == repo_id)

if len(sha) == 40:
    commit = query.filter(CommitDetail.sha == sha).first()
else:
    matches = query.filter(CommitDetail.sha.startswith(sha)).all()
    if len(matches) == 0:
        raise HTTPException(status_code=404, detail="Commit not found")
    if len(matches) > 1:
        raise HTTPException(status_code=400, detail=f"Ambiguous short SHA: {len(matches)} matches")
    commit = matches[0]

has_diff = db.query(AlsDiff).filter(
    AlsDiff.repo_id == repo_id, AlsDiff.commit_sha == commit.sha
).first() is not None

return {"success": True, "commit": {..., "has_diff": has_diff}}
```

- [ ] Implement `get_commit_detail`

### Step 3.3 — `POST /repos/{owner}/{repo}/diff` (Desktop posts diff)

```python
# Within post_als_diff:
if not token.startswith("soundh_"):
    raise HTTPException(status_code=403, detail="Desktop PAT required")

body = await request.json()
repo_id = f"{owner}/{repo}"

# Validate required fields
commit_sha = body.get("commit_sha")
diff_data = body.get("diff_data")
if not commit_sha or diff_data is None:
    raise HTTPException(status_code=422, detail="commit_sha and diff_data are required")

# Upsert AlsDiff row (idempotent for retries)
existing = db.query(AlsDiff).filter(
    AlsDiff.repo_id == repo_id, AlsDiff.commit_sha == commit_sha
).first()

if existing:
    existing.diff_data = diff_data
    existing.diff_summary = body.get("diff_summary")
    diff_id = existing.id
else:
    new_diff = AlsDiff(
        repo_id=repo_id,
        commit_sha=commit_sha,
        before_sha=body.get("before_sha"),
        diff_type=body.get("diff_type", "combined"),
        diff_summary=body.get("diff_summary"),
        diff_data=diff_data,
        desktop_version=body.get("desktop_version"),
    )
    db.add(new_diff)
    db.flush()
    diff_id = new_diff.id

# Clear needs_update flag
repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
if repo_data:
    repo_data.needs_update = False

db.commit()
return {"success": True, "diff_id": diff_id}
```

- [ ] Implement `post_als_diff`

### Step 3.4 — `GET /repos/{owner}/{repo}/commits/{sha}/diff`

```python
repo_id = f"{owner}/{repo}"
diff = db.query(AlsDiff).filter(
    AlsDiff.repo_id == repo_id
).filter(
    AlsDiff.commit_sha.startswith(sha)   # support short SHAs
).first()

if not diff:
    return {"success": False, "error": "No ALS diff found for this commit"}

return {
    "success": True,
    "diff": {
        "id": diff.id,
        "commit_sha": diff.commit_sha,
        "before_sha": diff.before_sha,
        "diff_type": diff.diff_type,
        "diff_summary": diff.diff_summary,
        "diff_data": diff.diff_data,
        "created_at": diff.created_at.isoformat(),
    }
}
```

- [ ] Implement `get_commit_diff`
- [ ] Test all four endpoints with `curl` or the Swagger UI at `http://localhost:8000/docs`

---

## Phase 4 — Snippet Versioning

### Step 4.1 — Implement `_get_next_version_number` in `snippet_service.py`

**File:** `apps/backend/services/snippet_service.py`

Replace the `raise NotImplementedError` in `_get_next_version_number`:

```python
from models.snippet_models import SnippetHistory
from sqlalchemy import func

result = db.query(func.max(SnippetHistory.version_number)).filter(
    SnippetHistory.repo_id == repo_id
).scalar()
return (result or 0) + 1
```

- [ ] Implement `_get_next_version_number`

### Step 4.2 — Implement `_snapshot_existing_snippet` in `snippet_service.py`

This is the more complex one. See the detailed docstring in the scaffolded method — it has the complete step-by-step algorithm.

Key things to figure out:
1. Parsing the extension from `current_metadata["format"]` (e.g., "mp3" → ".mp3")
2. Downloading the existing storage file via `self.supabase.storage.from_(self.bucket_name).download(src_path)`
3. Uploading to versioned path (same upload call as `save_snippet` does)
4. Creating the `SnippetHistory` row and calling `db.add()` (do NOT `db.commit()` — that's the caller's job)

- [ ] Implement `_snapshot_existing_snippet`

### Step 4.3 — Call snapshot functions from `save_snippet`

**File:** `apps/backend/services/snippet_service.py`

Modify `save_snippet` to call both new methods BEFORE the upload step.

Find the current `save_snippet` → Step 2 comment ("Determine storage path") and add BEFORE it:

```python
# Step 1.5: Snapshot existing snippet if one already exists
# (must happen before the upsert in step 3 overwrites the live file)
existing_snippet_url = None
existing_metadata = {}
if repo_data and repo_data.audio_snippet:
    # A live snippet exists — snapshot it before overwriting
    existing_snippet_url = repo_data.audio_snippet
    existing_metadata = {
        "duration": repo_data.snippet_duration,
        "file_size": repo_data.snippet_file_size,
        "format": repo_data.snippet_format,
        "sample_rate": repo_data.snippet_sample_rate,
        "channels": repo_data.snippet_channels,
    }
    next_version = await self._get_next_version_number(f"{owner}/{repo}", db)
    await self._snapshot_existing_snippet(
        owner=owner,
        repo=repo,
        current_url=existing_snippet_url,
        current_metadata=existing_metadata,
        version_number=next_version,
        db=db,
        uploader_user_id=None,  # pass user_id from router if available
    )
```

**IMPORTANT:** `save_snippet` currently does not take a `db` parameter. You'll need to:
- Add `db: Optional[Session] = None` parameter to `save_snippet`
- Update the call in `snippets.py` router to pass `db`
- Check whether the snapshot call should be in the router (where `db` is already available) or the service

- [ ] Add `db` parameter to `save_snippet` signature
- [ ] Add the snapshot call before the upload step
- [ ] Update `snippets.py` router to pass `db` to `save_snippet`

### Step 4.4 — Add snippet history endpoint

**File:** `apps/backend/routers/snippets.py`

Add a new route at the bottom of the file:

```python
@router.get("/repos/{owner}/{repo}/snippet/history")
@limiter.limit("30/minute")
async def get_snippet_history(
    request: Request,
    owner: str,
    repo: str,
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """Returns version history of the audio snippet for a repo."""
    from models.snippet_models import SnippetHistory
    repo_id = f"{owner}/{repo}"
    history = (
        db.query(SnippetHistory)
        .filter(SnippetHistory.repo_id == repo_id)
        .order_by(SnippetHistory.version_number.desc())
        .limit(limit)
        .all()
    )
    return {
        "success": True,
        "repo": repo_id,
        "history": [
            {
                "id": h.id,
                "version_number": h.version_number,
                "snippet_url": h.snippet_url,
                "duration": h.duration,
                "file_size": h.file_size,
                "format": h.format,
                "replaced_at": h.replaced_at.isoformat() if h.replaced_at else None,
            }
            for h in history
        ],
    }
```

- [ ] Add `get_snippet_history` endpoint to `snippets.py`
- [ ] Add `getSnippetHistory(owner, repo)` wrapper to `apps/web/lib/api/snippets.ts`
- [ ] Test: upload two snippets for the same repo, verify the history endpoint returns 1 row (the first snippet snapshotted)

---

## Phase 5 — Desktop: `pushAndDiff` IPC Integration

**File:** `apps/desktop/src/services/gitService.ts`

The `pushAndDiff` scaffold is in place. You need to fill in Steps 2 and 3 (the IPC calls).

### Step 5.1 — Add a `get-file-at-revision` IPC handler

This is needed to get the `.als` file content from `HEAD~1` (before the push).

**File:** `apps/desktop/src/electron/project.ts` (or wherever other IPC handlers live)

```typescript
// Add new IPC handler:
ipcMain.handle('get-file-at-revision', async (_event, { repoPath, filePath, revision }) => {
    // Uses: git show <revision>:<filePath>
    // Returns the file contents as a Buffer, written to a temp file
    const { execFileSync } = require('child_process');
    const os = require('os');
    const path = require('path');
    const fs = require('fs');

    const content = execFileSync('git', ['show', `${revision}:${filePath}`], {
        cwd: repoPath,
        maxBuffer: 50 * 1024 * 1024, // 50MB
    });

    const tmpPath = path.join(os.tmpdir(), `soundhaus_diff_prev_${Date.now()}.als`);
    fs.writeFileSync(tmpPath, content);
    return tmpPath; // Caller is responsible for deleting the temp file
});
```

- [ ] Find where IPC handlers are registered in `project.ts` (or `main.ts`)
- [ ] Add the `get-file-at-revision` handler
- [ ] Add `window.electronAPI.invoke('get-file-at-revision', {...})` to the preload type definitions in `types/electron.d.ts`

### Step 5.2 — Fill in `pushAndDiff` Steps 2 & 3

Back in `gitService.ts`, find the `// TODO: Replace placeholder below` block and implement:

```typescript
// Step 2a: Get before .als path (previous revision)
const beforeAlsPath = await window.electronAPI.invoke('get-file-at-revision', {
    repoPath,
    filePath: alsFilePath,
    revision: 'HEAD~1',
});

// Step 2b: Current .als path
const currentAlsPath = `${repoPath}/${alsFilePath}`;

// Step 3a: System A — xml diff
const xmlDiff = await window.electronAPI.invoke('diff-xml', {
    current: currentAlsPath,
    previous: beforeAlsPath,
});

// Step 3b: System B — structural compare
const structuralResult = await window.electronAPI.invoke('find-instrument-changes', {
    current: currentAlsPath,
    previous: beforeAlsPath,
});

// Clean up temp file
const fs = await window.electronAPI.invoke('delete-temp-file', beforeAlsPath);
// (or just leave it — OS will clean on restart if temp cleanup is too complex)
```

- [ ] Replace the two `null` placeholder assignments with the IPC calls above
- [ ] Update `diff_summary` construction: `diff_summary: xmlDiff?.summary ?? ''`
- [ ] Test: push from Desktop, verify an `als_diffs` row appears in Supabase

### Step 5.3 — Wire `pushAndDiff` into the push button handler

**File:** wherever the "Push" button's click handler lives (likely a React component in `src/`)

```typescript
// Replace:
await gitService.pushRepo(repoPath);
// With:
const { pushResult, diffPosted } = await gitService.pushAndDiff(
    repoPath,
    ownerUuid,
    repoSlug,
    'MyProject.als',  // TODO: get from project metadata (which .als file is this repo?)
    backendToken,     // TODO: get from patService or storage
    commitSha,        // TODO: get from git log -1 --format=%H after push completes
    beforeSha,        // TODO: get from git rev-parse HEAD~1 before push
);
if (!diffPosted) {
    console.warn('Push succeeded but diff upload failed');
}
```

- [ ] Find the push button handler component
- [ ] Replace `pushRepo` call with `pushAndDiff` call
- [ ] Locate how to get `backendToken` from existing auth state (check `patService.ts`)

---

## Phase 6 — Web Repo Detail Page

**File:** `apps/web/app/(dashboard)/repository/[id]/page.tsx`

The file has been rewritten as a scaffold. Work through each `// TODO` comment in the file.

### Step 6.1 — Resolve URL encoding (Decision from Phase 0)

In the page component, find:
```typescript
const [owner, repoSlug] = rawId?.split("__") ?? ["", ""];
```

- [ ] Confirm or change the `__` split delimiter to match how explore/list pages build their links
- [ ] Test that navigating to a repo from the explore page lands on this page with correct `owner` and `repoSlug`

### Step 6.2 — Wire up `getRepoStats` on mount

In the `useEffect` (currently has `setIsLoadingStats(false)` placeholder):

```typescript
useEffect(() => {
    if (!owner || !repoSlug) return;
    setIsLoadingStats(true);
    getRepoStats(owner, repoSlug).then((result) => {
        if (result.success) setRepoStats(result.data ?? null);
        else setStatsError(result.error ?? "Failed to load repo");
        setIsLoadingStats(false);
    });
}, [owner, repoSlug]);
```

- [ ] Import `getRepoStats` from `@/lib/api/repos`
- [ ] Replace the placeholder `setIsLoadingStats(false)` with the real fetch

### Step 6.3 — Wire up Commits tab

In `handleTabChange`:
```typescript
if (tab === "commits" && commits.length === 0) {
    setIsLoadingCommits(true);
    getCommits(owner, repoSlug, 1, 20).then((result) => {
        if (result.success) {
            setCommits(result.data?.commits ?? []);
            setCommitsTotal(result.data?.total ?? 0);
        }
        setIsLoadingCommits(false);
    });
}
```

- [ ] Uncomment the commit useState declarations at the top
- [ ] Import `getCommits` from `@/lib/api/commits`
- [ ] Replace the "Commit history will appear here" placeholder with a `CommitList` component (or inline map)

### Step 6.4 — CommitList + CommitCard components

**Files to create:**
- `apps/web/components/CommitCard.tsx`
- `apps/web/components/CommitList.tsx`

`CommitCard` should render:
```tsx
<div className="card-interactive p-4 flex items-start gap-4">
    <div className="flex-1">
        <p className="text-white font-medium">{commit.message.split('\n')[0]}</p>
        <p className="text-muted text-sm mt-1">{commit.author_name} · {formatRelativeTime(commit.timestamp)}</p>
        <div className="flex gap-2 mt-2">
            {commit.files_added.length > 0 && <FileChangeBadge type="added" count={commit.files_added.length} />}
            {commit.files_modified.length > 0 && <FileChangeBadge type="modified" count={commit.files_modified.length} />}
            {commit.files_removed.length > 0 && <FileChangeBadge type="removed" count={commit.files_removed.length} />}
        </div>
    </div>
    <span className="commit-hash">{commit.short_sha}</span>
    {commit.has_diff && (
        <button className="btn-secondary text-xs" onClick={() => onViewDiff(commit.sha)}>
            View Diff
        </button>
    )}
</div>
```

- [ ] Create `CommitCard.tsx`
- [ ] Create `CommitList.tsx` (wraps `CommitCard` in a list, handles "Load More")
- [ ] Create `FileChangeBadge.tsx` (small colored tag: `+3 added`, `~1 modified`, `-2 removed`)

### Step 6.5 — AlsDiffView component

**File to create:** `apps/web/components/AlsDiffView.tsx`

This component receives an `AlsDiffData` object and renders it based on `diff_type`.

```tsx
// Rough structure:
export default function AlsDiffView({ diff }: { diff: AlsDiffData }) {
    if (diff.diff_type === 'combined') {
        return (
            <div>
                <XmlDiffSection data={diff.diff_data.xml} />
                <StructuralDiffSection data={diff.diff_data.structural} />
            </div>
        );
    }
    // handle "xml" and "structural" types separately
}
```

For `StructuralDiffSection`, iterate over `changes: AlsChange[]` and for each:
- Show track name (before/after if renamed)
- Show instrument device before → after (from `before.name` → `after.name`)

For `XmlDiffSection`, show the `summary` string and optionally a collapsible raw view of the track list changes.

- [ ] Create `AlsDiffView.tsx` with `XmlDiffSection` and `StructuralDiffSection`
- [ ] Wire up the Diffs tab in `page.tsx` to call `getCommitDiff` and render `<AlsDiffView />`

### Step 6.6 — SnippetTimeline component

**File to create:** `apps/web/components/SnippetTimeline.tsx`

```tsx
// Fetches snippet history and renders a list of past versions with playback
export default function SnippetTimeline({ owner, repo }: { owner: string; repo: string }) {
    const [history, setHistory] = useState([]);
    useEffect(() => {
        getSnippetHistory(owner, repo).then(result => {
            if (result.success) setHistory(result.data?.history ?? []);
        });
    }, [owner, repo]);

    return (
        <div className="card p-4">
            <h3 className="text-white font-semibold mb-3">Previous Versions</h3>
            {history.map(item => (
                <div key={item.id} className="flex items-center gap-4 py-2 border-b border-white/10">
                    <span className="text-muted text-sm">v{item.version_number}</span>
                    <audio controls src={item.snippet_url} className="flex-1 h-8" />
                    <span className="text-muted text-xs">{formatRelativeTime(item.replaced_at)}</span>
                </div>
            ))}
        </div>
    );
}
```

- [ ] Implement `getSnippetHistory` in `apps/web/lib/api/snippets.ts`
- [ ] Create `SnippetTimeline.tsx`
- [ ] Place `<SnippetTimeline owner={owner} repo={repoSlug} />` in the Overview tab (below the audio player)

### Step 6.7 — UpdateBanner component

**File to create:** `apps/web/components/UpdateBanner.tsx`

Already rendered conditionally in `page.tsx` when `repoStats?.needs_update === true`. Upgrade it:

```tsx
export default function UpdateBanner({ commitSha }: { commitSha?: string | null }) {
    return (
        <div className="card border border-glass-blue-500/30 bg-glass-blue-500/10 p-4 flex items-center justify-between">
            <p className="text-sm text-glass-blue-500">
                New push: commit{" "}
                <span className="commit-hash">{commitSha?.slice(0, 8) ?? "unknown"}</span>
                {" "}— pull in Desktop to sync
            </p>
        </div>
    );
}
```

- [ ] Create `UpdateBanner.tsx`
- [ ] Replace the inline `<div>` in `page.tsx` with `<UpdateBanner commitSha={...} />`

---

## Phase 7 — Cleanup & Testing

### Step 7.1 — Replace shared Navbar

The scaffolded `page.tsx` has an inline nav with a `{/* IMPLEMENTATION: Replace with <Navbar /> */}` comment.

- [ ] Find the existing `Navbar` component path (check other dashboard pages for their import)
- [ ] Replace the inline nav in `page.tsx` with `<Navbar />`

### Step 7.2 — Add `commits` relationship to `PushEvent` model

**File:** `apps/backend/models/webhook_models.py`

The `CommitDetail.push_event` back-reference points to `PushEvent`, but `PushEvent` doesn't have the forward relationship yet:

```python
# Add to PushEvent class in webhook_models.py:
commit_details = relationship(
    "CommitDetail",
    back_populates="push_event",
    cascade="all, delete-orphan"
)
```

- [ ] Add `commit_details` relationship to the `PushEvent` class

### Step 7.3 — End-to-end test sequence

- [ ] Push from Desktop → verify `commit_details` rows appear in DB
- [ ] Open repo detail page in web → verify commits tab loads with real data
- [ ] Click "View Diff" → verify diff renders in AlsDiffView
- [ ] Upload a second snippet → verify `snippet_history` table has a row for the first snippet
- [ ] Verify snippet history appears in SnippetTimeline on the Overview tab
- [ ] Verify `UpdateBanner` appears when `needs_update = true`
- [ ] Verify banner disappears after Desktop pushes a diff (sets `needs_update = false`)

---

## Appendix A — New Files Created This Session

```
apps/backend/models/commit_models.py     ← CommitDetail SQLAlchemy model
apps/backend/models/diff_models.py       ← AlsDiff SQLAlchemy model
apps/backend/models/snippet_models.py    ← SnippetHistory SQLAlchemy model
apps/backend/routers/commits.py          ← 4 commit/diff endpoints (stubs)
apps/web/lib/api/commits.ts              ← getCommits / getCommitDetail / getCommitDiff
```

## Appendix B — Modified Files This Session

```
apps/backend/models/repo_models.py       ← Added needs_update, last_push_commit_sha,
                                           commit_details, als_diffs, snippet_history
apps/backend/services/webhook_service.py ← Added TODO stubs in _handle_push
apps/backend/services/snippet_service.py ← Added _get_next_version_number +
                                           _snapshot_existing_snippet stubs
apps/desktop/src/services/gitService.ts  ← Added pushAndDiff stub
apps/web/app/(dashboard)/repository/[id]/page.tsx ← Full scaffold rewrite
```

## Appendix C — Still Using Placeholder Data

These are the places that will visually break until you wire up the API:

| Component/Page | Placeholder | Replace With |
|----------------|-------------|--------------|
| `page.tsx` stats row | `repoStats?.total_commits ?? "—"` | `getRepoStats()` result |
| `page.tsx` audio player | `repoStats?.audio_snippet` | same — already reading from state, just needs `getRepoStats` wired |
| `page.tsx` commits tab | "Commit history will appear here" text | `<CommitList>` component |
| `page.tsx` diffs tab | "ALS diff viewer will appear here" text | `<AlsDiffView>` component |
