# Design: Activity Feed + Notification Dropdown

**Date:** 2026-04-06
**Branch:** feature/activity-feed-notifications
**Purpose:** Demo features for class presentation

---

## Feature 1: Explore Page Activity Feed

**Location:** Right sidebar of `/explore`, below the existing Trending section

**Data source:** `getDashboardData()` — reuses the existing `DashboardActivity[]` (push/create/collaborate events). No new endpoints.

**UI:** A glass card with a timeline-style list showing:
- Icon per activity type (blue for create, green for push, amber for collaborate)
- Description with linked repo name
- Relative timestamp ("2h ago", "yesterday")
- Max 8 items, sorted most recent first

**File modified:** `apps/web/app/(dashboard)/explore/page.tsx`

**Styling:** SoundHaus glass card system (`glass-card`, `backdrop-blur-2xl`, `bg-white/[0.03]`, `border-white/[0.06]`)

---

## Feature 2: Notification Dropdown in Navbar

**Location:** Bell icon between the nav links and the profile avatar in `Navbar.tsx`

**Data sources:**
- `getPendingInvitations()` — real invitation data
- `getDashboardData().activity` — recent activity on user's repos

**UI:**
- Bell icon (Lucide `Bell`) with a colored badge showing unread count
- Click opens a dropdown panel (glass card style)
- Two sections: "Invitations" (accept/decline actions) and "Activity" (recent events)
- Client-side "read" state — clicking the bell marks current items as seen (count resets)
- Click outside closes dropdown
- Resets on page refresh (no backend persistence needed for demo)

**File modified:** `apps/web/components/Navbar.tsx`

**Styling:** Consistent with SoundHaus design system — glass cards, `#A7C7E7` accent, zinc color palette

---

## Architecture Notes

- No new API endpoints created
- No new files created — both features are modifications to existing files
- Data fetched client-side using existing server actions
- Activity types: "push" (green), "create" (blue), "collaborate" (amber)
- Uses existing `DashboardActivity`, `Invitation` types from `lib/types/api.ts`
