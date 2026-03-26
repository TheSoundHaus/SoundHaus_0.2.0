# Backend Repository Search Design

**Date:** 2026-03-26
**Author:** Claude Code
**Status:** Approved
**Branch:** backend-search-endpoint

## Overview

This design document describes the implementation of backend-powered search functionality for public Gitea repositories in the SoundHaus explore page. Users will be able to search for repositories by name, with results sorted by popularity (stars), enriched with SoundHaus metadata, and delivered via infinite scroll.

## Requirements

### Functional Requirements
- Users can search public repositories by repository name
- Search results are sorted by star count (popularity) by default
- Results support infinite scroll pagination (limit/offset)
- Results include SoundHaus metadata: genres, audio snippets, clone counts
- Search is performed on the backend via a new API endpoint

### Non-Functional Requirements
- Search response time < 2 seconds for typical queries
- Support up to 120 requests/minute for authenticated users
- Graceful degradation when Gitea service is unavailable
- Maintain data freshness (no caching, real-time queries)

## Architecture

### Approach: Dedicated Search Endpoint with Gitea Integration

We chose a dedicated `/repos/search` endpoint that leverages Gitea's built-in search API and enriches results with SoundHaus metadata from Supabase. This approach provides:
- Real-time search using Gitea's indexed search capabilities
- Clean separation between browsing (`/repos/public`) and searching
- Scalability without complex caching infrastructure
- Fresh data without staleness concerns

### Alternative Approaches Considered

**Approach 2: Enhanced Public Repos Endpoint**
- Modify existing `/repos/public` to accept optional search parameter
- Rejected: Mixing browse and search concerns in one endpoint reduces flexibility

**Approach 3: Cached Public Repos with Background Jobs**
- Cache all public repos in Supabase and search directly
- Rejected: Additional complexity, staleness issues, and higher initial implementation cost

## Data Flow

### Request Flow Diagram

```
User types "techno" in search box
    ↓
Frontend calls: GET /repos/search?q=techno&limit=20&offset=0
    ↓
FastAPI router → RepoService.search_public_repos()
    ↓
GiteaAdminService.search_repos(query="techno", limit=20, offset=0, public_only=True)
    ↓
Gitea API: GET /api/v1/repos/search?q=techno&limit=20&page=1&exclusive=true
    ↓
Returns: [{id: 123, full_name: "user1/techno-beats", name: "techno-beats", ...}, ...]
    ↓
Extract gitea_ids: ["user1/techno-beats", "user2/dark-techno", ...]
    ↓
Batch query Supabase: SELECT * FROM repo_data WHERE gitea_id IN (...)
    ↓
Build enriched response with: Gitea data + RepoData (genres, clone_count, audio_snippet)
    ↓
Sort by stars_count (from Gitea) or clone_count (from Supabase) or updated_at
    ↓
Return JSON: {success: true, repos: [...], total: 45, has_more: true}
    ↓
Frontend displays results in explore page
```

### API Endpoint Specification

**Endpoint:** `GET /repos/search`

**Query Parameters:**
- `q` (string, required): Search query for repository names
- `limit` (int, optional, default=20): Number of results per page (1-100)
- `offset` (int, optional, default=0): Pagination offset for infinite scroll
- `sort` (string, optional, default="stars"): Sort order - "stars", "updated", "clones"

**Response Schema:**
```json
{
  "success": true,
  "repos": [
    {
      "gitea_id": "uuid-123/techno-beats",
      "owner": "uuid-123",
      "owner_username": "producer_mike",
      "repo_name": "techno-beats",
      "description": "Dark techno project",
      "stars_count": 42,
      "updated_at": "2026-03-20T10:30:00Z",
      "clone_count": 15,
      "audio_snippet": "https://spaces.digitalocean.com/...",
      "snippet_metadata": {
        "duration": 30.5,
        "format": "mp3",
        "sample_rate": 44100,
        "file_size": 2048000,
        "channels": 2
      },
      "genres": ["Techno", "Electronic"],
      "clone_url": "https://gitea.soundhaus.app/uuid-123/techno-beats.git"
    }
  ],
  "total": 45,
  "has_more": true,
  "offset": 0,
  "limit": 20
}
```

### Key Design Decisions

1. **Batch Query for RepoData**: Use `WHERE gitea_id IN (...)` to fetch all metadata in a single query, avoiding N+1 problem
2. **Owner Username Mapping**: Join with Profile table to resolve UUID → username for display
3. **Pagination Support**: Include `has_more` boolean to enable infinite scroll UI
4. **Default Limit**: 20 results per page balances response size and user experience
5. **Partial Data Handling**: If RepoData is missing for a Gitea repo, include it with null SoundHaus fields (allows discovery of unclaimed repos)

## Error Handling & Edge Cases

### Error Scenarios

1. **Empty search query**
   - Validation: Require `q` parameter to be non-empty
   - Response: `400 Bad Request` with message "Search query cannot be empty"

2. **Gitea service unavailable**
   - Catch `requests.RequestException` in GiteaAdminService
   - Response: `503 Service Unavailable` with message "Search service temporarily unavailable"
   - Log error for monitoring

3. **No results found**
   - Valid scenario, not an error
   - Response: `200 OK` with `{success: true, repos: [], total: 0, has_more: false}`

4. **Invalid pagination parameters**
   - Validate: `limit` between 1-100, `offset` >= 0
   - Response: `400 Bad Request` with specific validation message

5. **Database connection failure**
   - Catch database exceptions when querying RepoData
   - Response: `500 Internal Server Error` with generic message
   - Log detailed error server-side

6. **Partial data availability**
   - If Gitea returns repos but some RepoData entries are missing (repo not registered in SoundHaus)
   - Strategy: Include repo with null values for SoundHaus-specific fields (genres, audio_snippet, clone_count = 0)
   - This allows discovery of repos that haven't been "claimed" yet

### Rate Limiting

- Unauthenticated users: `@limiter.limit("60/minute")`
- Authenticated users: `@user_limiter.limit("120/minute")`

### Logging Strategy

- Log each search query (sanitized) with response time for analytics
- Log errors with full context (query, user_id if available, stack trace)
- Use structured logging: `logger.info("search_repos", query=q, result_count=len(repos), duration_ms=duration)`

## Frontend Integration

### Web App Changes

**Files to Modify:**
- `apps/web/app/(dashboard)/explore/page.tsx` - Replace mock data with API calls
- `apps/web/lib/api/repos.ts` - Add `searchPublicRepos()` function
- `apps/web/types/repository.ts` - Update types to match API schema

### API Client Function

Create `searchPublicRepos()` in `apps/web/lib/api/repos.ts`:
```typescript
export async function searchPublicRepos(
  query: string,
  limit: number = 20,
  offset: number = 0,
  sort: 'stars' | 'updated' | 'clones' = 'stars'
): Promise<SearchReposResponse>
```

### Component Updates

1. **Replace mock data with real API calls**
   - Remove `mockExploreRepos` import
   - Add API call to `searchPublicRepos()` when component mounts or search query changes

2. **Search input behavior**
   - Use debouncing (300ms delay) to avoid excessive API calls as user types
   - Use existing `useDebounce` hook from `apps/web/hooks/useDebounce.ts`
   - Trigger search on Enter key or after debounce timeout
   - Show loading spinner during search

3. **Infinite scroll implementation**
   - Use existing `useInfiniteScroll` hook from `apps/web/hooks/useInfiniteScroll.ts`
   - When user scrolls near bottom, increment offset and fetch next page
   - Append new results to existing list
   - Stop fetching when `has_more === false`

4. **State management**
   ```typescript
   const [repos, setRepos] = useState([])
   const [searchQuery, setSearchQuery] = useState("")
   const [isLoading, setIsLoading] = useState(false)
   const [hasMore, setHasMore] = useState(true)
   const [offset, setOffset] = useState(0)
   ```

5. **Sort filter integration**
   - Map UI buttons to API sort parameter:
     - "Top Rated" → `sort=stars`
     - "Recent" → `sort=updated`
     - "Trending" → Calculate client-side or add "Most Cloned" → `sort=clones`

### Empty States & Error Handling

**Empty States:**
- No search query: Show initial trending/top repos (call with empty query or use existing `/repos/public` endpoint)
- No results found: Display existing "No projects found" message
- Loading: Show skeleton cards or spinner

**Error Handling:**
- Network errors: Show toast notification "Unable to load results. Please try again."
- 503 errors: Show "Search service temporarily unavailable"
- Retry button for failed requests

## Implementation Files

### Backend Files to Create/Modify

1. **`apps/backend/routers/repos.py`**
   - Add `@router.get("/repos/search")` endpoint
   - Validate query parameters
   - Call `RepoService.search_public_repos()`
   - Return enriched results

2. **`apps/backend/services/repo_service.py`**
   - Add `search_public_repos(query, limit, offset, sort)` method
   - Call `GiteaAdminService.search_repos()`
   - Batch fetch RepoData and Profile data
   - Enrich and sort results

3. **`apps/backend/services/gitea_service.py`**
   - Add `search_repos(query, limit, page, public_only)` method
   - Call Gitea's `/api/v1/repos/search` API
   - Return parsed results

4. **`apps/backend/models/schemas.py`**
   - Add `SearchReposResponse` Pydantic model
   - Add `SearchRepoItem` Pydantic model

### Frontend Files to Create/Modify

1. **`apps/web/lib/api/repos.ts`**
   - Add `searchPublicRepos()` function

2. **`apps/web/app/(dashboard)/explore/page.tsx`**
   - Replace mock data with API integration
   - Implement debounced search
   - Implement infinite scroll
   - Handle loading and error states

3. **`apps/web/types/repository.ts`**
   - Update types to match backend schema

## Testing Strategy

### Backend Tests

1. **Unit Tests** (`apps/backend/tests/supabase/repo_search/`)
   - Test `search_repos()` with various queries
   - Test pagination (limit/offset)
   - Test sorting by stars, updated, clones
   - Test empty query validation
   - Test invalid parameters

2. **Integration Tests**
   - Test full flow: API → Gitea → Supabase → Response
   - Test with missing RepoData entries
   - Test with network failures (mock Gitea unavailable)

### Frontend Tests

1. **Component Tests**
   - Test search input triggers API call
   - Test debouncing behavior
   - Test infinite scroll loading
   - Test error states display correctly

2. **Manual Testing**
   - Search for existing repos
   - Verify results match query
   - Test infinite scroll by scrolling to bottom
   - Test sort filters change order
   - Test empty state when no results

## Performance Considerations

### Expected Performance

- **Gitea Search API**: ~200-500ms for typical queries
- **Supabase Batch Query**: ~50-100ms for 20 repos
- **Profile Lookup**: ~30-50ms for username mapping
- **Total Response Time**: ~300-650ms (well under 2s target)

### Optimization Opportunities (Future)

1. **Caching**: Add Redis cache for popular search queries (TTL: 5 minutes)
2. **Database Indexes**: Ensure `repo_data.gitea_id` and `profiles.id` are indexed
3. **Connection Pooling**: Verify Supabase connection pool is properly configured
4. **Parallel Queries**: Execute Gitea search and initial RepoData fetch in parallel (requires restructuring)

## Security Considerations

- Rate limiting prevents abuse
- Only public repositories are returned (filter by `private: false`)
- No authentication required for search (public feature)
- Input validation prevents injection attacks
- Sanitize search queries before logging

## Rollout Plan

### Phase 1: Backend Implementation
1. Implement Gitea search integration
2. Add `/repos/search` endpoint
3. Write unit tests
4. Deploy to staging environment
5. Manual testing via Postman/curl

### Phase 2: Frontend Integration
6. Implement API client function
7. Update explore page component
8. Test infinite scroll and debouncing
9. Deploy to staging environment
10. User acceptance testing

### Phase 3: Production Deployment
11. Monitor error rates and response times
12. Gradual rollout (canary deployment if supported)
13. Collect user feedback
14. Iterate on performance and UX

## Success Metrics

- Search response time < 2 seconds (p95)
- Error rate < 1%
- User engagement: % of explore page visitors using search
- Search result relevance: user clicks on top 5 results > 70%

## Future Enhancements

1. **Enhanced Search Scope**: Add description, genre, and owner username search
2. **Full-Text Search**: Implement PostgreSQL full-text search on cached repo data
3. **Search Analytics**: Track popular queries and suggest autocomplete
4. **Advanced Filters**: Filter by genre, date range, clone count thresholds
5. **Fuzzy Matching**: Handle typos and partial matches better
6. **Search Highlighting**: Highlight matching terms in results

## References

- Gitea API Documentation: https://docs.gitea.io/en-us/api-usage/
- Existing `/repos/public` endpoint: `apps/backend/routers/repos.py:268`
- Explore page implementation: `apps/web/app/(dashboard)/explore/page.tsx`
- SOUNDHAUS.md Design Overview: `SOUNDHAUS.md:89`
