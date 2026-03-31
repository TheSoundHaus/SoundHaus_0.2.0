# SoundHaus Web Application — Full Test Suite

> **Version**: 1.0  
> **Date**: July 2025  
> **Scope**: Complete web-side testing for all features, including the Diff Viewer  
> **Test Samples**: `test_files/` directory contains 6 audio files for manual testing

---

## Table of Contents

1. [Test Environment Setup](#1-test-environment-setup)
2. [Authentication & Authorization](#2-authentication--authorization)
3. [User Profile](#3-user-profile)
4. [Repository Management](#4-repository-management)
5. [Audio Snippet Upload & Playback](#5-audio-snippet-upload--playback)
6. [Snippet Trimmer (30s Window)](#6-snippet-trimmer-30s-window)
7. [Snippet Comments](#7-snippet-comments)
8. [Stem Separation](#8-stem-separation)
9. [Diff Viewer](#9-diff-viewer)
10. [Collaborators & Invitations](#10-collaborators--invitations)
11. [Explore & Discovery](#11-explore--discovery)
12. [Dashboard & Activity Feed](#12-dashboard--activity-feed)
13. [Genre System](#13-genre-system)
14. [Remix / Clone URL](#14-remix--clone-url)
15. [Keyboard Shortcuts](#15-keyboard-shortcuts)
16. [Automated Unit Tests](#16-automated-unit-tests)
17. [Known Limitations](#17-known-limitations)

---

## 1. Test Environment Setup

### Prerequisites
- Docker + Docker Compose running (`docker compose up`)
- Backend (FastAPI) at `localhost:8000`
- Gitea at `localhost:3000`
- Web app (Next.js) at `localhost:3001` or `localhost:5173` (Vite dev)
- Supabase project configured in `.env`
- At least 2 test user accounts created

### Test Audio Samples
Located in `test_files/`:

| File | Type | Duration | Description |
|------|------|----------|-------------|
| `test_snippet.mp3` | MP3 | ~10s | Original test snippet |
| `drum_loop_120bpm.mp3` | MP3 | 10s | 808-style kick/snare/hihat at 120 BPM |
| `bass_synth_A.mp3` | MP3 | 10s | Square wave bass line in A |
| `synth_pad_Cmaj.mp3` | MP3 | 10s | Detuned saw pad with tremolo (C major) |
| `guitar_riff_Em.mp3` | MP3 | 10s | Plucked harmonics riff in E minor |
| `vocal_chop_fx.mp3` | MP3 | 10s | Formant synthesis vocal chops |

WAV versions (861K each) also available for upload testing.

---

## 2. Authentication & Authorization

### 2.1 Sign Up
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 2.1.1 | Valid signup | Navigate to `/signup`, enter valid email + password (8+ chars) + username | Redirect to dashboard, user created in Supabase + Gitea |
| 2.1.2 | Duplicate email | Sign up with an already-registered email | Error: "User already registered" |
| 2.1.3 | Weak password | Enter password < 8 characters | Client-side validation error before submit |
| 2.1.4 | Missing fields | Submit with blank email or username | Zod validation errors displayed |

### 2.2 Login
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 2.2.1 | Valid login | Enter correct email + password on `/login` | Redirect to `/dashboard`, auth cookies set |
| 2.2.2 | Wrong password | Enter correct email, wrong password | Error message, no redirect |
| 2.2.3 | Non-existent user | Enter unregistered email | Error message |
| 2.2.4 | Session persistence | Login, close tab, reopen `/dashboard` | User remains authenticated (cookie persists) |

### 2.3 Logout
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 2.3.1 | Logout | Click user menu → Logout | Redirect to `/login`, cookies cleared |
| 2.3.2 | Protected route after logout | After logout, navigate to `/dashboard` | Redirect to `/login` |

### 2.4 Token Refresh
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 2.4.1 | Auto-refresh | Wait for access token to expire, then navigate | Refresh token used silently, no logout |

---

## 3. User Profile

### 3.1 View Profile
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 3.1.1 | Own profile | Click username in navbar → profile page | Shows display name, bio, avatar, repo count, commit stats |
| 3.1.2 | Public profile | Navigate to `/profile/{username}` for another user | Shows their public repos and stats |
| 3.1.3 | Private profile | Visit a user with `is_public = false` | Appropriate visibility (limited info) |

### 3.2 Edit Profile
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 3.2.1 | Update display name | Settings → change display name → save | Name updated on profile and navbar |
| 3.2.2 | Update bio | Settings → enter bio text → save | Bio shows on profile page |
| 3.2.3 | Upload avatar | Settings → drag/click to upload image | Avatar replaces default, shown in navbar + profile |
| 3.2.4 | Delete avatar | Click "remove avatar" | Reverts to DefaultAvatar component |

---

## 4. Repository Management

### 4.1 Create Repository
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 4.1.1 | Create public repo | `/repositories` → "New Project" → enter name, select Public | Repo created, appears in list with public badge |
| 4.1.2 | Create private repo | Same as above but select Private | Repo created with private badge, not in Explore |
| 4.1.3 | Duplicate name | Try to create repo with existing name | Error: repository already exists |

### 4.2 Repository Settings
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 4.2.1 | Rename repo | Repo detail → Settings → change name | URL updates, Gitea repo renamed |
| 4.2.2 | Update description | Settings → enter description → save | Description shows on repo card + detail page |
| 4.2.3 | Toggle visibility | Settings → switch Public ↔ Private | Visibility badge updates, Explore listing changes |
| 4.2.4 | Delete repo | Settings → Delete → confirm | Repo removed from list, Gitea repo deleted |

### 4.3 Repository Detail Page
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 4.3.1 | Overview tab | Click on a repo from `/repositories` | Shows description, stats, snippet player, README |
| 4.3.2 | Snapshots tab | Click "Snapshots" tab | Lists commits with SHA, message, author, date |
| 4.3.3 | Activity tab | Click "Activity" tab | Shows push events, branch events from webhooks |
| 4.3.4 | Settings tab (owner) | Click "Settings" tab as owner | Shows rename, description, visibility, snippet upload, delete |
| 4.3.5 | Settings tab (non-owner) | Visit another user's repo | Settings tab not visible or restricted |

### 4.4 Star / Unstar
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 4.4.1 | Star a repo | Click star button on repo card or detail page | Star count increments, button shows filled state |
| 4.4.2 | Unstar a repo | Click star button again | Star count decrements, button shows unfilled state |
| 4.4.3 | Starred list | Navigate to starred repos section | Shows all repos user has starred |

---

## 5. Audio Snippet Upload & Playback

### 5.1 Upload
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 5.1.1 | Upload valid MP3 | Settings → Snippet Upload → drop `drum_loop_120bpm.mp3` | Upload succeeds, player appears in overview |
| 5.1.2 | Upload valid WAV | Drop `synth_pad_Cmaj.wav` | Upload succeeds (WAV accepted) |
| 5.1.3 | File too large | Upload a file > 10MB | Error: "File too large" (client-side validation) |
| 5.1.4 | Invalid format | Upload a `.txt` file | Error: "Unsupported format" |
| 5.1.5 | Replace snippet | Upload a new file when one already exists | Old snippet replaced, new one plays |

### 5.2 Playback
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 5.2.1 | Play snippet | Click play on AudioPlayerWithComments | WaveSurfer waveform animates, audio plays |
| 5.2.2 | Pause | Click pause during playback | Audio stops, waveform freezes at position |
| 5.2.3 | Seek | Click on waveform at different position | Playback jumps to clicked position |
| 5.2.4 | Volume toggle | Click mute/unmute button | Audio mutes/unmutes |
| 5.2.5 | Time display | During playback | Shows elapsed / total time in M:SS format |
| 5.2.6 | Overview play button | Click the play button in the Overview sidebar card | Page scrolls to player, playback starts |

### 5.3 Delete Snippet
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 5.3.1 | Delete as owner | Settings → Delete snippet | Snippet removed, player disappears from overview |
| 5.3.2 | Delete as non-owner | API call without ownership | 403 Forbidden |

---

## 6. Snippet Trimmer (30s Window)

### 6.1 Trigger
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 6.1.1 | Short file bypass | Upload a 10s file | No trimmer shown, uploads directly |
| 6.1.2 | Long file shows trimmer | Upload a file > 30s | SnippetTrimmer component appears with waveform |

### 6.2 Trimmer Interaction
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 6.2.1 | Default region | Trimmer opens on long file | Blue region spans first 30s of the waveform |
| 6.2.2 | Drag region | Drag the region start/end handles | Region moves, enforces max 30s duration |
| 6.2.3 | Region constraint | Try to expand region beyond 30s | Region snaps back to max duration |
| 6.2.4 | Confirm trim | Click "Confirm" button | File trimmed client-side, upload proceeds with trimmed WAV |
| 6.2.5 | Cancel trim | Click "Cancel" button | Returns to upload drop zone, no file uploaded |
| 6.2.6 | Trimmed file metadata | After confirm → check uploaded snippet | Duration ≤ 30s, valid audio plays correctly |

---

## 7. Snippet Comments

### 7.1 Add Comment
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 7.1.1 | Enable comment mode | Click the comment/message icon on player | Comment mode activates (icon turns amber) |
| 7.1.2 | Place timestamp | Click on waveform while in comment mode | Green pulsing marker appears at clicked position |
| 7.1.3 | Enter text | Type comment in the text field | Text appears in the input field |
| 7.1.4 | Submit comment | Click "Post" button | Comment saved, amber marker appears on waveform, form clears |
| 7.1.5 | Multiple comments | Add 3 comments at different timestamps | All 3 markers visible on waveform, sorted by time |

### 7.2 View Comments
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 7.2.1 | Hover marker | Hover over an amber dot on waveform | Tooltip shows: username, timestamp (M:SS), comment text |
| 7.2.2 | Comments as other user | Login as User B, visit User A's repo | See all comment markers, tooltip shows correct authors |

### 7.3 Delete Comment
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 7.3.1 | Delete own comment | Hover over own comment marker → click trash icon | Comment removed, marker disappears |
| 7.3.2 | Delete as repo owner | As owner, hover over any comment → trash icon visible | Can delete any comment on own repo |
| 7.3.3 | Cannot delete others' | As non-owner, hover over another user's comment | No trash icon visible |

---

## 8. Stem Separation

### 8.1 Generate Stems
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 8.1.1 | Start stem job | Repo with snippet → click "Generate Stems" | Job created, status shows "QUEUED" then "PROCESSING" |
| 8.1.2 | Poll progress | Wait on the stems section | Status updates via polling (every few seconds) |
| 8.1.3 | Job succeeds | Worker completes separation | Status: "SUCCEEDED", 4 stems available (vocals, drums, bass, other) |
| 8.1.4 | Confirm stems | Click "Confirm" on successful job | Stems marked as current version, player shows |

### 8.2 Stem Player
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 8.2.1 | Play all stems | Click play on StemPlayer | All 4 stems play synchronized |
| 8.2.2 | Solo a stem | Click solo on "drums" | Only drums audible, others muted |
| 8.2.3 | Mute a stem | Click mute on "vocals" | Vocals silenced, other 3 still play |
| 8.2.4 | Volume per stem | Adjust individual stem volume slider | That stem's volume changes relative to others |

### 8.3 Error Handling
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 8.3.1 | Job fails | (Trigger worker error) | Status: "FAILED", error message shown |
| 8.3.2 | No snippet | Try to generate stems with no snippet uploaded | Error or button disabled |

---

## 9. Diff Viewer

### 9.1 Prerequisites
- Push an Ableton project from the desktop app (or POST diff data via API)
- Have at least 2 commits with diff data

### 9.2 DiffView (Simplified — used on Snapshots tab)
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 9.2.1 | Loading state | Click on a commit that has a diff | "Analyzing changes…" spinner appears briefly |
| 9.2.2 | Commit header | View a diff | Shows commit SHA (short), message, author, date |
| 9.2.3 | Track rendering | View combined diff | Track labels on left: name, MIDI/Audio badge, instrument |
| 9.2.4 | Clip blocks | Diff with changes | Green clips (added), blue clips (modified), red clips (removed) |
| 9.2.5 | Audio waveforms | View diff with Audio tracks | Audio clip blocks show procedural waveform bars inside |
| 9.2.6 | MIDI clips | View diff with MIDI tracks | MIDI clips show as solid color blocks (no waveform) |
| 9.2.7 | Tooltip on hover | Hover over a clip block | Tooltip shows clip name and change description |
| 9.2.8 | Summary text | View diff with summary | Summary string displayed above the arrangement |
| 9.2.9 | Legend | View any diff | Legend shows: Added (green), Modified (blue), Removed (red) |
| 9.2.10 | Time ruler | View any diff | Bar numbers displayed along top of timeline |
| 9.2.11 | Empty tracks | Diff with unchanged tracks | Shows "Track added" / "Instrument changed" hints |
| 9.2.12 | No diff available | Select a commit without diff data | "No ALS diff data available" placeholder |
| 9.2.13 | Error state | (Simulate API error) | Red error message displayed |

### 9.3 DiffTimeline (Enriched — full diff engine)
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 9.3.1 | Enriched diff load | POST enriched ProjectDiff, view in UI | DiffTimeline renders with PianoRoll and Waveform tracks |
| 9.3.2 | MIDI Piano Roll | Enriched diff with MIDI notes | Piano roll shows note blocks: green=added, red=removed, blue=modified |
| 9.3.3 | Audio Waveform | Enriched diff with audio clips | WaveformTrack renders canvas with colored waveform |
| 9.3.4 | Track expand/collapse | Click on track label | Track row expands to show full detail, collapses on second click |
| 9.3.5 | Summary panel | View enriched diff | Right sidebar lists all changes, click focuses the track |
| 9.3.6 | Tempo display | Diff with tempo change | Shows "♩ = 120 → 130 BPM" in amber |
| 9.3.7 | Return/Group tracks | Diff with return tracks | Device chain row renders instead of piano roll |
| 9.3.8 | Ghost notes | Modified MIDI notes | "Before" notes shown as ghost (faded) overlay |
| 9.3.9 | Time ruler zoom | Enriched diff with zoom props | TimeRuler adjusts bar widths per pixelsPerBeat |
| 9.3.10 | AB Comparison | (If implemented) | Side-by-side view of two commits |

### 9.4 Diff Data Posting (API)
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 9.4.1 | POST diff from desktop | `POST /repos/{owner}/{repo}/diff` with PAT auth | 201 Created, diff stored, linked to commit SHA |
| 9.4.2 | GET diff | `GET /repos/{owner}/{repo}/commits/{sha}/diff` | Returns AlsDiffData with diff_type and diff_data |
| 9.4.3 | Upsert diff | POST diff for same commit SHA again | Updates existing diff (no duplicate) |
| 9.4.4 | Unauthorized POST | POST diff without PAT | 401 Unauthorized |

---

## 10. Collaborators & Invitations

### 10.1 Invite Collaborator
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 10.1.1 | Send invitation | Settings → Collaborators → enter email → Invite | Invitation created, status "pending" |
| 10.1.2 | Duplicate invite | Invite same email again | Error: invitation already pending |
| 10.1.3 | Invite self | Enter own email | Error: cannot invite yourself |

### 10.2 Accept / Decline
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 10.2.1 | Accept invitation | Login as invited user → invitations panel → Accept | User added as collaborator, Gitea permission granted |
| 10.2.2 | Decline invitation | Invitations → Decline | Invitation removed, no access granted |
| 10.2.3 | Cancel invitation | As owner, cancel pending invite | Invitation removed |

### 10.3 Collaborator Access
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 10.3.1 | View private repo | As collaborator, visit private repo URL | Full access to repo detail page |
| 10.3.2 | Push as collaborator | Desktop app: push to shared repo | Push succeeds via Gitea |
| 10.3.3 | Remove collaborator | Owner → Settings → remove collaborator | Access revoked, Gitea permissions removed |

---

## 11. Explore & Discovery

### 11.1 Explore Page
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 11.1.1 | Browse public repos | Navigate to `/explore` | Grid of RepositoryCards with snippet preview |
| 11.1.2 | Genre filter | Select a genre chip | Only repos with that genre shown |
| 11.1.3 | Search | (If implemented) Type in search field | Results filtered by name/description |
| 11.1.4 | MiniAudioPreview | Hover/click play on a repo card | Quick audio preview plays |
| 11.1.5 | Private repos hidden | Create private repo, check explore | Not visible to other users |

### 11.2 Repository Cards
| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 11.2.1 | Card info | View a RepositoryCard | Shows: name, owner, description, star count, genres, visibility badge |
| 11.2.2 | Navigate to repo | Click on card | Redirects to `/repository/{owner}/{repo}` |
| 11.2.3 | Star from card | Click star button on card | Star toggled without navigation |

---

## 12. Dashboard & Activity Feed

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 12.1 | Dashboard loads | Navigate to `/dashboard` | Shows activity feed, stats panel, recent repos |
| 12.2 | Activity feed | After pushing commits | Feed shows push events with author, repo, message |
| 12.3 | Stats panel | View dashboard | Shows: total repos, total commits, total clones, collaborations |
| 12.4 | Quick actions | Dashboard → "New Project" button | Navigates to create repo flow |

---

## 13. Genre System

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 13.1 | View genres | Explore page | Genre chips displayed with colors/icons |
| 13.2 | Assign genres to repo | Settings → GenreEditor → toggle chips | Selected genres saved, show on repo card |
| 13.3 | Remove genre | Toggle off a genre chip | Genre removed from repo |
| 13.4 | Filter by genre | Explore → click genre chip | repos filtered to that genre |

---

## 14. Remix / Clone URL

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 14.1 | Remix button (public) | View a public repo → click Remix button | CloneModal opens with SSH clone URL |
| 14.2 | Copy URL | Click copy button in CloneModal | URL copied to clipboard, green flash animation |
| 14.3 | Remix count | Clone the repo, check remix counter | RemixIcon shows updated count |
| 14.4 | Remix button (private) | View a private repo as non-collaborator | Remix button disabled or hidden |
| 14.5 | Position swap animation | Hover over RemixButton | Icon and text smoothly swap positions |

---

## 15. Keyboard Shortcuts

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 15.1 | Help modal | Press `?` on any dashboard page | KeyboardShortcutsModal opens listing all shortcuts |
| 15.2 | Close modal | Press `Escape` or click outside | Modal closes |
| 15.3 | Space (play/pause) | Press Space while audio player is focused | **Known limitation**: Only works if page-level handler wired |
| 15.4 | J / K (prev/next) | Press J or K on snapshots tab | **Known limitation**: Requires architectural change |

> **Note**: Currently only `?` (help) is fully functional. Other shortcuts (Space, J, K, Arrow keys, +/-) are registered but depend on child component state. See [Known Limitations](#17-known-limitations).

---

## 16. Automated Unit Tests

### Existing Test Files

#### DiffView Component Tests (`components/__tests__/DiffView.test.tsx`)
Run with: `npx vitest run components/__tests__/DiffView.test.tsx`

| Test Suite | Cases | Coverage |
|------------|-------|----------|
| Loading state | 2 | Spinner display, loading priority over data |
| Error state | 2 | Error message rendering, priority over data |
| No diff data | 1 | Null diffData placeholder |
| Empty tracks | 1 | Empty tracks array message |
| CommitHeader | 4 | SHA, message, author, null commit |
| Combined diff_type | 5 | Track rendering, badges, structural cross-ref, summary, legend |
| Structural diff_type | 2 | Structural-only tracks, instrument name |
| XML diff_type | 2 | Tracks without structural, summary |
| **Total** | **19** | |

#### Commits API Tests (`lib/api/__tests__/commits.test.ts`)
Run with: `npx vitest run lib/api/__tests__/commits.test.ts`

| Test Suite | Cases | Coverage |
|------------|-------|----------|
| getCommits | 3 | Default params, custom params, error propagation |
| getCommitDetail | 2 | Correct endpoint, error propagation |
| getCommitDiff | 3 | Correct endpoint, null diff, error propagation |
| **Total** | **8** | |

### Running All Tests
```bash
cd apps/web
npx vitest run
```

### Test Stack
- **Vitest** — test runner
- **@testing-library/react** — component rendering
- **vi.mock** — module mocking

---

## 17. Known Limitations

| Area | Limitation | Impact | Workaround |
|------|-----------|--------|------------|
| Keyboard shortcuts | Space/J/K/Arrows handlers are no-ops at layout level | Users must click UI buttons instead | Needs React context for handler registration |
| Audio waveforms (DiffView) | Waveforms in simplified DiffView are procedural (not from real audio data) | Visual decoration only, not actual audio shape | Use DiffTimeline with enriched diff for real waveforms |
| Waveform backend | `GET /audio/waveform` endpoint exists but requires audio file in Gitea repo | Only works after desktop push | Manually upload audio files to Gitea |
| Stem auto-trim | Backend trims to 30s at separation time, but trimmer now handles client-side | Minor UX overlap | Both protections exist for robustness |
| OAuth providers | OAuth endpoints registered but provider configuration may vary | Google/GitHub SSO may not work in dev | Use email/password login in dev |
| Real-time updates | No WebSocket — activity feed uses polling | Up to 30s delay for new events | Refresh page for immediate update |

---

## Appendix A: API Endpoint Reference (69 endpoints)

### Auth (`/api/auth`) — 14 endpoints
- `POST /signup` — Register user
- `POST /login` — Sign in
- `POST /logout` — Sign out
- `POST /refresh` — Refresh token
- `GET /user` — Current user
- `PATCH /user` — Update user
- `POST /reset-password` — Password reset
- `GET /oauth/{provider}` — OAuth
- `GET /profile` — Get profile
- `PUT /profile` — Update profile
- `POST /profile/avatar` — Upload avatar
- `DELETE /profile/avatar` — Delete avatar
- `GET /profile/stats` — User stats
- `GET /profile/{username}/public` — Public profile

### Repos (`/repos`) — 13 endpoints
- `GET /` — List repos
- `POST /` — Create repo
- `GET /{repo}/contents` — Get contents
- `POST /{repo}/upload` — Upload file
- `DELETE /{repo}/contents` — Delete file
- `PATCH /{owner}/{repo}/settings` — Update settings
- `POST /{owner}/{repo}/clone` — Record clone
- `GET /public` — Public repos
- `GET /{owner}/{repo}/stats` — Repo stats
- `PUT /{owner}/{repo}/star` — Star
- `DELETE /{owner}/{repo}/star` — Unstar
- `GET /starred` — List starred
- `DELETE /{owner}/{repo}` — Delete repo

### Collaborators — 10 endpoints
- `POST /{repo}/collaborators/invite` — Invite
- `GET /{owner}/{repo}/collaborators` — List collaborators
- `GET /invitations/pending` — Pending invitations
- `POST /invitations/{id}/accept` — Accept
- `POST /invitations/{id}/decline` — Decline
- `GET /{repo}/invitations` — Repo invitations
- `GET /invitations/sent` — Sent invitations
- `DELETE /invitations/{id}` — Cancel invitation
- `GET /users/search` — Search users
- `DELETE /{repo}/collaborators/{username}` — Remove

### Desktop & PAT (`/api`) — 5 endpoints
- `POST /auth/desktop-login` — Desktop login
- `POST /auth/tokens` — Create PAT
- `GET /auth/tokens` — List PATs
- `DELETE /auth/tokens/{id}` — Revoke PAT
- `GET /desktop/credentials` — Get Gitea credentials

### Genres (`/genres`) — 5 endpoints
- `GET /` — List genres
- `POST /` — Create genre
- `GET /{id}` — Genre details
- `PATCH /{id}` — Update genre
- `POST /repos/{owner}/{repo}/genres` — Assign genres

### Snippets (`/repos`) — 4 endpoints
- `POST /{owner}/{repo}/snippet` — Upload snippet
- `GET /{owner}/{repo}/snippet` — Get snippet (CDN redirect)
- `GET /{owner}/{repo}/snippet/metadata` — Snippet metadata
- `DELETE /{owner}/{repo}/snippet` — Delete snippet

### Comments (`/repos`) — 3 endpoints
- `POST /{owner}/{repo}/snippet/comments` — Add comment
- `GET /{owner}/{repo}/snippet/comments` — List comments
- `DELETE /{owner}/{repo}/snippet/comments/{id}` — Delete comment

### Waveform (`/repos`) — 1 endpoint
- `GET /{owner}/{repo}/audio/waveform` — Waveform peaks

### Commits & Diff (`/repos`) — 4 endpoints
- `GET /{owner}/{repo}/commits` — Commit list
- `GET /{owner}/{repo}/commits/{sha}` — Commit detail
- `POST /{owner}/{repo}/diff` — Post diff
- `GET /{owner}/{repo}/commits/{sha}/diff` — Get diff

### Stems (`/repos`) — 5 endpoints
- `POST /{owner}/{repo}/stems/jobs` — Create job
- `GET /{owner}/{repo}/stems/jobs/{id}` — Job status
- `GET /{owner}/{repo}/stems/latest` — Latest stems
- `POST /{owner}/{repo}/stems/jobs/{id}/confirm` — Confirm stems
- `GET /{owner}/{repo}/stems/history` — Stem history

### Webhooks (`/api/webhooks`) — 4 endpoints
- `POST /gitea` — Receive webhook
- `GET /deliveries` — List deliveries
- `GET /repo/{owner}/{repo}/activity` — Repo activity
- `GET /repo/{owner}/{repo}/events` — Repo events

### Health — 2 endpoints
- `GET /` — Root
- `GET /health` — Health check

---

## Appendix B: Manual Test Walkthrough Order

For a complete end-to-end test session, follow this order:

1. **Start stack**: `docker compose up` → verify health endpoints
2. **Auth**: Sign up User A + User B → login both in separate browsers
3. **Profile**: Update display name, bio, avatar for User A
4. **Create repos**: User A creates 1 public + 1 private repo
5. **Genre**: Assign genres to the public repo
6. **Snippet**: Upload `drum_loop_120bpm.mp3` → verify playback
7. **Trimmer**: Upload the WAV concatenation of 2 samples (>30s) → test trim window
8. **Comments**: User A adds 2 comments, User B adds 1 → verify markers + tooltips
9. **Stems**: Generate stems on the uploaded snippet → poll → confirm
10. **Collaborator**: User A invites User B → User B accepts → verify access
11. **Remix**: User B clicks Remix on User A's public repo → verify CloneModal
12. **Explore**: Browse explore page → verify genre filter, public repos visible
13. **Diff viewer**: Push Ableton project from desktop (or POST test diff via curl) → view diff
14. **Dashboard**: Check activity feed shows recent pushes
15. **Keyboard**: Press `?` → verify help modal
16. **Cleanup**: Delete test repos, verify removal

---

*End of Test Suite*
