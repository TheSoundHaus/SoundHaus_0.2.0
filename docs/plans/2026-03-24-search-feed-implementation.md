# Search and Feed Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement search and feed functionality for the Explore page using mock data, custom hooks, and infinite scroll.

**Architecture:** Frontend-only implementation with mock data. Four incremental branches: (1) mock data foundation, (2) reusable hooks, (3) search component, (4) Explore page integration. Client-side filtering, sorting, and infinite scroll using React hooks.

**Tech Stack:** React, TypeScript, Next.js App Router, Tailwind CSS, Intersection Observer API

---

## Branch 1: feature/mock-data-foundation

### Task 1: Create Mock Data Infrastructure

**Files:**
- Create: `apps/web/lib/mockData/repositories.ts`

**Step 1: Create directory for mock data**

Run:
```bash
mkdir -p apps/web/lib/mockData
```

Expected: Directory created successfully

**Step 2: Create mock data file with interface and sample data**

Create `apps/web/lib/mockData/repositories.ts`:

```typescript
/**
 * Mock repository data for Explore page development
 * Structure matches RepositoryCard component expectations
 */

export interface MockExploreRepository {
  id: string;              // String ID for routing
  title: string;           // Repository name
  author: string;          // Owner username
  updatedAt: string;       // ISO timestamp
  stats: {
    stars?: number;        // Star count
    tracks: number;        // Number of audio files/tracks
    collaborators: number; // Number of collaborators
    commits?: number;      // Commit count
  };
  isPublic?: boolean;      // Default true for explore page
}

export const mockExploreRepos: MockExploreRepository[] = [
  {
    id: "1",
    title: "Summer Vibes Electronic Mix",
    author: "dj_luna",
    updatedAt: "2024-03-20T14:30:00Z",
    stats: {
      stars: 42,
      tracks: 12,
      collaborators: 3,
      commits: 47
    },
    isPublic: true
  },
  {
    id: "2",
    title: "Lo-Fi Hip Hop Beats",
    author: "chillbeats",
    updatedAt: "2024-03-19T09:15:00Z",
    stats: {
      stars: 128,
      tracks: 8,
      collaborators: 1,
      commits: 23
    },
    isPublic: true
  },
  {
    id: "3",
    title: "Jazz Fusion Experiment",
    author: "smooth_operator",
    updatedAt: "2024-03-18T16:45:00Z",
    stats: {
      stars: 67,
      tracks: 15,
      collaborators: 5,
      commits: 89
    },
    isPublic: true
  },
  {
    id: "4",
    title: "Dark Techno Sessions",
    author: "nightcrawler",
    updatedAt: "2024-03-17T22:00:00Z",
    stats: {
      stars: 203,
      tracks: 20,
      collaborators: 2,
      commits: 134
    },
    isPublic: true
  },
  {
    id: "5",
    title: "Acoustic Guitar Melodies",
    author: "stringmaster",
    updatedAt: "2024-03-16T11:20:00Z",
    stats: {
      stars: 89,
      tracks: 10,
      collaborators: 1,
      commits: 56
    },
    isPublic: true
  },
  {
    id: "6",
    title: "Ambient Soundscapes",
    author: "atmosphere_creator",
    updatedAt: "2024-03-15T08:30:00Z",
    stats: {
      stars: 156,
      tracks: 18,
      collaborators: 4,
      commits: 92
    },
    isPublic: true
  },
  {
    id: "7",
    title: "Trap Beats Collection",
    author: "beat_machine",
    updatedAt: "2024-03-14T19:10:00Z",
    stats: {
      stars: 245,
      tracks: 25,
      collaborators: 6,
      commits: 178
    },
    isPublic: true
  },
  {
    id: "8",
    title: "Classical Piano Compositions",
    author: "piano_virtuoso",
    updatedAt: "2024-03-13T15:40:00Z",
    stats: {
      stars: 312,
      tracks: 14,
      collaborators: 1,
      commits: 201
    },
    isPublic: true
  },
  {
    id: "9",
    title: "Indie Rock Garage Sessions",
    author: "garage_band",
    updatedAt: "2024-03-12T20:25:00Z",
    stats: {
      stars: 78,
      tracks: 16,
      collaborators: 4,
      commits: 112
    },
    isPublic: true
  },
  {
    id: "10",
    title: "Synthwave Retro Dreams",
    author: "retro_synth",
    updatedAt: "2024-03-11T12:50:00Z",
    stats: {
      stars: 189,
      tracks: 22,
      collaborators: 3,
      commits: 145
    },
    isPublic: true
  },
  {
    id: "11",
    title: "Deep House Grooves",
    author: "house_master",
    updatedAt: "2024-03-10T17:35:00Z",
    stats: {
      stars: 134,
      tracks: 13,
      collaborators: 2,
      commits: 87
    },
    isPublic: true
  },
  {
    id: "12",
    title: "Experimental Noise Project",
    author: "sonic_explorer",
    updatedAt: "2024-03-09T10:15:00Z",
    stats: {
      stars: 45,
      tracks: 9,
      collaborators: 7,
      commits: 234
    },
    isPublic: true
  },
  {
    id: "13",
    title: "R&B Vocal Tracks",
    author: "smooth_vocals",
    updatedAt: "2024-03-08T14:20:00Z",
    stats: {
      stars: 267,
      tracks: 11,
      collaborators: 5,
      commits: 156
    },
    isPublic: true
  },
  {
    id: "14",
    title: "Drum and Bass Energy",
    author: "dnb_warrior",
    updatedAt: "2024-03-07T21:45:00Z",
    stats: {
      stars: 198,
      tracks: 19,
      collaborators: 3,
      commits: 167
    },
    isPublic: true
  },
  {
    id: "15",
    title: "Folk Music Revival",
    author: "folk_tales",
    updatedAt: "2024-03-06T09:30:00Z",
    stats: {
      stars: 56,
      tracks: 7,
      collaborators: 2,
      commits: 34
    },
    isPublic: true
  },
  {
    id: "16",
    title: "EDM Festival Bangers",
    author: "festival_king",
    updatedAt: "2024-03-05T18:55:00Z",
    stats: {
      stars: 423,
      tracks: 28,
      collaborators: 8,
      commits: 289
    },
    isPublic: true
  },
  {
    id: "17",
    title: "Blues Guitar Licks",
    author: "blues_master",
    updatedAt: "2024-03-04T13:10:00Z",
    stats: {
      stars: 92,
      tracks: 12,
      collaborators: 1,
      commits: 67
    },
    isPublic: true
  },
  {
    id: "18",
    title: "Reggae Sunshine Rhythms",
    author: "island_vibes",
    updatedAt: "2024-03-03T16:40:00Z",
    stats: {
      stars: 145,
      tracks: 14,
      collaborators: 4,
      commits: 98
    },
    isPublic: true
  },
  {
    id: "19",
    title: "Metal Breakdown Riffs",
    author: "shredder",
    updatedAt: "2024-03-02T20:05:00Z",
    stats: {
      stars: 234,
      tracks: 17,
      collaborators: 5,
      commits: 201
    },
    isPublic: true
  },
  {
    id: "20",
    title: "Chillout Lounge Mix",
    author: "lounge_lizard",
    updatedAt: "2024-03-01T11:25:00Z",
    stats: {
      stars: 176,
      tracks: 21,
      collaborators: 2,
      commits: 134
    },
    isPublic: true
  },
  {
    id: "21",
    title: "Funk Bass Lines",
    author: "groove_master",
    updatedAt: "2024-02-29T15:50:00Z",
    stats: {
      stars: 112,
      tracks: 10,
      collaborators: 3,
      commits: 78
    },
    isPublic: true
  },
  {
    id: "22",
    title: "Orchestral Epic Scores",
    author: "composer_pro",
    updatedAt: "2024-02-28T09:15:00Z",
    stats: {
      stars: 389,
      tracks: 24,
      collaborators: 10,
      commits: 456
    },
    isPublic: true
  },
  {
    id: "23",
    title: "Minimal Techno Loops",
    author: "minimal_mind",
    updatedAt: "2024-02-27T19:30:00Z",
    stats: {
      stars: 87,
      tracks: 6,
      collaborators: 1,
      commits: 45
    },
    isPublic: true
  },
  {
    id: "24",
    title: "Soul Samples Library",
    author: "soul_searcher",
    updatedAt: "2024-02-26T14:45:00Z",
    stats: {
      stars: 201,
      tracks: 30,
      collaborators: 4,
      commits: 167
    },
    isPublic: true
  },
  {
    id: "25",
    title: "Progressive Trance Journey",
    author: "trance_master",
    updatedAt: "2024-02-25T22:10:00Z",
    stats: {
      stars: 278,
      tracks: 16,
      collaborators: 3,
      commits: 189
    },
    isPublic: true
  },
  {
    id: "26",
    title: "Country Road Songs",
    author: "country_star",
    updatedAt: "2024-02-24T10:35:00Z",
    stats: {
      stars: 63,
      tracks: 9,
      collaborators: 2,
      commits: 52
    },
    isPublic: true
  },
  {
    id: "27",
    title: "Dubstep Wobble Pack",
    author: "bass_cannon",
    updatedAt: "2024-02-23T17:20:00Z",
    stats: {
      stars: 345,
      tracks: 23,
      collaborators: 6,
      commits: 234
    },
    isPublic: true
  },
  {
    id: "28",
    title: "Latin Percussion Rhythms",
    author: "rhythm_section",
    updatedAt: "2024-02-22T13:55:00Z",
    stats: {
      stars: 129,
      tracks: 11,
      collaborators: 5,
      commits: 89
    },
    isPublic: true
  },
  {
    id: "29",
    title: "K-Pop Production Bundle",
    author: "pop_producer",
    updatedAt: "2024-02-21T21:40:00Z",
    stats: {
      stars: 412,
      tracks: 27,
      collaborators: 9,
      commits: 312
    },
    isPublic: true
  },
  {
    id: "30",
    title: "Meditation Sound Bath",
    author: "zen_sounds",
    updatedAt: "2024-02-20T08:15:00Z",
    stats: {
      stars: 98,
      tracks: 5,
      collaborators: 1,
      commits: 34
    },
    isPublic: true
  },
  {
    id: "31",
    title: "Punk Rock Anthems",
    author: "rebel_noise",
    updatedAt: "2024-02-19T16:25:00Z",
    stats: {
      stars: 156,
      tracks: 13,
      collaborators: 4,
      commits: 112
    },
    isPublic: true
  },
  {
    id: "32",
    title: "Afrobeat Dance Grooves",
    author: "afro_rhythm",
    updatedAt: "2024-02-18T12:50:00Z",
    stats: {
      stars: 223,
      tracks: 18,
      collaborators: 7,
      commits: 178
    },
    isPublic: true
  },
  {
    id: "33",
    title: "Cinematic Trailer Music",
    author: "epic_composer",
    updatedAt: "2024-02-17T20:15:00Z",
    stats: {
      stars: 467,
      tracks: 20,
      collaborators: 6,
      commits: 289
    },
    isPublic: true
  },
  {
    id: "34",
    title: "Breakbeat Classics",
    author: "break_master",
    updatedAt: "2024-02-16T11:40:00Z",
    stats: {
      stars: 134,
      tracks: 15,
      collaborators: 2,
      commits: 98
    },
    isPublic: true
  },
  {
    id: "35",
    title: "Celtic Folk Melodies",
    author: "celtic_harp",
    updatedAt: "2024-02-15T18:05:00Z",
    stats: {
      stars: 76,
      tracks: 8,
      collaborators: 3,
      commits: 56
    },
    isPublic: true
  },
  {
    id: "36",
    title: "Future Bass Drops",
    author: "future_sound",
    updatedAt: "2024-02-14T14:30:00Z",
    stats: {
      stars: 289,
      tracks: 19,
      collaborators: 5,
      commits: 201
    },
    isPublic: true
  },
  {
    id: "37",
    title: "Gospel Choir Harmonies",
    author: "harmony_voices",
    updatedAt: "2024-02-13T09:55:00Z",
    stats: {
      stars: 187,
      tracks: 12,
      collaborators: 12,
      commits: 145
    },
    isPublic: true
  },
  {
    id: "38",
    title: "Hardstyle Kicks Collection",
    author: "hard_hitter",
    updatedAt: "2024-02-12T22:20:00Z",
    stats: {
      stars: 312,
      tracks: 26,
      collaborators: 4,
      commits: 234
    },
    isPublic: true
  },
  {
    id: "39",
    title: "Industrial Noise Textures",
    author: "noise_factory",
    updatedAt: "2024-02-11T15:45:00Z",
    stats: {
      stars: 92,
      tracks: 14,
      collaborators: 3,
      commits: 123
    },
    isPublic: true
  },
  {
    id: "40",
    title: "Salsa Dancing Tracks",
    author: "salsa_king",
    updatedAt: "2024-02-10T19:10:00Z",
    stats: {
      stars: 167,
      tracks: 17,
      collaborators: 6,
      commits: 134
    },
    isPublic: true
  },
  {
    id: "41",
    title: "Vaporwave Aesthetic",
    author: "retro_wave",
    updatedAt: "2024-02-09T10:35:00Z",
    stats: {
      stars: 245,
      tracks: 11,
      collaborators: 2,
      commits: 167
    },
    isPublic: true
  },
  {
    id: "42",
    title: "Ska Punk Energy",
    author: "ska_squad",
    updatedAt: "2024-02-08T17:00:00Z",
    stats: {
      stars: 78,
      tracks: 10,
      collaborators: 5,
      commits: 89
    },
    isPublic: true
  },
  {
    id: "43",
    title: "Trap Soul Vocals",
    author: "trap_soul",
    updatedAt: "2024-02-07T13:25:00Z",
    stats: {
      stars: 356,
      tracks: 22,
      collaborators: 7,
      commits: 278
    },
    isPublic: true
  },
  {
    id: "44",
    title: "Psytrance Forest Sounds",
    author: "forest_trance",
    updatedAt: "2024-02-06T21:50:00Z",
    stats: {
      stars: 198,
      tracks: 15,
      collaborators: 4,
      commits: 156
    },
    isPublic: true
  },
  {
    id: "45",
    title: "Baroque Chamber Music",
    author: "classical_ensemble",
    updatedAt: "2024-02-05T08:15:00Z",
    stats: {
      stars: 123,
      tracks: 9,
      collaborators: 8,
      commits: 201
    },
    isPublic: true
  },
  {
    id: "46",
    title: "Grime MC Beats",
    author: "grime_time",
    updatedAt: "2024-02-04T16:40:00Z",
    stats: {
      stars: 267,
      tracks: 21,
      collaborators: 3,
      commits: 189
    },
    isPublic: true
  },
  {
    id: "47",
    title: "New Wave Synth Pop",
    author: "new_wave",
    updatedAt: "2024-02-03T12:05:00Z",
    stats: {
      stars: 145,
      tracks: 13,
      collaborators: 2,
      commits: 112
    },
    isPublic: true
  },
  {
    id: "48",
    title: "Flamenco Guitar Passion",
    author: "flamenco_fire",
    updatedAt: "2024-02-02T19:30:00Z",
    stats: {
      stars: 89,
      tracks: 7,
      collaborators: 1,
      commits: 67
    },
    isPublic: true
  },
  {
    id: "49",
    title: "Glitch Hop Experiments",
    author: "glitch_artist",
    updatedAt: "2024-02-01T14:55:00Z",
    stats: {
      stars: 234,
      tracks: 16,
      collaborators: 5,
      commits: 178
    },
    isPublic: true
  },
  {
    id: "50",
    title: "Bluegrass Banjo Picking",
    author: "banjo_picker",
    updatedAt: "2024-01-31T10:20:00Z",
    stats: {
      stars: 67,
      tracks: 8,
      collaborators: 3,
      commits: 45
    },
    isPublic: true
  }
];
```

**Step 3: Verify TypeScript compilation**

Run:
```bash
cd apps/web && npx tsc --noEmit lib/mockData/repositories.ts
```

Expected: No TypeScript errors

**Step 4: Commit mock data foundation**

Run:
```bash
git add apps/web/lib/mockData/repositories.ts
git commit -m "feat: add mock repository data for Explore page

- Create MockExploreRepository interface matching RepositoryCard structure
- Add 50 sample repositories with varied genres and stats
- Data includes realistic titles, authors, timestamps, and metrics

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Expected: Commit created successfully

---

## Branch 2: feature/search-hooks

### Task 2: Create useDebounce Hook

**Files:**
- Create: `apps/web/hooks/useDebounce.ts`

**Step 1: Create hooks directory**

Run:
```bash
mkdir -p apps/web/hooks
```

Expected: Directory created successfully

**Step 2: Create useDebounce hook**

Create `apps/web/hooks/useDebounce.ts`:

```typescript
import { useState, useEffect } from 'react';

/**
 * Delays updating value until user stops typing
 *
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default: 500ms)
 * @returns Debounced value
 *
 * @example
 * const [searchQuery, setSearchQuery] = useState('');
 * const debouncedQuery = useDebounce(searchQuery, 500);
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up timeout to update debounced value after delay
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Clean up timeout if value changes before delay completes
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
```

**Step 3: Verify TypeScript compilation**

Run:
```bash
cd apps/web && npx tsc --noEmit hooks/useDebounce.ts
```

Expected: No TypeScript errors

**Step 4: Commit useDebounce hook**

Run:
```bash
git add apps/web/hooks/useDebounce.ts
git commit -m "feat: add useDebounce hook for search input

- Generic debounce hook with configurable delay
- Default 500ms delay prevents excessive filtering
- Proper cleanup on unmount

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Expected: Commit created successfully

---

### Task 3: Create useInfiniteScroll Hook

**Files:**
- Create: `apps/web/hooks/useInfiniteScroll.ts`

**Step 1: Create useInfiniteScroll hook**

Create `apps/web/hooks/useInfiniteScroll.ts`:

```typescript
import { useEffect, useRef } from 'react';

/**
 * Detects when user reaches bottom of page using Intersection Observer
 *
 * @param callback - Function to call when sentinel enters viewport
 * @param hasMore - Whether there are more items to load
 * @returns Ref to attach to sentinel element
 *
 * @example
 * const loadMore = () => setPage(prev => prev + 1);
 * const sentinelRef = useInfiniteScroll(loadMore, hasMore);
 *
 * // In JSX:
 * <div ref={sentinelRef} />
 */
export function useInfiniteScroll(
  callback: () => void,
  hasMore: boolean
): React.RefObject<HTMLDivElement> {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Don't set up observer if no more items to load
    if (!hasMore) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    // Create Intersection Observer
    const observer = new IntersectionObserver(
      (entries) => {
        // Call callback when sentinel enters viewport
        if (entries[0].isIntersecting) {
          callback();
        }
      },
      {
        // Trigger when sentinel is 100px from entering viewport
        rootMargin: '100px',
      }
    );

    // Start observing
    observer.observe(sentinel);

    // Clean up observer on unmount or when dependencies change
    return () => {
      observer.disconnect();
    };
  }, [callback, hasMore]);

  return sentinelRef;
}
```

**Step 2: Verify TypeScript compilation**

Run:
```bash
cd apps/web && npx tsc --noEmit hooks/useInfiniteScroll.ts
```

Expected: No TypeScript errors

**Step 3: Commit useInfiniteScroll hook**

Run:
```bash
git add apps/web/hooks/useInfiniteScroll.ts
git commit -m "feat: add useInfiniteScroll hook with Intersection Observer

- Detects when user reaches bottom of page
- Configurable rootMargin for preloading
- Proper cleanup on unmount
- Only observes when hasMore is true

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Expected: Commit created successfully

---

## Branch 3: feature/search-bar-component

### Task 4: Create SearchBar Component

**Files:**
- Create: `apps/web/components/SearchBar.tsx`

**Step 1: Create SearchBar component**

Create `apps/web/components/SearchBar.tsx`:

```typescript
'use client';

import { useDebounce } from '@/hooks/useDebounce';
import { useState, useEffect } from 'react';

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Search input component with debouncing
 *
 * Features:
 * - Debounced onChange (500ms delay)
 * - Clear button when text is entered
 * - Search icon indicator
 * - Accessible with ARIA labels
 */
export function SearchBar({
  value,
  onChange,
  placeholder = 'Search repositories...',
  className = '',
}: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value);
  const debouncedValue = useDebounce(localValue, 500);

  // Sync debounced value to parent
  useEffect(() => {
    onChange(debouncedValue);
  }, [debouncedValue, onChange]);

  // Sync external value changes to local state
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleClear = () => {
    setLocalValue('');
  };

  return (
    <div className={`relative ${className}`}>
      {/* Search Icon */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-glass-blue-400">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      {/* Input */}
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
        className="input w-full pl-10 pr-10"
        aria-label="Search repositories"
      />

      {/* Clear Button */}
      {localValue && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-glass-blue-400 hover:text-glass-blue-300 transition-colors"
          aria-label="Clear search"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
```

**Step 2: Verify TypeScript compilation**

Run:
```bash
cd apps/web && npx tsc --noEmit components/SearchBar.tsx
```

Expected: No TypeScript errors

**Step 3: Commit SearchBar component**

Run:
```bash
git add apps/web/components/SearchBar.tsx
git commit -m "feat: add SearchBar component with debouncing

- Debounced onChange with 500ms delay
- Clear button to reset search
- Search icon indicator
- Accessible with ARIA labels
- Uses existing Tailwind .input class

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Expected: Commit created successfully

---

## Branch 4: feature/explore-page-integration

### Task 5: Integrate Search and Feed into Explore Page

**Files:**
- Modify: `apps/web/app/explore/page.tsx`

**Step 1: Read current Explore page**

Run:
```bash
cat apps/web/app/explore/page.tsx
```

Expected: See current placeholder implementation

**Step 2: Replace Explore page with functional implementation**

Replace entire contents of `apps/web/app/explore/page.tsx`:

```typescript
'use client';

import { useState, useMemo } from 'react';
import { SearchBar } from '@/components/SearchBar';
import { RepositoryCard } from '@/components/RepositoryCard';
import { useDebounce } from '@/hooks/useDebounce';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { mockExploreRepos, MockExploreRepository } from '@/lib/mockData/repositories';

type SortOption = 'recent' | 'stars' | 'trending';

export default function ExplorePage() {
  // State management
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 500);
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [page, setPage] = useState(1);

  const itemsPerPage = 12;

  // Filter repositories by search query
  const filteredRepos = useMemo(() => {
    if (!debouncedQuery) return mockExploreRepos;

    const query = debouncedQuery.toLowerCase();
    return mockExploreRepos.filter(
      (repo) =>
        repo.title.toLowerCase().includes(query) ||
        repo.author.toLowerCase().includes(query)
    );
  }, [debouncedQuery]);

  // Sort filtered repositories
  const sortedRepos = useMemo(() => {
    const repos = [...filteredRepos];

    switch (sortBy) {
      case 'recent':
        return repos.sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      case 'stars':
      case 'trending': // Trending uses stars for now (placeholder)
        return repos.sort((a, b) => (b.stats.stars || 0) - (a.stats.stars || 0));
      default:
        return repos;
    }
  }, [filteredRepos, sortBy]);

  // Paginate sorted repositories
  const paginatedRepos = useMemo(() => {
    return sortedRepos.slice(0, page * itemsPerPage);
  }, [sortedRepos, page]);

  const hasMore = paginatedRepos.length < sortedRepos.length;

  // Load more repositories on scroll
  const loadMore = () => {
    if (hasMore) {
      setPage((prev) => prev + 1);
    }
  };

  const sentinelRef = useInfiniteScroll(loadMore, hasMore);

  // Reset pagination when search or sort changes
  useMemo(() => {
    setPage(1);
  }, [debouncedQuery, sortBy]);

  return (
    <div className="min-h-screen bg-midnight-950">
      {/* Header */}
      <div className="bg-navy-900/50 backdrop-blur-sm border-b border-glass-blue-500/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-4xl font-bold bg-gradient-chromatic bg-clip-text text-transparent mb-2">
            Explore
          </h1>
          <p className="text-glass-blue-200">
            Discover music projects from the community
          </p>
        </div>
      </div>

      {/* Search and Sort Controls */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
          {/* Search Bar */}
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by title or author..."
            className="w-full sm:w-96"
          />

          {/* Sort Buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy('recent')}
              className={
                sortBy === 'recent'
                  ? 'btn-primary'
                  : 'btn-secondary'
              }
            >
              Recent
            </button>
            <button
              onClick={() => setSortBy('stars')}
              className={
                sortBy === 'stars'
                  ? 'btn-primary'
                  : 'btn-secondary'
              }
            >
              Top
            </button>
            <button
              onClick={() => setSortBy('trending')}
              className={
                sortBy === 'trending'
                  ? 'btn-primary'
                  : 'btn-secondary'
              }
            >
              Trending
            </button>
          </div>
        </div>

        {/* Results Count */}
        <div className="text-glass-blue-300 text-sm mb-4">
          {debouncedQuery ? (
            <>
              Showing {paginatedRepos.length} of {sortedRepos.length} results
              for &quot;{debouncedQuery}&quot;
            </>
          ) : (
            <>Showing {paginatedRepos.length} repositories</>
          )}
        </div>

        {/* Repository Grid */}
        {paginatedRepos.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedRepos.map((repo) => (
              <RepositoryCard key={repo.id} repository={repo} />
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="text-center py-12">
            <div className="text-glass-blue-400 text-lg mb-2">
              No repositories found
            </div>
            {debouncedQuery && (
              <div className="text-glass-blue-500 text-sm">
                Try a different search term
              </div>
            )}
          </div>
        )}

        {/* Infinite Scroll Sentinel */}
        {hasMore && <div ref={sentinelRef} className="h-10" />}

        {/* End of Results Message */}
        {!hasMore && paginatedRepos.length > 0 && (
          <div className="text-center py-8 text-glass-blue-500 text-sm">
            You&apos;ve reached the end
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Verify TypeScript compilation**

Run:
```bash
cd apps/web && npx tsc --noEmit app/explore/page.tsx
```

Expected: No TypeScript errors

**Step 4: Test in browser**

Run:
```bash
cd apps/web && npm run dev
```

Then visit: `http://localhost:3000/explore`

Expected:
- Page loads with 12 repositories
- Search bar filters by title/author
- Sort buttons change order
- Scrolling loads more repositories
- Empty state shows when no results

**Step 5: Commit Explore page integration**

Run:
```bash
git add apps/web/app/explore/page.tsx
git commit -m "feat: integrate search and feed into Explore page

- Replace placeholder UI with functional implementation
- Add search with debounced filtering by title/author
- Add sort buttons (Recent/Top/Trending)
- Implement infinite scroll loading 12 items at a time
- Add empty states and end-of-results messaging
- Display results count with search query
- Responsive grid layout for repository cards

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Expected: Commit created successfully

---

## Testing Checklist

After all tasks are complete, verify the following:

### Functionality
- [ ] Search filters repositories by title
- [ ] Search filters repositories by author
- [ ] Search input is debounced (no lag when typing)
- [ ] Clear button (X) resets search
- [ ] "Recent" sort shows newest repositories first
- [ ] "Top" sort shows highest starred repositories first
- [ ] "Trending" sort works (same as Top for now)
- [ ] Initially loads 12 repositories
- [ ] Scrolling to bottom loads 12 more
- [ ] Infinite scroll stops when all results shown
- [ ] "You've reached the end" message appears
- [ ] Empty state shows when no search results
- [ ] Results count updates correctly

### UI/UX
- [ ] Search icon appears in search bar
- [ ] Clear button only shows when text entered
- [ ] Active sort button is highlighted
- [ ] Repository cards display correctly
- [ ] Grid layout is responsive (1/2/3 columns)
- [ ] Styling matches existing design system
- [ ] Accessibility: keyboard navigation works
- [ ] Accessibility: ARIA labels present

### Code Quality
- [ ] No TypeScript errors
- [ ] No console warnings
- [ ] Code follows existing patterns
- [ ] Components are properly typed
- [ ] Hooks handle cleanup correctly
- [ ] All files use 4-space indentation
- [ ] No trailing whitespace

### Git
- [ ] All 4 branches created
- [ ] Each commit has descriptive message
- [ ] Commits follow conventional format
- [ ] No merge conflicts

---

## Branch Merge Order

Merge branches in this order:

1. `feature/mock-data-foundation` → `main`
2. `feature/search-hooks` → `main`
3. `feature/search-bar-component` → `main`
4. `feature/explore-page-integration` → `main`

Or create a single PR combining all branches if preferred.

---

## Future Enhancements

After this implementation is complete, consider:

1. **Backend Integration**
   - Create FastAPI endpoints for public repository listing
   - Replace mock data with real API calls
   - Add pagination support in backend

2. **Advanced Features**
   - Genre/tag filtering
   - BPM range filtering
   - Date range filtering
   - Star/rating system
   - Trending algorithm (activity-based)

3. **Performance**
   - Add React Query for caching
   - Virtual scrolling for large lists
   - Image lazy loading

4. **UX Improvements**
   - Search suggestions/autocomplete
   - Filter sidebar
   - Repository preview modal
   - Waveform thumbnails
   - Save/bookmark functionality

---

## Notes for Engineer

- **DRY**: Reuse existing components (RepositoryCard, Tailwind classes)
- **YAGNI**: Don't add features not in the plan (no genre filters yet)
- **TDD**: Not applicable for this UI-heavy task, but test manually
- **Frequent commits**: Commit after each task completion
- **Read the docs**: Check `SOUNDHAUS.md` for context if needed
- **Check existing types**: Use types from `types/repository.ts` if compatible
- **Follow patterns**: Match code style in existing components
- **4-space indentation**: Project standard
- **No trailing whitespace**: Run linter if needed
