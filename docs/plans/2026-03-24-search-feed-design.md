# Search and Feed Feature Design

**Date**: 2026-03-24
**Author**: Claude Code
**Status**: Approved

## Overview

This document describes the design for implementing a fully functional search and feed feature for the SoundHaus Explore page. This is a frontend-only implementation using mock data and React hooks, creating production-ready patterns while the backend API is under development.

## Goals

1. Enable users to search for music repositories by name and author
2. Display a feed of public repositories with sorting options
3. Implement infinite scroll for smooth browsing experience
4. Create reusable components and hooks for future features
5. Build patterns that require minimal refactoring when backend is ready

## Non-Goals

- Backend API implementation (deferred)
- Advanced filtering (genre, BPM, etc.) - deferred to future iteration
- Star/rating system - deferred to future iteration
- User authentication integration - already handled separately

## Architecture

### Approach: Mock Data with Client-Side Logic

We're using a mock data approach where all filtering, searching, and sorting happens in the browser using React's built-in hooks. This allows rapid frontend development without backend dependencies.

**Data Flow:**
```
Mock Data → Client-side filtering/search → UI State → Rendered Components
(static)     (useState/useEffect)         (local)    (Explore page)
```

### Key Architectural Decisions

1. **Mock Data Store** - Static TypeScript file with 50-100 sample repositories
2. **Component-Driven Design** - Match existing RepositoryCard component structure
3. **Reusable Hooks** - Custom hooks for debouncing and infinite scroll
4. **No External Libraries** - Use built-in React hooks (useState, useEffect, useRef)
5. **Future-Proof Patterns** - Easy migration path to real API

## Data Structure

### MockExploreRepository Interface

```typescript
interface MockExploreRepository {
  id: string;              // String ID for routing
  title: string;           // Repository name (e.g., "Summer Beats 2024")
  author: string;          // Owner username (e.g., "musicmaker")
  updatedAt: string;       // ISO timestamp (e.g., "2024-03-24T10:30:00Z")
  stats: {
    stars?: number;        // Optional - star count
    tracks: number;        // REQUIRED - number of audio files/tracks
    collaborators: number; // REQUIRED - number of collaborators
    commits?: number;      // Optional - commit count
  };
  isPublic?: boolean;      // Default true for explore page
}
```

This structure **exactly matches** the existing RepositoryCard component expectations, ensuring zero friction during integration.

### Mock Data Characteristics

50-100 sample repositories with:
- **Varied genres in titles**: Electronic, Hip Hop, Jazz, Rock, Classical, Lo-Fi, Techno
- **Collaboration sizes**: 1-10 collaborators
- **Track counts**: 3-30 tracks per repository
- **Star counts**: 0-500 stars
- **Creation dates**: Last 6 months spread
- **Realistic project names**: Mix of creative and descriptive titles

## Components

### 1. SearchBar Component

**File**: `components/SearchBar.tsx`

**Purpose**: Reusable search input with debouncing

**Props**:
```typescript
interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}
```

**Features**:
- Debounced input (500ms delay) using useDebounce hook
- Clear button (X icon) to reset search
- Search icon indicator
- Styled with existing Tailwind classes (`.input`)
- Accessible with proper ARIA labels

### 2. Explore Page (Updated)

**File**: `app/explore/page.tsx`

**State Management**:
```typescript
const [searchQuery, setSearchQuery] = useState('');
const [debouncedQuery, setDebouncedQuery] = useState('');
const [sortBy, setSortBy] = useState<'recent' | 'stars' | 'title'>('recent');
const [displayedRepos, setDisplayedRepos] = useState<MockExploreRepository[]>([]);
const [page, setPage] = useState(1);
const [hasMore, setHasMore] = useState(true);
```

**Responsibilities**:
- Import and filter mock repository data
- Handle search query updates
- Manage sort selection
- Implement pagination logic
- Render RepositoryCard components
- Show empty/end states

### 3. Custom Hooks

#### useDebounce Hook

**File**: `hooks/useDebounce.ts`

**Purpose**: Delay updating value until user stops typing

**Interface**:
```typescript
function useDebounce<T>(value: T, delay?: number): T
```

**Default delay**: 500ms

#### useInfiniteScroll Hook

**File**: `hooks/useInfiniteScroll.ts`

**Purpose**: Detect when user reaches bottom of page using Intersection Observer

**Interface**:
```typescript
function useInfiniteScroll(
  callback: () => void,
  hasMore: boolean
): React.RefObject<HTMLDivElement>
```

**Usage**: Attach ref to sentinel div at bottom of grid

## User Interactions

### Search Flow

1. User types in SearchBar
2. Input is debounced (500ms delay)
3. Debounced query triggers filtering
4. Repository list updates with matches
5. Clear button (X) resets search

### Sort Flow

1. User clicks sort button (Top/Recent/Trending)
2. Active button gets highlighted styling
3. Repository list re-sorts based on criteria:
   - **Top**: Sort by stars (descending)
   - **Recent**: Sort by updatedAt (newest first)
   - **Trending**: Same as Top (placeholder for now)

### Infinite Scroll Flow

1. Page loads with first 12 repositories
2. User scrolls to bottom
3. Sentinel element enters viewport
4. useInfiniteScroll triggers callback
5. Page increments, next 12 repositories load
6. Process repeats until no more results
7. "You've reached the end" message shown

## Implementation Details

### Filtering Logic

```typescript
const filteredRepos = mockExploreRepos.filter(repo => {
  if (!debouncedQuery) return true;
  const query = debouncedQuery.toLowerCase();
  return (
    repo.title.toLowerCase().includes(query) ||
    repo.author.toLowerCase().includes(query)
  );
});
```

### Sorting Logic

```typescript
const sortedRepos = [...filteredRepos].sort((a, b) => {
  switch (sortBy) {
    case 'recent':
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    case 'stars':
      return (b.stats.stars || 0) - (a.stats.stars || 0);
    case 'title':
      return a.title.localeCompare(b.title);
    default:
      return 0;
  }
});
```

### Pagination Logic

```typescript
const itemsPerPage = 12;
const paginatedRepos = sortedRepos.slice(0, page * itemsPerPage);
const hasMore = sortedRepos.length > paginatedRepos.length;

const loadMore = () => {
  if (hasMore) {
    setPage(prev => prev + 1);
  }
};
```

## UI States

### Empty States

- **No search results**: "No repositories found matching '{query}'"
- **No repositories at all**: "No repositories available"
- **End of results**: "You've reached the end" message

### Active States

- **Sort buttons**: Active button uses `.btn-primary` class
- **Search input**: Shows clear button when text entered
- **Infinite scroll**: Seamless loading without spinners (instant with mock data)

## Files Structure

### New Files

```
lib/mockData/
  └── repositories.ts          # Mock data + interface

components/
  └── SearchBar.tsx             # Search input component

hooks/
  ├── useDebounce.ts            # Debounce hook
  └── useInfiniteScroll.ts      # Infinite scroll hook
```

### Modified Files

```
app/explore/
  └── page.tsx                  # Replace placeholder UI with functional implementation
```

## Migration Path to Real API

When backend endpoints are ready, the transition is minimal:

### Step 1: Create API Client

Create `lib/api/explore.ts`:

```typescript
export async function getPublicRepositories(params: {
  search?: string;
  sort?: 'recent' | 'stars' | 'trending';
  page?: number;
  limit?: number;
}): Promise<Repository[]> {
  // Call FastAPI endpoint
}
```

### Step 2: Update Explore Page

Replace mock data import with API call:

```typescript
// Before (mock data)
import { mockExploreRepos } from '@/lib/mockData/repositories';

// After (real API)
import { getPublicRepositories } from '@/lib/api/explore';
const [loading, setLoading] = useState(false);
// Add useEffect to fetch data
```

### Step 3: No Changes Needed

These components remain unchanged:
- SearchBar.tsx
- useDebounce.ts
- useInfiniteScroll.ts
- RepositoryCard.tsx

## Multi-Branch Development Plan

The implementation is split into 4 incremental branches:

### Branch 1: `feature/mock-data-foundation`
- Create mock data infrastructure
- Files: `lib/mockData/repositories.ts`
- Size: Small, ~1 file, ~200-300 lines

### Branch 2: `feature/search-hooks`
- Build reusable custom hooks
- Files: `hooks/useDebounce.ts`, `hooks/useInfiniteScroll.ts`
- Size: Small, 2 files, ~100 lines total

### Branch 3: `feature/search-bar-component`
- Build SearchBar UI component
- Files: `components/SearchBar.tsx`
- Dependencies: Branch 2
- Size: Small, 1 file, ~80-100 lines

### Branch 4: `feature/explore-page-integration`
- Integrate everything into Explore page
- Files: `app/explore/page.tsx` (modified)
- Dependencies: Branches 1, 2, 3
- Size: Medium, ~150-200 lines changed

## Success Criteria

- [ ] User can search repositories by title and author
- [ ] Search input is debounced (no lag, no excessive filtering)
- [ ] User can sort by Top/Recent/Trending
- [ ] Infinite scroll loads 12 items initially, 12 more on scroll
- [ ] Empty states display appropriate messages
- [ ] All components use existing Tailwind styles
- [ ] Code is TypeScript strict-mode compliant
- [ ] Components are reusable and well-documented
- [ ] Migration to real API requires minimal changes

## Future Enhancements

- Advanced filtering (genre, BPM range, collaborator count)
- Star/rating system with user interactions
- Trending algorithm based on activity metrics
- Search suggestions/autocomplete
- Repository preview/quick view modal
- Waveform thumbnails in cards
- User profile integration
- Save/bookmark repositories

## Conclusion

This design provides a solid foundation for the search and feed feature using frontend-only implementation. The mock data approach allows rapid iteration while maintaining production-ready patterns that require minimal refactoring when the backend is ready.
