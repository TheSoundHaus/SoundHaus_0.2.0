# SoundHaus — Claude / Copilot Context File

## Project Overview
SoundHaus is a collaborative music production platform enabling asynchronous file sharing for Ableton projects. Monorepo with three components:
- **Desktop** (`/apps/desktop/`) — Electron + React + Vite + TypeScript
- **Web** (`/apps/web/`) — React + Next.js 16 + Tailwind v4
- **Backend** (`/apps/backend/`) — FastAPI (Uvicorn), Supabase (auth/db), Gitea (git), Docker

## UI/UX Pro Max Skill (Installed)
The [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) v2.x skill is installed at `.github/prompts/ui-ux-pro-max/`. It provides 67 UI styles, 161 color palettes, 57 font pairings, 99 UX guidelines, and a design-system reasoning engine.

### How to Invoke (GitHub Copilot — Workflow Mode)
```
/ui-ux-pro-max <your request>
```

### Generating a Design System
```bash
python3 .github/prompts/ui-ux-pro-max/scripts/search.py "<keywords>" --design-system -p "SoundHaus"
```

### Domain-Specific Searches
```bash
# Style details
python3 .github/prompts/ui-ux-pro-max/scripts/search.py "<keywords>" --domain style

# UX guidelines
python3 .github/prompts/ui-ux-pro-max/scripts/search.py "<keywords>" --domain ux

# Typography
python3 .github/prompts/ui-ux-pro-max/scripts/search.py "<keywords>" --domain typography

# Stack-specific (react, nextjs, html-tailwind, etc.)
python3 .github/prompts/ui-ux-pro-max/scripts/search.py "<keywords>" --stack react
```

### Persist Design System (optional)
```bash
python3 .github/prompts/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "SoundHaus"
```

## SoundHaus Design System (Active)

### Web (Next.js + Tailwind v4)
- **Background**: `bg-[#111318]` (medium-dark, NOT pure black)
- **Body gradient**: `#0f1318 → #111827 → #0f1520` (softened from original navy)
- **Glass cards**: `backdrop-blur-2xl bg-white/[0.03] border border-white/[0.06]` (`.glass-card` class)
- **Brand accent**: `#A7C7E7` (icy blue)
- **Text**: `#F0F4F8` primary, `#6F8FAF` muted
- **Ambient**: `<AmbientWaveform />` canvas in dashboard layout (wave opacities 0.07/0.055/0.045)

### Desktop (Electron + React)
- **Background**: `--color-bg-primary: #141414`
- **Glass panels**: `.glass-panel` / `.glass-panel-heavy` (defined in `index.css`)
- **Brand accent**: `--color-accent: #A7C7E7`
- **All inline styles MUST use dark colors** — no `#fff`, `#fafafa`, `#e6e6e6` in TSX
- **Dark glass inline style pattern**:
  ```ts
  background: 'rgba(20,20,20,0.55)',
  border: '1px solid rgba(255,255,255,0.08)',
  backdropFilter: 'blur(16px)',
  borderRadius: 8
  ```

### Note Diff Colors (PianoRollCanvas)
- Added notes: `#22c55e` (green-500)
- Removed notes: `#ef4444` (red-500)
- Adjusted-from (outline): `#f59e0b` (amber-500)
- Adjusted-to (solid): `#A7C7E7` (brand accent)
- SVG background: `#111`
- Grid lines: `rgba(255,255,255,0.04)`
- Extension indicator: `#60a5fa` (blue-400)
- Shortening indicator: `#f59e0b` at 0.45 opacity

## Pre-Delivery Checklist (from ui-ux-pro-max)
- [ ] No emojis as icons (use SVG: Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable/hoverable elements
- [ ] Hover states with smooth transitions (150–300ms)
- [ ] Text contrast ≥ 4.5:1
- [ ] Focus states visible for keyboard nav
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px

## Common Mistakes & Lessons Learned

### 1. File Objects can't cross Server Action boundaries
Next.js Server Actions serialize inputs — `File` objects are lost. Use API routes (`/api/...`) for file uploads instead.

### 2. Supabase UUID ≠ Gitea username
When verifying repo ownership, resolve the Supabase user UUID → Gitea username before comparing with URL params.

### 3. Desktop git credential persistence
`setGiteaCredentials()` must clear old credential entries before writing new ones, otherwise stale tokens break pushes.

### 4. Inline styles override CSS modules
SCRUM-37 branch introduced inline `style={{}}` with light colors (`#fff`, `#fafafa`) that override the dark CSS module classes. Always check inline styles when merging.

### 5. Desktop blank screen != React crash
If `<ErrorBoundary>` doesn't trigger, the blank screen is likely an unhandled promise rejection or silent hook failure, not a render error. Check DevTools console.

### 6. Glassmorphism opacity for dark mode
- `bg-white/[0.03]` for cards (very subtle)
- `bg-white/[0.025]` for headers
- `border-white/[0.06-0.08]` for borders
- Glass is transparent — needs a vibrant background behind it to work

### 7. AmbientWaveform visibility
Opacities below 0.04 are effectively invisible. Use 0.07/0.055/0.045 for wave strokes and 0.06/0.03 for orb glow stops.

### 8. Tailwind v4 color syntax
Use `bg-white/[0.03]` not `bg-white/3` — the bracket syntax is required for arbitrary opacity values in v4.

## Key Files
| File | Purpose |
|------|---------|
| `SOUNDHAUS.md` | Complete design & API documentation (DO NOT EDIT) |
| `structure.txt` | File structure diagram |
| `apps/web/app/globals.css` | CSS tokens, glass utilities, body gradient |
| `apps/web/app/(dashboard)/layout.tsx` | Dashboard wrapper with AmbientWaveform |
| `apps/web/components/AmbientWaveform.tsx` | Ambient canvas background |
| `apps/desktop/src/index.css` | Desktop dark design system tokens |
| `apps/desktop/src/pages/ProjectPage.tsx` | Main project page (commit history, MIDI diff) |
| `apps/desktop/src/components/diff/PianoRollCanvas.tsx` | MIDI note diff visualization |
| `apps/backend/main.py` | FastAPI entry point |
| `docker-compose.yml` | Full stack Docker orchestration |

## Development Rules
- **DO NOT** create new API endpoints unless explicitly instructed
- **DO NOT** edit `SOUNDHAUS.md`
- Check `structure.txt` before creating new files
- Maximum 2 files edited per task unless instructed otherwise
- Use `.env` for credentials — never hardcode
- Graceful error handling: try/except, HTTPException
