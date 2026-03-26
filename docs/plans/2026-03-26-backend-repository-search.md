# Backend Repository Search Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build backend search endpoint for public Gitea repositories with infinite scroll pagination and SoundHaus metadata enrichment.

**Architecture:** Create `/repos/search` endpoint that queries Gitea's search API for repository names, filters to public repos only, then enriches results with SoundHaus metadata (genres, audio snippets, clone counts) from Supabase via batch queries.

**Tech Stack:** FastAPI, Gitea API, SQLAlchemy, PostgreSQL (Supabase)

---

## Task 1: Add Gitea Search Method

**Files:**
- Modify: `apps/backend/services/gitea_service.py`
- Test: Manual testing via Python REPL (no formal test file for this task)

**Step 1: Add search_repos method to GiteaAdminService**

Add this method to the `GiteaAdminService` class in `apps/backend/services/gitea_service.py` after the existing methods (around line 660):

```python
def search_repos(
    self,
    query: str,
    limit: int = 20,
    page: int = 1,
    public_only: bool = True,
) -> Dict[str, Any]:
    """Search for repositories using Gitea's search API.

    Args:
        query: Search query string for repository names
        limit: Number of results per page (max 100)
        page: Page number (1-indexed)
        public_only: If True, only return public repositories

    Returns:
        Dict with success, repos list, and total count
    """
    try:
        params = {
            "q": query,
            "limit": min(limit, 100),  # Gitea max is 100
            "page": page,
        }

        if public_only:
            params["exclusive"] = "true"  # Only return repos user has access to

        url = self._url("/api/v1/repos/search")
        resp = requests.get(url, headers=self.headers, params=params, timeout=15)

        logger.debug(
            "search_repos_response",
            query=query,
            status_code=resp.status_code,
            limit=limit,
            page=page
        )

        if resp.status_code != 200:
            msg = self._extract_msg(resp)
            logger.warning(
                "search_repos_failed",
                query=query,
                status=resp.status_code,
                message=msg
            )
            return {
                "success": False,
                "status": resp.status_code,
                "message": msg
            }

        data = resp.json()
        repos = data.get("data", [])

        # Filter to only public repos if requested
        if public_only:
            repos = [r for r in repos if not r.get("private", True)]

        logger.info(
            "search_repos_success",
            query=query,
            result_count=len(repos),
            total=len(repos)
        )

        return {
            "success": True,
            "repos": repos,
            "total": len(repos),
        }

    except requests.RequestException as e:
        logger.error("search_repos_error", query=query, error=str(e))
        return {
            "success": False,
            "status": 0,
            "message": f"Network error: {e}"
        }

def _extract_msg(self, resp: requests.Response) -> str:
    """Extract error message from response (add if not present)."""
    try:
        data = resp.json()
        if isinstance(data, dict) and "message" in data:
            return data["message"]
        return f"HTTP {resp.status_code}: {resp.reason}"
    except Exception:
        return f"HTTP {resp.status_code}: {resp.reason}"
```

**Step 2: Verify imports are present**

Check that these imports exist at the top of `apps/backend/services/gitea_service.py`:

```python
import requests
from typing import Any, Dict, Optional
from logging_config import get_logger
from config import settings

logger = get_logger("soundhaus.gitea")
```

**Step 3: Manual test via Python REPL**

```bash
cd apps/backend
python3 -c "
from services.gitea_service import GiteaAdminService
svc = GiteaAdminService()
result = svc.search_repos('test', limit=5)
print('Success:', result.get('success'))
print('Repo count:', len(result.get('repos', [])))
"
```

Expected: Should print `Success: True` and a repo count

**Step 4: Commit**

```bash
git add apps/backend/services/gitea_service.py
git commit -m "feat(backend): add search_repos method to GiteaAdminService

Adds Gitea API search integration for repository search by name.
Supports pagination and public-only filtering.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Add Search Method to RepoService

**Files:**
- Modify: `apps/backend/services/repo_service.py`
- Test: Manual testing via Python REPL

**Step 1: Add search_public_repos method**

Add this method to the `RepoService` class in `apps/backend/services/repo_service.py` after the existing methods (around line 660):

```python
def search_public_repos(
    self,
    query: str,
    db: Session,
    limit: int = 20,
    offset: int = 0,
    sort: str = "stars",
) -> Dict[str, Any]:
    """Search public repositories and enrich with SoundHaus metadata.

    Args:
        query: Search query string
        db: Database session for SoundHaus metadata
        limit: Number of results to return
        offset: Pagination offset
        sort: Sort order - "stars", "updated", or "clones"

    Returns:
        Dict with success, repos list, pagination info
    """
    from models.repo_models import RepoData
    from models.profile_models import Profile

    try:
        # Calculate Gitea page from offset
        # Gitea uses 1-indexed pages
        page = (offset // limit) + 1

        # Call Gitea search API
        gitea_admin = GiteaAdminService(
            base_url=self.base_url,
            admin_token=self.token
        )
        gitea_result = gitea_admin.search_repos(
            query=query,
            limit=limit,
            page=page,
            public_only=True
        )

        if not gitea_result.get("success"):
            logger.warning(
                "search_public_repos_gitea_failed",
                query=query,
                message=gitea_result.get("message")
            )
            return {
                "success": False,
                "message": gitea_result.get("message", "Gitea search failed")
            }

        gitea_repos = gitea_result.get("repos", [])

        if not gitea_repos:
            return {
                "success": True,
                "repos": [],
                "total": 0,
                "has_more": False,
                "offset": offset,
                "limit": limit,
            }

        # Extract gitea_ids for batch lookup
        gitea_ids = [r.get("full_name") for r in gitea_repos if r.get("full_name")]

        # Batch fetch RepoData
        repo_data_rows = (
            db.query(RepoData)
            .filter(RepoData.gitea_id.in_(gitea_ids))
            .all()
        )
        repo_data_map = {rd.gitea_id: rd for rd in repo_data_rows}

        # Batch fetch owner profiles for username mapping
        owner_ids = list({r.get("owner", {}).get("login", "") for r in gitea_repos})
        profile_rows = db.query(Profile).filter(Profile.id.in_(owner_ids)).all()
        profile_map = {p.id: p.username for p in profile_rows}

        # Enrich results
        enriched = []
        for repo in gitea_repos:
            full_name = repo.get("full_name", "")
            owner_login = repo.get("owner", {}).get("login", "")
            rd = repo_data_map.get(full_name)

            enriched.append({
                "gitea_id": full_name,
                "owner": owner_login,
                "owner_username": profile_map.get(owner_login, owner_login),
                "repo_name": repo.get("name", ""),
                "description": repo.get("description", ""),
                "stars_count": repo.get("stars_count", 0),
                "updated_at": repo.get("updated_at", ""),
                "clone_count": rd.clone_count if rd else 0,
                "audio_snippet": rd.audio_snippet if rd else None,
                "snippet_metadata": {
                    "duration": rd.snippet_duration,
                    "file_size": rd.snippet_file_size,
                    "format": rd.snippet_format,
                    "sample_rate": rd.snippet_sample_rate,
                    "channels": rd.snippet_channels,
                } if rd and rd.audio_snippet else None,
                "genres": [g.genre_name for g in rd.genres] if rd else [],
                "clone_url": f"{settings.gitea_public_url}/{full_name}.git",
            })

        # Apply sorting
        if sort == "stars":
            enriched.sort(key=lambda x: x.get("stars_count", 0), reverse=True)
        elif sort == "updated":
            enriched.sort(
                key=lambda x: x.get("updated_at", ""),
                reverse=True
            )
        elif sort == "clones":
            enriched.sort(key=lambda x: x.get("clone_count", 0), reverse=True)

        # Determine if there are more results
        has_more = len(gitea_repos) >= limit

        logger.info(
            "search_public_repos_success",
            query=query,
            result_count=len(enriched),
            offset=offset,
            limit=limit
        )

        return {
            "success": True,
            "repos": enriched,
            "total": len(enriched),
            "has_more": has_more,
            "offset": offset,
            "limit": limit,
        }

    except Exception as e:
        logger.error(
            "search_public_repos_error",
            query=query,
            error=str(e)
        )
        return {
            "success": False,
            "message": f"Search error: {str(e)}"
        }
```

**Step 2: Verify imports**

Check that these imports exist at the top of `apps/backend/services/repo_service.py`:

```python
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from services.gitea_service import GiteaAdminService
from logging_config import get_logger
from config import settings

logger = get_logger("soundhaus.repo")
```

**Step 3: Commit**

```bash
git add apps/backend/services/repo_service.py
git commit -m "feat(backend): add search_public_repos method to RepoService

Implements repository search with SoundHaus metadata enrichment.
Supports sorting by stars, updated date, and clone count.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Add Search Endpoint to Router

**Files:**
- Modify: `apps/backend/routers/repos.py`
- Test: Manual testing via curl

**Step 1: Add /repos/search endpoint**

Add this endpoint to `apps/backend/routers/repos.py` after the `/repos/public` endpoint (around line 347):

```python
@router.get("/repos/search")
@limiter.limit("60/minute")
async def search_repos(
    request: Request,
    q: str,
    limit: int = 20,
    offset: int = 0,
    sort: str = "stars",
    db: Session = Depends(get_db),
):
    """Search public repositories by name with pagination and sorting.

    Query Parameters:
        q: Search query (required)
        limit: Results per page (1-100, default 20)
        offset: Pagination offset (default 0)
        sort: Sort order - "stars", "updated", "clones" (default "stars")

    Returns:
        Enriched repository results with SoundHaus metadata
    """
    # Validate query parameter
    if not q or not q.strip():
        raise HTTPException(
            status_code=400,
            detail="Search query cannot be empty"
        )

    # Validate pagination parameters
    if limit < 1 or limit > 100:
        raise HTTPException(
            status_code=400,
            detail="Limit must be between 1 and 100"
        )

    if offset < 0:
        raise HTTPException(
            status_code=400,
            detail="Offset must be non-negative"
        )

    # Validate sort parameter
    if sort not in ["stars", "updated", "clones"]:
        raise HTTPException(
            status_code=400,
            detail="Sort must be 'stars', 'updated', or 'clones'"
        )

    logger.debug(
        "search_repos_request",
        query=q,
        limit=limit,
        offset=offset,
        sort=sort
    )

    svc = RepoService()
    result = svc.search_public_repos(
        query=q,
        db=db,
        limit=limit,
        offset=offset,
        sort=sort
    )

    if not result.get("success"):
        error_msg = result.get("message", "Search failed")
        logger.warning(
            "search_repos_failed",
            query=q,
            message=error_msg
        )

        # Check if it's a Gitea unavailability issue
        if "Network error" in error_msg or "timeout" in error_msg.lower():
            raise HTTPException(
                status_code=503,
                detail="Search service temporarily unavailable"
            )

        raise HTTPException(
            status_code=400,
            detail=error_msg
        )

    logger.info(
        "search_repos_success",
        query=q,
        result_count=len(result.get("repos", [])),
        offset=offset,
        limit=limit
    )

    return {
        "success": True,
        "repos": result.get("repos", []),
        "total": result.get("total", 0),
        "has_more": result.get("has_more", False),
        "offset": offset,
        "limit": limit,
    }
```

**Step 2: Verify imports**

Check that the router file has these imports at the top:

```python
from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from database import get_db
from dependencies import limiter
from logging_config import get_logger
from services.repo_service import RepoService

logger = get_logger(__name__)
router = APIRouter(tags=["repos"])
```

**Step 3: Test endpoint with curl**

```bash
# Start the backend server if not running
# Then test the search endpoint

curl -X GET "http://localhost:8000/repos/search?q=test&limit=5" -H "accept: application/json"
```

Expected: JSON response with `success: true` and a `repos` array

**Step 4: Test validation**

```bash
# Test empty query
curl -X GET "http://localhost:8000/repos/search?q=" -H "accept: application/json"
# Expected: 400 error "Search query cannot be empty"

# Test invalid limit
curl -X GET "http://localhost:8000/repos/search?q=test&limit=200" -H "accept: application/json"
# Expected: 400 error "Limit must be between 1 and 100"

# Test invalid sort
curl -X GET "http://localhost:8000/repos/search?q=test&sort=invalid" -H "accept: application/json"
# Expected: 400 error "Sort must be 'stars', 'updated', or 'clones'"
```

**Step 5: Commit**

```bash
git add apps/backend/routers/repos.py
git commit -m "feat(backend): add /repos/search endpoint

Adds public repository search endpoint with:
- Query validation
- Pagination support (limit/offset)
- Sorting by stars, updated, or clones
- Rate limiting (60/min)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Add Frontend API Client Function

**Files:**
- Modify: `apps/web/lib/api/repos.ts`
- Test: Manual testing via browser console

**Step 1: Add searchPublicRepos function**

Add this function to `apps/web/lib/api/repos.ts`:

```typescript
export interface SearchReposParams {
    query: string;
    limit?: number;
    offset?: number;
    sort?: 'stars' | 'updated' | 'clones';
}

export interface SearchReposResponse {
    success: boolean;
    repos: Repository[];
    total: number;
    has_more: boolean;
    offset: number;
    limit: number;
}

export async function searchPublicRepos(
    params: SearchReposParams
): Promise<SearchReposResponse> {
    const { query, limit = 20, offset = 0, sort = 'stars' } = params;

    const searchParams = new URLSearchParams({
        q: query,
        limit: limit.toString(),
        offset: offset.toString(),
        sort,
    });

    const response = await fetch(
        `/api/repos/search?${searchParams.toString()}`,
        {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        }
    );

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Search failed' }));
        throw new Error(error.message || 'Failed to search repositories');
    }

    return response.json();
}
```

**Step 2: Verify Repository type exists**

Check that `apps/web/types/repository.ts` has a compatible `Repository` type. If needed, update it to match the backend schema:

```typescript
export interface Repository {
    gitea_id: string;
    owner: string;
    owner_username: string;
    repo_name: string;
    description: string;
    stars_count: number;
    updated_at: string;
    clone_count: number;
    audio_snippet: string | null;
    snippet_metadata?: {
        duration: number;
        file_size: number;
        format: string;
        sample_rate: number;
        channels: number;
    } | null;
    genres: string[];
    clone_url: string;
}
```

**Step 3: Commit**

```bash
git add apps/web/lib/api/repos.ts apps/web/types/repository.ts
git commit -m "feat(web): add searchPublicRepos API client function

Adds TypeScript client for /repos/search endpoint with full type safety.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Integrate Search into Explore Page

**Files:**
- Modify: `apps/web/app/(dashboard)/explore/page.tsx`
- Test: Manual testing in browser

**Step 1: Update imports and add API integration**

Replace the mock data imports and add the search API client at the top of the file:

```typescript
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useUser } from "@/lib/context/UserContext";
import { searchPublicRepos, type SearchReposResponse } from "@/lib/api/repos";
import { useDebounce } from "@/hooks/useDebounce";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import type { Repository } from "@/types/repository";
```

**Step 2: Replace state management**

Replace the existing state variables with these:

```typescript
export default function ExplorePage() {
  const { user, loading: userLoading } = useUser();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [sortBy, setSortBy] = useState<"top" | "recent" | "trending">("top");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const limit = 20;
```

**Step 3: Add search function**

Add this function after the state declarations:

```typescript
const fetchRepos = useCallback(async (
  query: string,
  currentOffset: number,
  shouldAppend: boolean = false
) => {
  if (!query.trim()) {
    setRepos([]);
    setHasMore(false);
    return;
  }

  setIsLoading(true);
  setError(null);

  try {
    // Map UI sort to API sort
    const sortMap = {
      top: 'stars' as const,
      recent: 'updated' as const,
      trending: 'stars' as const, // Trending uses stars for now
    };

    const result = await searchPublicRepos({
      query,
      limit,
      offset: currentOffset,
      sort: sortMap[sortBy],
    });

    if (shouldAppend) {
      setRepos((prev) => [...prev, ...result.repos]);
    } else {
      setRepos(result.repos);
    }

    setHasMore(result.has_more);
    setOffset(currentOffset);
  } catch (err) {
    console.error('Search error:', err);
    setError(err instanceof Error ? err.message : 'Failed to search repositories');
    if (!shouldAppend) {
      setRepos([]);
    }
    setHasMore(false);
  } finally {
    setIsLoading(false);
  }
}, [sortBy, limit]);
```

**Step 4: Add effect hooks**

Replace the existing useMemo hooks with these useEffect hooks:

```typescript
// Trigger search when query or sort changes
useEffect(() => {
  setOffset(0);
  fetchRepos(debouncedSearchQuery, 0, false);
}, [debouncedSearchQuery, sortBy, fetchRepos]);

// Infinite scroll handler
const loadMore = useCallback(() => {
  if (!isLoading && hasMore && debouncedSearchQuery.trim()) {
    const nextOffset = offset + limit;
    fetchRepos(debouncedSearchQuery, nextOffset, true);
  }
}, [isLoading, hasMore, offset, limit, debouncedSearchQuery, fetchRepos]);

// Set up infinite scroll observer
useInfiniteScroll({
  hasMore,
  isLoading,
  onLoadMore: loadMore,
});
```

**Step 5: Update the repos mapping**

Replace the `filteredAndSortedRepos.map()` section with:

```typescript
{repos.length === 0 && !isLoading && searchQuery.trim() ? (
  <div className="text-center py-12 text-zinc-500">
    <svg
      className="w-12 h-12 mx-auto mb-4 text-zinc-700"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
    <p className="text-lg">No projects found</p>
    <p className="text-sm mt-1">Try adjusting your search</p>
  </div>
) : (
  <>
    {repos.map((repo) => (
      <article
        key={repo.gitea_id}
        className="group relative rounded-lg border border-zinc-800/60 bg-gradient-to-br from-zinc-900/90 to-zinc-900/50 overflow-hidden backdrop-blur-sm transition-all duration-500 hover:border-glass-blue-500/40 hover:bg-zinc-800/50 hover:shadow-[0_0_40px_rgba(167,199,231,0.15)] cursor-pointer"
      >
        {/* Thumbnail */}
        <div className="relative h-48 overflow-hidden bg-gradient-to-br from-zinc-800 via-zinc-900 to-black">
          {/* Waveform pattern - keep existing */}
        </div>

        {/* Content */}
        <div className="p-5 space-y-3">
          <h3 className="text-lg font-semibold text-zinc-100 group-hover:text-glass-blue-400 transition-all duration-300">
            {repo.repo_name}
          </h3>

          <p className="text-sm text-zinc-400">
            <span className="font-medium text-zinc-300">
              {repo.owner_username}
            </span>
            <span className="mx-2">•</span>
            <span>Updated {formatRelativeTime(repo.updated_at)}</span>
          </p>

          <div className="flex gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-glass-cyan-500">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {repo.stars_count || 0}
            </span>
            <span className="flex items-center gap-1.5 text-zinc-400">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
              </svg>
              {repo.clone_count} clones
            </span>
          </div>
        </div>
      </article>
    ))}

    {isLoading && (
      <div className="text-center py-8">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-glass-blue-500 border-r-transparent"></div>
        <p className="mt-2 text-sm text-zinc-500">Loading more...</p>
      </div>
    )}
  </>
)}

{error && (
  <div className="text-center py-8 text-red-400">
    <p>{error}</p>
    <button
      onClick={() => fetchRepos(debouncedSearchQuery, 0, false)}
      className="mt-4 px-4 py-2 bg-glass-blue-500 text-white rounded-md hover:bg-glass-blue-600 transition"
    >
      Retry
    </button>
  </div>
)}
```

**Step 6: Update trending sidebar**

Update the trending section to use the same repos data (showing top 5 by stars):

```typescript
// Get top 5 trending repos (by stars)
const trendingRepos = useMemo(() => {
  return [...repos]
    .sort((a, b) => (b.stars_count || 0) - (a.stars_count || 0))
    .slice(0, 5);
}, [repos]);
```

**Step 7: Test in browser**

Start the development server and test:

```bash
cd apps/web
npm run dev
```

Navigate to `/explore` and verify:
1. Search input triggers API calls after typing
2. Results update based on search query
3. Sort buttons change result order
4. Scrolling to bottom loads more results
5. Loading spinner shows during fetch
6. Error states display correctly

**Step 8: Commit**

```bash
git add apps/web/app/(dashboard)/explore/page.tsx
git commit -m "feat(web): integrate backend search into explore page

Replaces mock data with real API integration:
- Debounced search input (300ms)
- Infinite scroll pagination
- Sort by stars/recent/clones
- Loading and error states

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: End-to-End Testing

**Files:**
- Test: Manual end-to-end testing

**Step 1: Start all services**

```bash
# Terminal 1: Start backend
cd apps/backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2: Start frontend
cd apps/web
npm run dev
```

**Step 2: Test search functionality**

1. Navigate to `http://localhost:3000/explore`
2. Type "test" in the search box
3. Verify results appear after 300ms debounce
4. Verify results show correct data (stars, clone count, owner username)
5. Scroll to bottom and verify more results load
6. Click "Recent" sort button and verify order changes
7. Clear search and verify empty state

**Step 3: Test edge cases**

1. Search for non-existent term (e.g., "xyzabc123456")
   - Should show "No projects found"
2. Search with special characters (e.g., "test@#$%")
   - Should handle gracefully
3. Rapidly change search queries
   - Should cancel previous requests and show latest results only

**Step 4: Test error handling**

1. Stop the backend server
2. Try to search
3. Verify error message displays
4. Click retry button
5. Start backend and verify retry works

**Step 5: Document any issues**

If any issues are found, document them in a comment in this plan file.

---

## Task 7: Final Commit and Documentation

**Files:**
- Modify: `docs/plans/2026-03-26-backend-repository-search-design.md`

**Step 1: Update design doc with implementation notes**

Add an "Implementation Notes" section at the end of the design document:

```markdown
## Implementation Notes

**Implementation Date:** 2026-03-26

**Changes from Original Design:**
- [List any deviations or adjustments made during implementation]

**Known Issues:**
- [List any known issues or limitations]

**Future Improvements:**
- [List any identified opportunities for enhancement]
```

**Step 2: Final commit**

```bash
git add docs/plans/2026-03-26-backend-repository-search-design.md
git commit -m "docs: update design doc with implementation notes

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Step 3: Create summary of changes**

Create a summary in terminal output listing all files changed and commits made.

---

## Testing Checklist

- [ ] Backend: `search_repos` method in GiteaAdminService works
- [ ] Backend: `search_public_repos` method in RepoService works
- [ ] Backend: `/repos/search` endpoint returns valid responses
- [ ] Backend: Query validation works (empty query, invalid limit, etc.)
- [ ] Backend: Sorting by stars, updated, clones works correctly
- [ ] Backend: Pagination (limit/offset) works correctly
- [ ] Frontend: Search input triggers debounced API calls
- [ ] Frontend: Results display with correct data
- [ ] Frontend: Infinite scroll loads more results
- [ ] Frontend: Sort buttons change result order
- [ ] Frontend: Loading states display correctly
- [ ] Frontend: Error states display correctly
- [ ] Frontend: Empty states display correctly
- [ ] E2E: Full flow from search to results works
- [ ] E2E: Edge cases handled gracefully

---

## Rollback Plan

If critical issues are discovered:

1. **Backend rollback:**
   ```bash
   git revert <commit-hash>  # Revert router changes
   git revert <commit-hash>  # Revert service changes
   ```

2. **Frontend rollback:**
   ```bash
   git revert <commit-hash>  # Revert explore page changes
   ```

3. **Full rollback:**
   ```bash
   git reset --hard <commit-before-implementation>
   ```

---

## Performance Benchmarks

Expected performance targets:

- **Search response time (p95):** < 2 seconds
- **Gitea search API:** ~200-500ms
- **Supabase batch query:** ~50-100ms
- **Profile lookup:** ~30-50ms
- **Total backend time:** ~300-650ms
- **Network overhead:** ~100-200ms
- **Frontend render time:** ~50-100ms

Monitor these metrics in production and optimize if targets are not met.
