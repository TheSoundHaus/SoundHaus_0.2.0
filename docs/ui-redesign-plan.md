# SoundHaus UI Redesign Plan

**Goal:** Move the product away from “generic AI SaaS” (Inter + blue glow + uniform cards) toward a **distinct, music-native** visual language that still matches the existing Brand Bible tokens (`glass-blue`, midnight backgrounds).

**Reference map (what to steal from each source):**

| Source | Use for SoundHaus |
|--------|-------------------|
| [Mobbin](https://mobbin.com) | **Flows, not pixels** — sign-in, settings, empty states, error toasts, “first project” onboarding. Prefer one strong pattern per screen over decoration. |
| [Godly](https://godly.website) | **Motion budget** — subtle scroll-linked parallax or section reveals on marketing only; **never** on dashboard tables. Respect `prefers-reduced-motion`. |
| [Awwwards](https://www.awwwards.com) | **Typography hierarchy** — one display face for marketing H1/H2; UI stays calm. Avoid novelty for repo tables. |
| [Lapa Ninja](https://www.lapa.ninja) | **Landing structure** — Hero → proof → features → pricing/teaser → footer; one primary CTA per viewport. |
| [Refero](https://refero.design) | **Data density** — repo lists, commit timelines, marketplace grids: align baselines, consistent row height, clear hover/focus rings (keyboard). |

---

## Diagnosis (current state)

- **Typography:** `tailwind.config.ts` maps `font-sans` to **Inter**; `README.md` mentions Geist but it is not wired in `app/layout.tsx`. Inter-heavy UIs read as default / “template”.
- **Background:** `globals.css` uses a neutral multi-stop gradient on `body::before` plus icy blue accents — reads as “dark glassmorphism starter kit”.
- **Layout shell:** `(dashboard)/layout.tsx` hard-codes `bg-[#121212]` instead of leaning on tokens (`midnight`, `navy`) consistently.
- **Motion:** `AmbientWaveform` + link glows are on-brand for music; risk is **competing focal points** (waveform + cards + navbar glow).

---

## Design principles (non-negotiables)

1. **One hero accent per view** — either waveform *or* a hero illustration, not both fighting the content.
2. **Token-first** — extend `globals.css` / Tailwind theme; avoid new arbitrary hex in components unless fixing a bug.
3. **Accessibility** — WCAG AA on body text; focus rings visible on all interactive elements (Refero-style tables).
4. **Server/client split** — keep heavy animation in client islands; marketing page can be bolder than dashboard.

---

## Phased execution

### Phase A — Typography & baseline (started in repo)

- Wire **`next/font/google`** in `app/layout.tsx` with a non-Inter primary (e.g. Plus Jakarta Sans) and expose `--font-sans` for Tailwind.
- Update `tailwind.config.ts` `fontFamily.sans` to `var(--font-sans), …` fallbacks.
- Optional follow-up: add a **display** font only for marketing `app/page.tsx` headings (second `next/font` with `variable: --font-display`).

### Phase B — Marketing / landing (Lapa + Awwwards)

- Restructure home: single H1, subhead, primary CTA, secondary CTA; social proof strip; three feature blocks with **real screenshots** (desktop app) not generic icons.
- Reduce gradient noise; use **one** strong background treatment (noise texture or subtle grid, not both).

### Phase C — Dashboard & repo surfaces (Refero + Mobbin)

- **Navbar:** collapse secondary links into “More” on md; active route indicator as underline or left bar (not only color).
- **Repository list / Explore:** sticky header row, zebra or border-only rows, consistent `h-14` rows, loading skeletons that match final layout.
- **Repo detail:** commit timeline as a **timeline** (left rail + content), not stacked identical cards.

### Phase D — Motion polish (Godly, scoped)

- Page transition: 150–200ms fade on route segment inside `main` only.
- Button press: `active:scale-[0.98]` + shadow lift (already partially present — unify).

### Phase E — WIP feature pages (billing, marketplace, classroom)

- Shared **settings shell**: left nav pattern (Mobbin settings) shared across `/settings/billing` and future account pages.
- Marketplace cards: price + waveform thumbnail + seller — avoid “three equal columns of lorem”.

---

## File-level backlog (priority order)

| Area | Files |
|------|--------|
| Root typography | `apps/web/app/layout.tsx`, `apps/web/tailwind.config.ts` |
| Global tokens / base | `apps/web/app/globals.css` |
| Shell | `apps/web/app/(dashboard)/layout.tsx`, `apps/web/components/Navbar.tsx` |
| Marketing | `apps/web/app/page.tsx` (or route group landing) |
| Repo / explore | `apps/web/app/(dashboard)/explore/*`, repository pages under `app/(dashboard)/repository/` |
| WIP dashboards | `apps/web/app/(dashboard)/marketplace/*`, `classroom/*`, `settings/billing/*` |

---

## Success metrics (subjective but checkable)

- [ ] A new teammate can name **one** visual trait of SoundHaus without saying “dark mode” or “blue”.
- [ ] Lighthouse **Accessibility** ≥ 90 on `/` and `/explore` (local build).
- [ ] No new `font-sans` defaulting to Inter in `tailwind.config.ts` unless explicitly reverted.

---

## Out of scope (for now)

- Full rebrand (logo, illustration set, motion design system in Figma).
- Replacing `AmbientWaveform` entirely — tune opacity / blur first.
