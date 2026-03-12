# Repository Feature Implementation Guide

## Overview

This guide explains how to complete the implementation of the repository management feature. The feature was partially implemented but missing the actual API layer that communicates with your FastAPI backend.

## What Was Restored

### ✅ Completed
1. **`lib/types/api.ts`** - Type definitions for all API responses
2. **`lib/actions/repos.actions.ts`** - Server action wrappers for repository operations
3. **`lib/actions/genres.actions.ts`** - Server action wrappers for genre operations
4. **`app/(dashboard)/repositories/RepositoriesClient.tsx`** - UI component for repository management
5. **Template files** - `lib/api/repos.ts` and `lib/api/genre.ts` with TODO comments

### ⚠️ Needs Implementation
- `lib/api/repos.ts` - **6 functions** need backend API calls
- `lib/api/genre.ts` - **2 functions** need backend API calls

---

## Architecture Pattern

```
┌─────────────────────────────────────────────┐
│   UI Component (Client)                     │
│   app/(dashboard)/repositories/             │
│   RepositoriesClient.tsx                    │
└──────────────┬──────────────────────────────┘
               │ calls server actions
               ▼
┌─────────────────────────────────────────────┐
│   Server Actions ("use server")             │
│   lib/actions/repos.actions.ts              │
│   - createRepoAction()                      │
│   - starRepoAction()                        │
│   - etc...                                  │
└──────────────┬──────────────────────────────┘
               │ calls API layer
               ▼
┌─────────────────────────────────────────────┐
│   API Layer (YOU NEED TO IMPLEMENT THIS)    │
│   lib/api/repos.ts                          │
│   - createRepo() ← TODO                     │
│   - starRepo() ← TODO                       │
│   - getEnrichedRepos() ← TODO               │
└──────────────┬──────────────────────────────┘
               │ HTTP requests
               ▼
┌─────────────────────────────────────────────┐
│   FastAPI Backend                           │
│   Your existing API endpoints               │
└─────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Identify Your Backend Endpoints

First, check your FastAPI backend (`apps/backend/`) to find the actual endpoint URLs. You need:

**Repository Endpoints:**
- GET `/api/repos` or `/api/repos/enriched` - Get user's repositories
- POST `/api/repos` - Create repository
- POST `/api/repos/{owner}/{repo}/star` - Star repository
- DELETE `/api/repos/{owner}/{repo}/star` - Unstar repository
- DELETE `/api/repos/{owner}/{repo}` - Delete repository
- PATCH `/api/repos/{owner}/{repo}` - Rename repository

**Genre Endpoints:**
- GET `/api/genres` - Get all genres
- POST `/api/repos/{owner}/{repo}/genres` - Set repository genres

### Step 2: Implement `lib/api/repos.ts`

Open `lib/api/repos.ts` and implement each function. Here's a complete example for `getEnrichedRepos()`:

```typescript
export async function getEnrichedRepos(): Promise<ApiResponse<EnrichedRepo[]>> {
  try {
    // Use authenticatedFetch - it automatically adds Authorization header
    const response = await authenticatedFetch('/api/repos/enriched');

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.detail || `HTTP ${response.status}: ${response.statusText}`
      };
    }

    const data = await response.json();
    // Adjust based on your backend's response structure
    return { success: true, data: data.repos || data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch repositories'
    };
  }
}
```

**Pattern for POST/DELETE/PATCH requests:**

```typescript
export async function createRepo(
  name: string,
  isPrivate: boolean,
  description: string
): Promise<ApiResponse<GiteaRepo>> {
  try {
    const response = await authenticatedFetch('/api/repos', {
      method: 'POST',
      body: JSON.stringify({
        name,
        private: isPrivate,
        description
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.detail || `Failed to create repository`
      };
    }

    const data = await response.json();
    return { success: true, data: data.repo || data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create repository'
    };
  }
}
```

### Step 3: Implement `lib/api/genre.ts`

Similar pattern for genres. Example:

```typescript
export async function getAllGenres(): Promise<ApiResponse<Genre[]>> {
  try {
    const response = await authenticatedFetch('/api/genres');

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch genres: ${response.statusText}`
      };
    }

    const data = await response.json();
    return { success: true, data: data.genres || data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch genres'
    };
  }
}

export async function setRepoGenre(
  owner: string,
  repo: string,
  genreIds: string[]
): Promise<ApiResponse<void>> {
  try {
    const response = await authenticatedFetch(`/api/repos/${owner}/${repo}/genres`, {
      method: 'POST',
      body: JSON.stringify({ genre_ids: genreIds })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.detail || `Failed to set genres`
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set genres'
    };
  }
}
```

### Step 4: Check Backend Response Format

Your backend might return data in different formats. Common patterns:

**Option A: Direct array**
```json
[{ "id": 1, "name": "repo1" }, { "id": 2, "name": "repo2" }]
```
→ Use: `return { success: true, data: data };`

**Option B: Wrapped in object**
```json
{ "repos": [{ "id": 1, "name": "repo1" }], "total": 10 }
```
→ Use: `return { success: true, data: data.repos };`

**Option C: With success flag**
```json
{ "success": true, "data": [...] }
```
→ Use: `return { success: true, data: data.data };`

### Step 5: Test the Implementation

Once implemented, test by:

1. Start your backend: `cd apps/backend && uvicorn main:app --reload`
2. Start your frontend: `cd apps/web && npm run dev`
3. Navigate to `/repositories` and try:
   - Creating a repository
   - Starring/unstarring
   - Filtering by genre
   - Sorting

---

## Missing Component: RepositoryCard

The RepositoriesClient uses `<RepositoryCard />` which might also be missing. If you get an error about it, you'll need to either:

1. Create a placeholder component
2. Restore it from the git history (commit `c315617`)
3. Replace it with a simpler div temporarily

---

## Quick Reference: Functions to Implement

### `lib/api/repos.ts`
- [ ] `getEnrichedRepos()` - Fetch user's repos
- [ ] `createRepo(name, isPrivate, description)` - Create new repo
- [ ] `starRepo(owner, repo)` - Star a repo
- [ ] `unstarRepo(owner, repo)` - Unstar a repo
- [ ] `deleteRepo(owner, repo)` - Delete a repo
- [ ] `renameRepo(owner, repo, newName)` - Rename a repo

### `lib/api/genre.ts`
- [ ] `getAllGenres()` - Fetch all genres
- [ ] `setRepoGenre(owner, repo, genreIds)` - Set repo genres

---

## Common Issues & Solutions

### Issue: "authenticatedFetch is not defined"
**Solution:** Make sure you import it:
```typescript
import { authenticatedFetch } from "@/lib/utils/authUtil";
```

### Issue: Backend returns 401 Unauthorized
**Solution:** Check that:
1. User is logged in
2. Cookies are set correctly
3. Backend accepts the Authorization header

### Issue: CORS errors
**Solution:** Add CORS middleware in your FastAPI backend:
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Issue: Response structure doesn't match
**Solution:** Add console.log to see actual response:
```typescript
const data = await response.json();
console.log("Backend response:", data);
return { success: true, data: data.repos }; // adjust based on log
```

---

## Next Steps

1. ✅ Read this guide
2. ⏳ Check your backend API endpoints
3. ⏳ Implement the 8 TODO functions
4. ⏳ Test each function individually
5. ⏳ Run `npm run build` to verify no TypeScript errors
6. ⏳ Test the UI in the browser

Good luck! The hard part (architecture and types) is done. You just need to connect the dots to your backend.
