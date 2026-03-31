# Explore Page Redesign - GitHub-Inspired Three-Column Layout

**Date:** 2026-03-25
**Status:** Approved
**Target:** Web Application (`apps/web/app/(dashboard)/explore/page.tsx`)

## Overview

Redesign the Explore page to follow GitHub's Explore page layout with a three-column structure: profile card (left), repository feed (center, 50% width), and trending repositories (right).

## Design Requirements

### User Requirements
- Left sidebar: Profile card with avatar, username, starred repo count
- Center column: 50% of screen width, vertical card layout for repositories
- Right sidebar: Top 5 trending repositories
- Search bar: Positioned at top of center column
- Data source: Use existing mock data from `lib/mockData/repositories.ts`

### Layout Approach
**Fixed Three-Column Grid** with sticky sidebars and responsive breakpoints.

## Page Structure

### 1. Grid Layout

```
┌─────────────────────────────────────────────────────────┐
│                     Page Container                       │
│  ┌──────────┬──────────────────────────┬──────────────┐ │
│  │  Left    │    Center Feed (50%)     │    Right     │ │
│  │  (25%)   │                          │    (25%)     │ │
│  │          │                          │              │ │
│  │ Profile  │  Search + Filter         │  Trending    │ │
│  │  Card    │  Repository Cards        │   Repos      │ │
│  │ (Sticky) │  (Scrollable)            │  (Sticky)    │ │
│  └──────────┴──────────────────────────┴──────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Grid Specification:**
- Container: `grid-cols-[25%_50%_25%]` on desktop (1024px+)
- Gap: `gap-6` (24px between columns)
- Max width: `max-w-[1400px]` centered with `mx-auto`
- Padding: `px-6 py-8`

**Sticky Behavior:**
- Left and right sidebars: `sticky top-6`
- Center column: Normal flow, scrolls naturally
- Max height for sticky elements: `max-h-[calc(100vh-3rem)]` with `overflow-y-auto`

### 2. Left Sidebar: Profile Card

**Content:**
- Avatar image (circular, 80px diameter)
- Username (text-lg, font-semibold)
- Star count: "⭐ X starred repositories" (text-sm, zinc-400)

**Card Styling:**
- Border: `border border-zinc-800`
- Background: `bg-zinc-900/50`
- Padding: `p-6`
- Border radius: `rounded-lg`
- Centered content, vertical stack

**Visual Hierarchy:**
```
┌────────────────┐
│                │
│   [Avatar]     │  <- 80px circle
│                │
│   username     │  <- text-lg, bold
│                │
│ ⭐ 24 starred  │  <- text-sm, zinc-400
│  repositories  │
│                │
└────────────────┘
```

**Data Source:**
- New mock user data file: `lib/mockData/user.ts`
- Fields: avatar (URL), username (string), starredCount (number)

### 3. Center Feed: Repository Feed

**Top Section - Search & Filters:**
- Search bar at top (existing styling)
- Filter buttons below: Top Rated, Recent, Trending
- Spacing: `mb-6` between search and cards

**Repository Cards:**
- **Layout:** Single-column vertical stack (not grid)
- **Spacing:** `space-y-4` (16px between cards)

**Card Structure:**
```
┌─────────────────────────────────────┐
│  [Thumbnail Image - 16:9 aspect]   │  <- h-48, rounded-t-lg
├─────────────────────────────────────┤
│  Project Title                      │  <- text-lg, bold
│  By author • Updated X days ago     │  <- text-sm, zinc-400
│                                     │
│  ⭐ 42  🎵 12 tracks  👥 3 collabs  │  <- stats row
└─────────────────────────────────────┘
```

**Card Styling:**
- Border: `border border-zinc-800`
- Background: `bg-zinc-900/50`
- Hover border: `hover:border-glass-blue-500/40`
- Hover background: `hover:bg-zinc-800/50`
- Hover glow: `hover:shadow-[0_0_20px_rgba(167,199,231,0.12)]`
- Clickable: `cursor-pointer`
- Title hover: `group-hover:text-glass-blue-400`

**Data:**
- Source: `mockExploreRepos` from `lib/mockData/repositories.ts`
- Display: All repos (filtered/sorted based on state)

### 4. Right Sidebar: Trending Repositories

**Header:**
- Title: "Trending" (text-lg, font-semibold)
- Margin: `mb-4`

**Content:**
- Top 5 repos sorted by star count
- **List Item Structure:**
```
┌────────────────────────────┐
│ 1. Project Title           │  <- text-sm, font-medium
│    @author                 │  <- text-xs, zinc-500
│    ⭐ 203 stars            │  <- text-xs, glass-cyan-500
├────────────────────────────┤
│ 2. Another Project         │
│    ...                     │
```

**Card Styling:**
- Overall card: Same border/bg as profile card
- Padding: `p-4`
- List items: `space-y-3` between items
- Each item: `pb-3 border-b border-zinc-800` (except last)
- Hover: `hover:bg-zinc-800/30 cursor-pointer rounded px-2 -mx-2`

**Logic:**
- Sort `mockExploreRepos` by `stats.stars` descending
- Take top 5
- Display in compact list format

### 5. Responsive Design

**Desktop (1024px+):**
- Full three-column layout: 25% | 50% | 25%
- Sidebars sticky
- All content visible

**Tablet (768px - 1023px):**
- Adjusted columns: 20% | 60% | 20%
- Sidebars remain sticky
- Font sizes slightly reduced
- Profile avatar: 64px

**Mobile (<768px):**
- Vertical stack:
  1. Profile card (full width, compact)
  2. Center feed (full width)
  3. Trending card (full width)
- Remove sticky positioning
- Profile card: Horizontal layout (avatar left, info right)
- Trending: Show only top 3 repos

**Tailwind Implementation:**
- Grid: `grid-cols-1 md:grid-cols-[20%_60%_20%] lg:grid-cols-[25%_50%_25%]`
- Sticky: `lg:sticky lg:top-6`
- Responsive prefixes: `lg:`, `md:`, `sm:`

## Data & State Management

### Mock Data Files

**1. New: User Profile (`lib/mockData/user.ts`)**
```typescript
export interface MockUser {
    avatar: string;      // URL to avatar image
    username: string;    // User's display name
    starredCount: number; // Number of starred repos
}
```

**2. Existing: Repositories (`lib/mockData/repositories.ts`)**
- Already contains 50 repos with all required fields
- No modifications needed

### State Management

**State Variables:**
- `sortBy`: "top" | "recent" | "trending" (existing)
- `searchQuery`: string (new - for search filtering)

**Computed Values:**
1. Filtered repos based on search query
2. Sorted repos based on sortBy selection
3. Top 5 trending (sorted by stars for trending sidebar)

**Sorting Logic:**
- **Top:** Sort by `stats.stars` descending
- **Recent:** Sort by `updatedAt` descending
- **Trending:** Sort by stars (can enhance with recency factor later)

**Search Logic:**
- Filter repos where `title` or `author` includes search query (case-insensitive)
- Apply search filter before sorting

## Component Structure

```
ExplorePage (Client Component)
├── ProfileCard (Left Sidebar)
│   ├── Avatar
│   ├── Username
│   └── Starred Count
├── RepositoryFeed (Center Column)
│   ├── Search Bar
│   ├── Filter Buttons
│   └── Repository Cards (map over filtered/sorted repos)
└── TrendingCard (Right Sidebar)
    ├── Header
    └── Trending List (top 5 repos)
```

**Option:** Can extract ProfileCard, TrendingCard, and RepositoryCard as separate components for cleaner code, or keep inline for simplicity.

## Technical Notes

### Thumbnail Placeholder
- Repository cards need thumbnail images
- Mock data doesn't include thumbnail URLs
- Use placeholder: Gray background (`bg-zinc-800`) or gradient
- Can add `thumbnailUrl` field to mock data if desired

### Time Formatting
- Convert `updatedAt` ISO timestamps to relative time ("2 days ago")
- Use a utility function or library like `date-fns`

### Future Enhancements
- Real user data from Supabase auth
- Actual repository thumbnails (generated from waveforms or project art)
- Pagination for repository feed
- Advanced search/filtering (by genre, BPM, etc.)
- Click handlers for navigation to repo detail pages

## Success Criteria

- [ ] Three-column layout matches GitHub Explore page structure
- [ ] Center column takes 50% width on desktop
- [ ] Profile card displays avatar, username, starred count
- [ ] Trending sidebar shows top 5 repos by star count
- [ ] Search and filter functionality works with mock data
- [ ] Layout is fully responsive (desktop, tablet, mobile)
- [ ] Sticky sidebars work on desktop/tablet
- [ ] Cards have proper hover states and visual polish

## Files to Create/Modify

**Create:**
- `apps/web/lib/mockData/user.ts` - Mock user profile data

**Modify:**
- `apps/web/app/(dashboard)/explore/page.tsx` - Complete redesign

**Reference:**
- `apps/web/lib/mockData/repositories.ts` - Existing mock repo data (no changes)
