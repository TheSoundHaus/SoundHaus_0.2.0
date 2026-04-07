---
title: "Final Design Document"
subtitle: "Group L13: SoundHaus"
author: "Nathan Hall, Jared Jones, Jake Wright, Wes Chou, Rahul Ghosh"
date: "April 2026"
geometry: "margin=1in"
fontsize: 11pt
mainfont: "Georgia"
linestretch: 1.3
toc: true
toc-depth: 3
numbersections: false
colorlinks: true
linkcolor: "darkblue"
header-includes:
  - \usepackage{titling}
  - \usepackage{fancyhdr}
  - \usepackage{booktabs}
  - \usepackage{longtable}
  - \usepackage{xcolor}
  - \definecolor{darkblue}{RGB}{0,70,140}
  - \pagestyle{fancy}
  - \fancyhead[L]{SoundHaus}
  - \fancyhead[R]{Senior Design — Group L13}
  - \fancyfoot[C]{\thepage}
---

\newpage

# Executive Summary

SoundHaus is a software platform for digital audio producers, providing local version control, remote backups, and git-like features such as cloning, committing, pushing, pulling, and other methods of asynchronous collaboration. It serves as an accessible bridge between producers, who are often unfamiliar with technical file sharing programs, and the industry-standard git workflow used by software engineers. Applying git to audio production is valuable because both domains share common workflow needs, particularly for versioning and sharing reproducible digital files — a feature producers have consistently expressed a need for.

SoundHaus addresses the challenge of delta-syncing in audio production, which traditionally involves saving only file changes. Unlike software development, where line-by-line diffing is straightforward, the audio world utilizes large binary and proprietary project files. SoundHaus's core technical achievement is an intelligent semantic diffing system, implemented as a native **Rust module** integrated via **NAPI-RS**, that parses gzip-compressed Ableton Live Session files and generates structured, meaningful diffs between commits on the scale of milliseconds. This provides users with essential, at-a-glance information about collaborator contributions — including a visual piano-roll canvas for MIDI note changes — allowing artists to seamlessly and asynchronously leverage version control without disruption to their existing workflows.

This focus on workflow integration and asynchronous collaboration has enabled SoundHaus to dramatically reduce the friction points currently plaguing digital audio production. By translating a proven, powerful technical workflow (git) into a specialized, producer-friendly interface, SoundHaus has become a functional tool for modern, collaborative music creation. The platform includes a desktop Electron companion app, a Next.js web application for social discovery, and a FastAPI backend orchestrating Supabase, Gitea, DigitalOcean, and Redis services. The result is a more efficient, less error-prone, and ultimately more creative process for artists, driving greater adoption of professional-grade version control practices in the audio domain.

\newpage

# Significance and Motivation

The development of the SoundHaus platform is driven by a clear understanding of the challenges facing modern creative collaboration, particularly in the music industry. Our platform is designed to dramatically reduce the friction experienced by non-technical users, allowing artists to focus on their creative output rather than logistical hurdles.

By centralizing the collaborative process, SoundHaus significantly speeds up the creation process. This is achieved by minimizing the time spent coordinating software, managing file versions, and navigating complex communication channels. We recognize that the creative flow is fragile, and any interruption — such as a version control issue or a missed communication — can break an artist's focus. SoundHaus directly addresses this by reducing friction in the creative flow, helping artists stay in the zone and maximize their productivity.

Beyond streamlining the technical workflow, SoundHaus fosters a vibrant community and triggers experimentation. By providing a shared space for creation, we expose smaller, independent artists to each other's work and creative processes. This cross-pollination of ideas and techniques is crucial for innovation and the growth of emerging talent.

The core problem we solve is one that plagues countless online musical collaborations. Currently, when artists meet online, they are immediately burdened with the need to coordinate disparate software, ensure version compatibility, manage plugins, and set up multiple primary and backup channels of communication. This labyrinth of logistical complexity often leads to burnout and the frustrating experience of projects being abandoned or collaborators simply being "left on read." SoundHaus centralizes a comprehensive solution to each of these problems, providing a seamless, all-in-one environment for co-creation.

Furthermore, we solve the perennial problem of confusing version naming. The current reality for many artists is a chaotic system where files have arbitrary names like *Project_Final_V2 (1).als*. Our platform abstracts this complexity away from the user, replacing manual, error-prone naming with a robust, transparent commit-hash system. This ensures that every iteration is tracked and recoverable without the user having to manage a confusing directory of files, thus guaranteeing project integrity and a smooth workflow.

The impetus for creating SoundHaus is deeply personal and stems from the direct, shared experiences of our team. We are, first and foremost, musicians. Our team is composed of percussionists, drummers, guitarists, cellists, horn players, and digital producers — individuals who live and breathe the collaborative creation process. This foundational passion and firsthand experience inform every decision regarding the platform's design and functionality.

\newpage

# Online Research

We have done a substantial amount of research online in addition to in-person interviews, and we have carefully selected Reddit posts where artists complain about their workflows. Here is a selection of quotes from these posts that validate our problem and solution:

**Best way to collaborate with artists using different DAWs** (*r/edmproduction*):

> "Still waiting for a Google-Docs style internet DAW that allows for two users to edit the same project simultaneously."
> 
> "(Optimal Scenario: I would love to see some sort of GIT like system for collaborating on music.)"

This quote speaks directly to us — we are building the Git for collaborating on music.

**Which DAW has the best options for long distance collaboration?** (*r/musicproduction*):

> "There is no best DAW for long-distance collaborating. It would be easier if both collaborators used the same DAW, the same goes for the same plugins, but there is no best."

This shows that modern tools don't solve the problem well enough to be considered the "best."

**Best tool to collaborate remotely?** (*r/WeAreTheMusicMakers*):

> "Don't over complicate things and don't pay for some useless service. Especially if not everyone is tech-savvy, complicated tools can kill everything about the main creative process, which is writing music."

This speaks directly to our biggest concern: balancing complexity with ease-of-use.

**Anyone figured out a good way to collaborate on DAW projects?** (*r/audioengineering*):

> "Online cloud-based DAW collaboration was Splice's exact business model before they decided it would be more profitable to exclusively host a shady sample market."

This teaches us to learn from others' mistakes in the collaboration space.

**Collaboration workflow** (*r/edmproduction*):

> "Send stems back and forth, renders, ideas, midis...or Flp-zips if you're using FL."

This is the go-to method for collaboration — fragmented and inefficient.

**Is there a "multiplayer" DAW?** (*r/edmproduction*):

> "Damn imagine a Figma but for DAW."
> 
> "We need version control for music! Imagine a git-like standard for DAWs with branches, pull requests, forks (aka remixes). Would be a game changer for long-distance collaborations."
> 
> "I've thought about this for a while, it would be great. The big problem is file size, git and other VCS are built for text, where they can store the whole history in a relatively small file size. Audio would be a lot larger."

These quotes validate our exact problem space. Git LFS is precisely the solution this user describes — and we have implemented it.

**Why I never made any collabs with other music producers** (*r/FL_Studio*):

> "The issue stems (hehe) from your collaborator then not being able to effectively edit the stem. It's easy to add, harder to subtract."

In summary, this research proves there is a real need for this kind of tool, and many artists were already thinking about it.

\newpage

# Legal, Ethical, and Privacy Issues

When we began working on our Senior Design project, we didn't anticipate the legal hurdles we would encounter early on. After pitching SoundHaus in the Innovation Tournament, judges raised questions about IP rights and data protection that we needed to address comprehensively.

Key considerations we've addressed for privacy and ethics:

1. **End-to-end encryption** — User projects are protected in transit and at rest, ensuring music can't be leaked and even our own team cannot view sensitive files without authorization.
2. **Clear data usage policies** — Transparent terms of use, permissions, and consent mechanisms so users trust their data will not be used without permission.
3. **Commit history as IP proof** — Our commit system provides a verifiable source of truth for musical contribution, showing who created what and when — valuable during legal disputes or royalty splits.
4. **Row-Level Security** — Supabase RLS policies ensure musicians only access data they own or have been explicitly invited to access.
5. **Rate limiting and security headers** — SlowAPI rate limiting and OWASP-aligned security headers protect against abuse and common attack vectors.

\newpage

# Societal Impact

SoundHaus has the potential to create meaningful societal benefits by improving how musicians collaborate, share ideas, and access creative opportunities. By simplifying version control for music projects and enabling asynchronous collaboration through a familiar Git-like workflow, SoundHaus aims to democratize digital audio production.

**Accessibility and Inclusion**: SoundHaus's asynchronous design enables musicians who cannot meet physically — due to geographic distance, financial constraints, or personal responsibilities — to work together seamlessly. Musicians with disabilities or limited mobility benefit from the ability to contribute remotely at their own pace.

**Cultural Impact**: Inspired by the open-source model demonstrated by platforms like GitHub, SoundHaus encourages transparency, learning, and collaboration through public repositories. Musicians can make projects publicly accessible, enabling others to explore stems, examine arrangement choices, and understand production techniques.

**Economic Impact**: Traditional collaboration often requires expensive studio time. SoundHaus eliminates this overhead, enabling early-stage artists to collaborate professionally without the associated costs.

**Ethical Dimensions**: Intellectual property protection is a primary concern. The platform's JWT authentication model helps prevent unauthorized access. SoundHaus supports transparent commit histories and metadata tracking to ensure all collaborators receive appropriate credit. Public repositories raise questions around sampling and remixing — establishing clear guidelines prevents misuse.

\newpage

# Our Design Plan

## Overview

Our design has been segmented into three sections: the **backend**, the **desktop application**, and the **web application**. With these we have established a software feature set comparable to that of git and GitHub — but purpose-built for audio producers. Our backend handles all business logic, user data, and large-scale storage. Our desktop application handles day-to-day user operations, including organizing files, pulling, pushing, committing, and cloning music repositories. The web application serves as the user-facing interface to the cloud and the community we are building.

A key differentiator is our intelligent delta-sync algorithm for large music files, implemented as a native Rust module, that provides semantic diffs of Ableton project files in milliseconds.

---

## Desktop Application

The desktop application is built on a strict main-process and renderer-process separation using **Electron**, with **React**, **TypeScript**, and **Vite** powering the UI layer. A context bridge exposes privileged operations — filesystem access, git execution, and native module calls — to the user interface. The application operates as a secure companion to Ableton Live, treating local project directories as the source of truth while layering version control and semantic change detection on top.

### Technology Stack

| Technology | Role |
|------------|------|
| Electron | Cross-platform shell, main process orchestration |
| React + TypeScript | Reactive UI with full type safety |
| Vite | Fast bundling and HMR in development |
| NAPI-RS | Native Rust/Node.js bridge for the diffing engine |
| Bundled Git binaries | Cross-platform git (vendor/git/macos\|windows\|linux) |
| Lucide React | Icon library (no emoji as icons) |

### Semantic Diff Engine (Native Rust Module)

The core of the application is a native semantic analysis engine implemented in **Rust** (`als-parser` v0.2.0) and integrated via **NAPI-RS**. The engine is located at `apps/desktop/native/semantic-diff/` and compiles to platform-specific `.node` binaries for macOS (ARM64), Linux (x64), and Windows (x64).

**Key Rust dependencies:**

- `flate2` — gzip decompression of `.als` files in-memory, avoiding temporary extracted files
- `quick-xml` — streaming buffered XML reader for multi-million line ALS files
- `strsim` — fuzzy string matching for track identity resolution across project versions
- `napi` / `napi-derive` — NAPI-RS bindings (v3.x) with async support via Tokio

**Exposed Node.js API:**

| Function | Description |
|----------|-------------|
| `parseXmlFromBuffer(currentBuf, oldBuf)` | Primary diff path — diffs two gzip-compressed ALS buffers in-memory (no disk I/O) |
| `parseAls(filepath)` | Serializes a single ALS file to a `Project` JSON snapshot for caching |
| `diffFromSnapshot(snapshotJson, alsPath)` | Fast diff from a previously-committed snapshot; skips re-parsing the HEAD blob |
| `generateCommitMessage(diffReportJson)` | Generates a human-readable commit message from a `DiffReport` JSON object |
| `parseXml(currentPath, oldPath)` | File-path based diff (compatibility entrypoint) |

The parsing logic fuzzy-matches track identities and uses a Longest Common Subsequence algorithm to distinguish genuine structural reorders from incidental index shifts. Snapshot caching (`.soundhaus/{session}/snapshot.json`) enables sub-millisecond diffs for real-time use — the engine processes complete ALS files in under 10 ms.

### Visual Piano Roll Diff (MIDI Diffing)

A major milestone was the transition from plain text commit summaries to a **visual piano-roll canvas** for MIDI diffing. The `PianoRollCanvas` component (`apps/desktop/src/components/diff/PianoRollCanvas.tsx`) renders note differences directly within the project page, using a purpose-built color scheme:

| Change Type | Color |
|-------------|-------|
| Added notes | `#22c55e` (green-500) |
| Removed notes | `#ef4444` (red-500) |
| Adjusted (from) | `#f59e0b` (amber-500) outline |
| Adjusted (to) | `#A7C7E7` (brand icy blue) filled |
| Extension indicator | `#60a5fa` (blue-400) |
| Shortening indicator | `#f59e0b` at 45% opacity |

This component allows producers to understand collaborative contributions in a familiar musical context without needing to open Ableton Live.

### Git-as-Proxy Architecture

Repository synchronization is managed through a **git-as-proxy** implementation. The application bundles cross-platform Git binaries directly within the Electron package at `apps/desktop/src/vendor/git/`, resolving the appropriate binary for macOS, Windows, or Linux at runtime and falling back to the system-installed Git if the bundled binary is unavailable via the `SOUNDHAUS_GIT_BIN` environment variable.

A **linear rebase-over-merge strategy** is enforced (`apps/desktop/src/electron/git-rebase.ts`) to protect against corruption of complex XML structures and binary audio data. This keeps project histories clean and ensures conflict detection happens before local changes are staged.

### Authentication Flow

The final authentication model uses a **Personal Access Token (PAT)** system:

1. The desktop client provisions a unique PAT upon login via the FastAPI backend
2. The PAT is stored securely at `~/.soundhaus/.soundhaus-credentials`  
3. Gitea credentials (username + token) are stored at `~/.soundhaus/.gitea-credentials`
4. Before writing new credentials, stale entries in `~/.git-credentials` are cleared for the Gitea host — preventing token leakage across user sessions
5. An `allowedCloneRemote` file at `~/.soundhaus/.allowed-clone-remote` governs which Gitea instance the desktop connects to

### Application Pages and Components

| File | Description |
|------|-------------|
| `pages/HomePage.tsx` | Project browser, recent history, search palette trigger |
| `pages/LoginPage.tsx` | PAT-based login screen |
| `pages/ProjectPage.tsx` | Main view: commit history, MIDI diff, push/pull/commit actions |
| `components/diff/PianoRollCanvas.tsx` | Visual MIDI note diff canvas |
| `components/SearchPalette.tsx` | Cmd+K project search overlay |
| `components/ErrorBoundary.tsx` | React error catch-all boundary |
| `electron/dialogs/` | Native OS dialog wrappers (file picker, etc.) |
| `electron/diffTransformer.ts` | Converts Rust `Change[]` tree to the `ProjectDiff` wire format for the backend |
| `electron/recentProjectsManager.ts` | Persists recently opened project paths |
| `electron/menuIndexer.ts` | Builds the macOS/Windows application menu |

---

## Web Application

The web application is built on the **Next.js 15 App Router** framework with **React**, **TypeScript**, and **Tailwind CSS v4**. It serves as the centralized interface for discovering and managing remotely stored repositories — functioning similarly to a social hub for audio projects.

### Technology Stack

| Technology | Role |
|------------|------|
| Next.js 15 (App Router) | File-based routing, Server Components, API routes |
| React + TypeScript | Reactive UI with full type safety |
| Tailwind CSS v4 | Utility-first styling with design tokens |
| WaveSurfer.js | Interactive audio waveform playback |
| Three.js / React Three Fiber | 3D landing page scenes |
| Supabase JS Client | Auth session management, storage |

### Authentication and Session Flow

The landing and login pages serve as the initial secure gateway for all user interactions, utilizing **Supabase Auth** to manage identity and session state. The interface allows registration or sign-in via email credentials or OAuth. Once authenticated, the system issues a **JWT** which the web application forwards in subsequent API headers to authorize repository access and social actions. New users are automatically redirected to a profile setup page to define their primary DAW and musical biography.

### Page Architecture (App Router)

| Route | Description |
|-------|-------------|
| `/` | Landing page with `Landing3DScenes` (Three.js) and hero marketing content |
| `/(auth)/login` | Login page |
| `/(auth)/signup` | Signup page |
| `/(dashboard)/dashboard` | Personalized home dashboard |
| `/(dashboard)/explore` | Public repository discovery engine |
| `/(dashboard)/repositories` | Personal repository management |
| `/(dashboard)/repository/[owner]/[repo]` | Detailed repository view |
| `/(dashboard)/profile/[username]` | User portfolio page |
| `/(dashboard)/settings` | Account and notification settings |
| `/api/...` | API route handlers (file uploads, proxied calls) |
| `/s/[slug]` | Short-link redirect for repository sharing |
| `/clone` | Desktop app clone handoff page |

### Discovery Engine

The Explore page functions as the central discovery surface. The system retrieves project data synchronized between Gitea and the Supabase metadata store, ensuring only projects with valid audio previews and descriptions are showcased.

**Filtering and sorting capabilities:**

- Genre tags (metal, progressive, pop, electronic, and more) assigned by repo owners
- Sort by recently uploaded, specific user handles, or optional geographic location
- Collaborator-seeking filter: find projects that explicitly need a vocalist, bassist, etc.

### Repository Card and Audio Previews

Each project is displayed on a standardized `RepositoryCard` component surfacing: project title, owner profile, collaborator list, custom thumbnail, and an interactive audio snippet. After a user pushes a version from the desktop app, a lightweight MP3 preview is generated. **WaveSurfer.js** renders the waveform inline on the card, allowing instant streaming without cloning the project.

### Repository Viewer

The repository view provides detailed project analysis: collaborators, branch structures, commit history (via Gitea webhooks), and semantic diffs. The integrated `DiffView` and `AudioPlayerWithComments` components support timestamped comments, enabling collaborators to provide granular feedback at specific moments in the song. The `StemPlayer` component, powered by the Demucs stem separation backend, allows listening to isolated vocals, drums, bass, and other elements.

### UI Design System

The web application's design system is built around dark glassmorphism:

- **Background:** `#121212` with a subtle layered body gradient
- **Glass cards:** `backdrop-blur-2xl bg-white/[0.03] border-white/[0.06]`
- **Brand accent:** `#A7C7E7` (icy blue)
- **Primary text:** `#F0F4F8`, muted text: `#6F8FAF`
- **Ambient canvas:** `<AmbientWaveform />` animates softly behind all dashboard pages
- **Keyboard shortcuts:** `⌘K` search palette and `?` shortcuts modal
- **Cursor glow:** `<CursorGlow />` follows the mouse for depth

### Key Components

| Component | Description |
|-----------|-------------|
| `AmbientWaveform.tsx` | Canvas animation — ambient waveform behind all dashboard views |
| `RepositoryCard.tsx` | Primary discoverability unit with inline audio preview |
| `AudioPlayer.tsx` | Full-featured waveform player (WaveSurfer.js) |
| `AudioPlayerWithComments.tsx` | Timestamped comment overlay on waveform |
| `StemPlayer/` | Multi-stem playback (vocals, drums, bass, other) |
| `DiffView.tsx` | Render semantic `ProjectDiff` JSON as a structured visual breakdown |
| `SnippetUploader/` | File upload flow for manual audio previews |
| `CloneModal.tsx` | Triggers desktop app clone via deep link |
| `Landing3DScenes.tsx` | Three.js / React Three Fiber hero visuals |
| `Navbar.tsx` | Top navigation with auth state and search |
| `KeyboardShortcutsModal.tsx` | Overlay listing all keyboard shortcuts |

---

## Backend

The SoundHaus backend is a centralized API gateway that orchestrates user management, repository hosting, and high-performance audio processing. It emphasizes a decoupled service model where a **FastAPI** application mediates all interactions between the frontend clients and specialized storage engines.

### Technology Stack

| Technology | Role |
|------------|------|
| FastAPI + Uvicorn | Async HTTP API framework |
| Supabase (PostgreSQL + Auth) | User data, metadata, RLS, authentication |
| Gitea | Self-hosted git server with Git LFS support |
| DigitalOcean Spaces (S3) | Object storage for avatars, audio snippets |
| Redis | Caching, session support, rate limit counters |
| Demucs (htdemucs model) | AI-powered audio stem separation |
| Docker + Docker Compose | Containerised multi-service orchestration |
| SlowAPI | Request rate limiting |
| structlog | Structured JSON logging |

### Application Assembly (`main.py`)

FastAPI is assembled with the following production-grade middleware stack:

1. **SlowAPI** — per-route and per-IP rate limiting
2. **CORSMiddleware** — origin-restricted, credential-bearing CORS (strict regex in production)
3. **SecurityHeadersMiddleware** — OWASP-aligned response headers (CSP, HSTS, X-Frame-Options, etc.)
4. **Structured logging** — all operations emit JSON log events via `structlog`

### Router Modules

All endpoint logic is organized into focused router modules under `apps/backend/routers/`:

| Router | Description |
|--------|-------------|
| `health.py` | `GET /health` — liveness and readiness probe |
| `auth.py` | Registration, login, JWT refresh, password reset, logout |
| `repos.py` | Repository CRUD, visibility, metadata, clone-URL resolution |
| `collaborators.py` | Invite, accept, revoke collaborator access |
| `commits.py` | Commit history fetch, semantic diff POST endpoint |
| `comments.py` | Timestamped repo comments (create, list, delete) |
| `snippets.py` | Audio snippet upload, storage, signed-URL generation |
| `stems.py` | Stem separation job creation, status polling |
| `audio.py` | Waveform data and audio file streaming endpoints |
| `genres.py` | Genre tag listing and assignment |
| `desktop.py` | Desktop auth bridge: PAT provisioning, credential exchange |
| `webhooks.py` | Gitea webhook ingestion → Supabase sync pipeline |

### Authentication System

The authentication system uses **Supabase Auth** for a secure, seamless experience across platforms:

- **Web:** JWT access/refresh tokens stored as secure, `HttpOnly` cookies
- **Desktop:** Dual-auth bridge — the desktop client exchanges a SoundHaus PAT for Gitea credentials via `POST /api/desktop/provision-pat` and `GET /api/desktop/gitea-credentials`
- **Token Broker sidecar** (`apps/token-broker/`) — an isolated FastAPI microservice that mints Gitea Personal Access Tokens using the `gitea admin user generate-access-token` CLI, protected by an internal API key header (`X-Internal-API-Key`)

### Database Architecture (Brain and Vault Model)

The platform operates on a **brain-and-vault** model:

- **Supabase PostgreSQL ("Brain")** — high-speed governance layer storing user profiles, project metadata, commit activity, collaborator lists, stem job records, and snippet references
- **Row-Level Security (RLS)** — enforced at the database layer; musicians only access data they own or are explicitly invited to
- **Gitea ("Vault")** — all raw repository data and binary audio assets (via Git LFS) live here, completely decoupled from application metadata

### Webhook Sync Pipeline

When a producer pushes a commit from the desktop app, **Gitea fires a webhook** that triggers the `webhooks.py` router to:

1. Parse the push event payload
2. Update commit histories, activity feeds, and project statistics in Postgres
3. Trigger snippet processing if a new audio file is detected

This ensures the web interface always reflects the latest project state without expensive direct queries against the Gitea server.

### AI Stem Separation (Demucs)

The backend includes an **AI-powered stem separation** pipeline:

- **`DemucsService`** (`services/demucs_service.py`) downloads source audio, runs the `htdemucs` model via the Demucs Python API (not the CLI), uploads separated stems (vocals, drums, bass, other) to Supabase Storage (`stems` bucket), and creates `StemFile` database records
- Model weights are cached in-process (`_cached_model`) to avoid re-loading on every job
- A configurable hard ceiling (`MAX_SEPARATION_SECONDS = 30`, overridable via `MAX_AUDIO_DURATION` env) prevents runaway jobs
- A 5-minute timeout (`SEPARATION_TIMEOUT = 300`) guards against infinite hangs

### Background Worker (`stem_worker.py`)

Stem separation runs asynchronously via a long-lived background worker:

- Polls the database for `QUEUED` `SnippetVersion` rows on a configurable interval (`WORKER_POLL_INTERVAL`, default 5 s)
- On startup, resets `PROCESSING` jobs older than `STALE_JOB_TIMEOUT` (default 10 min) back to `QUEUED` to recover from crashes
- Can run in the main FastAPI container or a dedicated `worker` Docker container (`Dockerfile.worker`)

### Storage Layer

| Store | Contents |
|-------|----------|
| Supabase Storage | User avatars, audio snippet MP3/WAV previews |
| DigitalOcean Spaces (S3) | High-resolution assets, processed stems |
| Gitea + Git LFS | Raw `.als` project files, binary audio assets in version history |

### Infrastructure

The entire backend environment is containerized with **Docker**. Docker Compose defines isolated services with shared volumes and private networking:

| Service | Image / Source |
|---------|---------------|
| `api` | `apps/backend/Dockerfile` (FastAPI + Uvicorn) |
| `worker` | `apps/backend/Dockerfile.worker` (Demucs stem worker) |
| `token-broker` | `apps/token-broker/Dockerfile` (PAT minting sidecar) |
| `gitea` | `gitea/gitea:latest` (self-hosted git server) |
| `redis` | `redis:alpine` (caching, rate limiting) |

The system is deployed on **DigitalOcean Droplets** using automated CI/CD pipelines that rebuild containers and restart services with minimal downtime.

\newpage

# Project Characterization

## Objectives and Goals

### Main Objective

**Provide musicians and producers with a user-friendly platform for version control in DAWs.**

### Goal 1: Tailor Our Product to the Market

Verify the assumptions we have about modern music production workflows through online research, structured market research, and user interviews.

### Goal 2: Select the Best DAW for Development

Market research informed our selection of **Ableton Live** as the primary DAW — the most widely-used platform among electronic and professional producers, with a well-documented binary file format amenable to semantic analysis.

### Goal 3: Ensure Our User Experience Is Well-Designed

SoundHaus must be both powerful and intuitive. Complex Git operations happen automatically in the background; only high-level actions (commit, push, pull) are exposed to the user. This goal required constant testing, UI refinement, and feedback cycles.

### Goal 4: Build an Infrastructure That Is Organized and Easy to Iterate On

A modular, maintainable architecture is critical. We enforce strict style guidelines, require code reviews before merging to main, and maintain comprehensive documentation (this document, `SOUNDHAUS.md`, `BRAND_BIBLE.md`). The monorepo structure (`apps/desktop`, `apps/web`, `apps/backend`) cleanly separates concerns.

### Goal 5: Market Our Product and Learn About Entrepreneurship

Our team participated in startup incubators, innovation competitions, and pitched to industry mentors including Jerry Guerrero (Project Studio Lead at GitHub), whose background in both creative media and programming has provided invaluable guidance.

---

## Specifications and Requirements

### Specification 1: Tight Integration with the Ableton Workflow

SoundHaus must blend into the user's creative process. Every feature must abstract complexity away from musicians, allowing SoundHaus to facilitate Git operations without requiring technical knowledge.

Our solution is a dedicated companion app that users run alongside Ableton. The semantic diff engine provides real-time feedback as the user saves their project — no additional user action required.

**Requirements:**

- Desktop app must detect and parse `.als` files automatically
- Commit messages must be auto-generated from semantic diffs
- Push/Pull operations must complete without blocking the Ableton workflow

### Specification 2: User Privacy Must Be Respected

Music is deeply personal. SoundHaus must preserve user privacy through platform-level features and strong security practices.

**Requirements:**

- Repositories are private by default
- Two-factor authentication support via Supabase Auth
- JWT tokens stored in secure, `HttpOnly` cookies (web)
- PATs stored in protected OS-level file paths (desktop)
- Supabase RLS enforced at the database layer for all queries
- OWASP-aligned security headers on all API responses

### Specification 3: UI Elements Must Indicate Their Function

Every UI element must be intuitive, accessible, and consistent. SVG icons (Lucide React / Heroicons) are used throughout — no emojis as icons.

**Requirements:**

- `cursor-pointer` on all interactive elements
- Hover states with smooth transitions (150–300 ms)
- Text contrast ≥ 4.5:1 (WCAG AA)
- Visible focus states for keyboard navigation
- `prefers-reduced-motion` media query respected
- Responsive: 375 px, 768 px, 1024 px, 1440 px breakpoints

### Specification 4: Standard Version Control Features

SoundHaus must provide true collaborative version control with a simplified interface.

**Requirements supported:**

- Clone, Pull, Push, Commit (one-click, auto-message)
- Branch creation and management (via Gitea)
- Commit history with semantic diff per commit
- Collaborator invite/accept/revoke workflow
- Repository visibility (public / private)

### Specification 5: Audio Snippet Handling

Users can optionally upload short audio snippets representing their project at a given version. These must not interrupt the artist's workflow.

**Requirements:**

- Snippets auto-generated and uploaded as part of the push workflow
- WaveSurfer.js waveform rendered inline on repository cards
- Artists can disable snippet uploads per repository
- Stems separated asynchronously (Demucs worker) — non-blocking

### Specification 6: Graceful Handling of Large Files

DAW project files are large binary assets. The system must be optimized for performance and reliability.

**Requirements:**

- Git LFS enabled on all Gitea repositories
- ALS files never written to disk during diffing (`parseXmlFromBuffer` in-memory)
- S3-compatible DigitalOcean Spaces for large asset offload
- Rebase-over-merge enforced to prevent corrupt project histories

### Specification 7: Clear Feedback and Error Recovery

Artists must always know whether their work is saved, synced, or out-of-date.

**Requirements:**

- Status indicators on every git operation (pull, push, commit)
- Non-technical error messages in the desktop UI
- Stale worker jobs auto-recovered on restart
- `ErrorBoundary` component catches silent renderer failures
- Structured JSON logs available for advanced debugging

---

## User Stories

### Version Control

- **US1:** As a producer, I want to push my project changes with one click so that I don't have to interact with Git or understand technical terminology.
- **US2:** As a musician, I want to pull the latest version of a shared project so that I can seamlessly continue where my bandmates left off.
- **US3:** As a songwriter, I want to automatically save versions of my session so that I can revert to older ideas without managing files manually.
- **US4:** As a producer switching computers, I want all project versions stored remotely so that I can pick up my work on any device.

### Collaboration

- **US5:** As a remote collaborator, I want to see who made each change so that I can understand how the project evolved.
- **US6:** As a band member, I want to create branches for different creative directions so that we can experiment without affecting the main version.
- **US7:** As a mixing engineer, I want to merge branches easily so that I can consolidate contributions without dealing with complex Git commands.

### Audio Snippets

- **US8:** As a producer, I want an audio snippet automatically generated for each version so that I can quickly audit changes without opening Ableton.
- **US9:** As an artist concerned about leaks, I want the ability to disable snippet uploads so that sensitive material remains private.

### User Experience & UI

- **US10:** As a musician with limited technical background, I want clear icons instead of technical jargon so that I can understand how to use the app immediately.
- **US11:** As a visual learner, I want waveform previews and diff summaries so that I can understand changes visually.
- **US12:** As a new user, I want onboarding instructions that are simple and approachable.

### Error Recovery & Stability

- **US13:** As a producer on a deadline, I want SoundHaus to explain errors in simple language so that I can fix issues quickly.
- **US14:** As a musician working with large projects, I want push and pull operations to be stable and resumable so that network interruptions don't corrupt my work.
- **US15:** As a collaborator, I want a notification when my local project is out of sync with the remote so that I don't accidentally overwrite someone else's work.

### Security & Privacy

- **US16:** As an artist working on unreleased music, I want my repositories to remain private by default so that no one can access them without permission.
- **US17:** As a user, I want my account secured with modern authentication (JWT + PAT) so that only I can push to my repositories.

\newpage

# Minimum Viable Product

## Overview

The MVP for SoundHaus consists of two client-facing components (desktop and web) and the backend infrastructure.

## Desktop MVP Features

- User login via SoundHaus PAT
- Initialize (git init + remote add) an existing Ableton project folder as a SoundHaus repository
- Clone an existing remote repository to local disk
- Pull latest changes from the remote
- One-click commit with auto-generated semantic commit message
- Push to remote Gitea instance
- View local commit history per project
- Live semantic diff: view what changed in the current unsaved session vs. last commit
- Piano-roll canvas diff for MIDI tracks

## Web MVP Features

- User registration and login (email/password via Supabase Auth)
- Browse public repositories on the Explore page (filtered by genre, sorted by recency / popularity)
- Repository detail view (collaborators, commit history, audio preview, semantic diff)
- Personal repository management (view, create, delete, change visibility)
- Collaborator invitations (invite by username, accept, revoke)
- Timestamped audio comments on repository snippets
- Profile page (public portfolio with project statistics)

## Backend MVP Features

- FastAPI with rate limiting, CORS, and security headers
- Supabase Auth integration (JWT, refresh tokens, RLS)
- Gitea repository provisioning (create, delete, visibility)
- Git LFS configured on all new repositories
- PAT provisioning via token-broker sidecar
- Webhook ingestion (Gitea → Supabase sync)
- Audio snippet upload and signed-URL generation
- Demucs stem separation worker (async queue)

\newpage

# Backend Progress

## Proposed Architecture

SoundHaus's backend is deployed as a multi-container Docker Compose stack on a DigitalOcean Droplet. The architecture cleanly separates concerns across four containers:

```
┌──────────────────────────────────────────────────────────┐
│                    DigitalOcean Droplet                   │
│                                                          │
│  ┌─────────────┐  ┌────────────┐  ┌──────────────────┐  │
│  │  FastAPI     │  │  Worker    │  │  Token Broker    │  │
│  │  (Uvicorn)   │  │  (Demucs)  │  │  (PAT minting)   │  │
│  └──────┬──────┘  └─────┬──────┘  └──────┬───────────┘  │
│         │               │                │              │
│  ┌──────▼───────────────▼───────┐  ┌─────▼──────────┐  │
│  │    Supabase PostgreSQL        │  │  Redis Cache   │  │
│  │    (user data, metadata, RLS) │  │                │  │
│  └──────────────────────────────┘  └────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Gitea (git server + Git LFS + webhook emitter)  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  DigitalOcean Spaces (S3-compatible object store)│   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

## Gitea and Supabase Functionality

**Supabase** manages:

- User authentication (JWT + refresh tokens, password reset)
- PostgreSQL database holding all application metadata
- RLS policies enforcing data isolation between users
- Storage buckets for avatar images and audio snippets

**Gitea** manages:

- Git repository hosting with full branch/tag support
- Git LFS for large binary audio assets (`.als`, `.wav`, stems)
- Webhook emission on push events
- PAT-based access control for the desktop git client

## Database Schemas

### users / profiles

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Supabase Auth user UUID |
| `username` | TEXT (unique) | Gitea-synced username |
| `email` | TEXT | Auth email |
| `display_name` | TEXT | Display name |
| `bio` | TEXT | Musical biography |
| `primary_daw` | TEXT | e.g., "Ableton Live" |
| `avatar_url` | TEXT | Supabase Storage or DO Spaces URL |
| `gitea_user_id` | INT | Gitea internal user ID |
| `created_at` | TIMESTAMPTZ | Auto |

### repositories

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Internal repository ID |
| `gitea_repo_id` | INT | Gitea repository ID |
| `owner_id` | UUID (FK → users) | Repository owner |
| `name` | TEXT | Repository name |
| `description` | TEXT | Project description |
| `is_private` | BOOL | Visibility flag |
| `default_branch` | TEXT | e.g., "main" |
| `clone_url` | TEXT | Gitea HTTPS clone URL |
| `thumbnail_url` | TEXT | Cover image |
| `view_count` | INT | Cached view counter |
| `star_count` | INT | Cached star counter |
| `clone_count` | INT | Cached clone counter |
| `created_at` | TIMESTAMPTZ | Auto |

### collaborators

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `repo_id` | UUID (FK → repositories) | |
| `user_id` | UUID (FK → users) | Invited user |
| `permission` | TEXT | `read` \| `write` \| `admin` |
| `status` | TEXT | `pending` \| `accepted` \| `revoked` |
| `invited_at` | TIMESTAMPTZ | |

### commits

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `repo_id` | UUID (FK → repositories) | |
| `commit_hash` | TEXT | Git SHA |
| `author_id` | UUID (FK → users) | |
| `message` | TEXT | Semantic commit message |
| `diff_summary` | JSONB | Structured `ProjectDiff` snapshot |
| `committed_at` | TIMESTAMPTZ | |

### snippet_versions (audio previews + stem jobs)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `repo_gitea_id` | TEXT | Gitea repo identifier |
| `commit_hash` | TEXT | Associated commit |
| `source_url` | TEXT | Source audio URL |
| `source_hash` | TEXT | SHA-256 of source file |
| `status` | ENUM | `QUEUED` \| `PROCESSING` \| `SUCCEEDED` \| `FAILED` |
| `error_message` | TEXT | Failure details |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### stem_files

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `snippet_version_id` | UUID (FK → snippet_versions) | |
| `stem_type` | ENUM | `vocals` \| `drums` \| `bass` \| `other` |
| `storage_url` | TEXT | Supabase Storage URL |
| `file_size` | BIGINT | Bytes |

### comments

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | |
| `repo_id` | UUID (FK → repositories) | |
| `author_id` | UUID (FK → users) | |
| `body` | TEXT | Comment text |
| `timestamp_seconds` | FLOAT | Position in audio (nullable) |
| `created_at` | TIMESTAMPTZ | |

## API Functionality

### Desktop Application API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Email + password → JWT + Gitea credentials |
| `/api/auth/logout` | POST | Revoke session token |
| `/api/desktop/provision-pat` | POST | Provision a new Gitea PAT for the desktop client |
| `/api/desktop/gitea-credentials` | GET | Exchange PAT for Gitea username + token |
| `/api/repos/{owner}/{repo}/diff` | POST | Upload `ProjectDiff` JSON after push |
| `git clone / pull / push` | — | Handled by bundled git binary (no FastAPI involvement) |

### Web Application API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | New user registration |
| `/api/auth/login` | POST | JWT issuance |
| `/api/auth/refresh` | POST | Refresh access token |
| `/api/auth/reset-password` | POST | Password reset email |
| `/api/repos` | GET/POST | List all public repos / create new repo |
| `/api/repos/{owner}/{repo}` | GET/PATCH/DELETE | Repo detail, update metadata, delete |
| `/api/repos/{owner}/{repo}/collaborators` | GET/POST/DELETE | Manage collaborators |
| `/api/repos/{owner}/{repo}/commits` | GET | Commit history |
| `/api/repos/{owner}/{repo}/commits/{hash}/diff` | GET | Semantic diff for a specific commit |
| `/api/repos/{owner}/{repo}/snippets` | GET/POST | Audio snippet management |
| `/api/repos/{owner}/{repo}/stems` | POST | Submit stem separation job |
| `/api/repos/{owner}/{repo}/comments` | GET/POST/DELETE | Timestamped comments |
| `/api/users/{username}` | GET/PATCH | User profile |
| `/api/genres` | GET | Available genre tags |
| `/health` | GET | Service health check |

\newpage

# Budget and Financing

Our budget is primarily composed of cloud infrastructure costs during the development and demonstration phases. Below is a summary of the major cost categories:

| Item | Provider | Est. Monthly Cost |
|------|----------|-------------------|
| Droplet (4 GB / 2 vCPU) | DigitalOcean | ~$24 |
| Managed Postgres (if not using free tier) | Supabase | $0–$25 |
| Spaces Object Storage (250 GB) | DigitalOcean | ~$5 |
| Domain registration | Namecheap / Cloudflare | ~$12/yr |
| GitHub Student Pack benefits | GitHub | $0 |
| **Total (development)** | | **~$30–54/mo** |

Development machines and IDEs are provided by team members. All core open-source libraries (Rust, FastAPI, Gitea, Tailwind, etc.) are free. Demucs model weights are downloaded automatically on first run.

\newpage

# Our Timeline and Milestones

## Timeline

### Senior Design I (Fall 2025)

| Week | Focus |
|------|-------|
| 1–2 | Market research, user interviews, DAW selection |
| 3–4 | Repository design, initial SOUNDHAUS.md specification |
| 5–6 | Electron skeleton, FastAPI scaffold, Supabase setup |
| 7–8 | Git binary integration, basic push/pull/clone |
| 9–10 | Supabase Auth + JWT flow, PAT provisioning |
| 11–12 | ZLib ALS parser prototype, text diff output |
| 13–14 | Web landing page, explore page skeleton |
| 15 | Demo Day I: basic version control working end-to-end |

### Senior Design II (Spring 2026)

| Week | Focus |
|------|-------|
| 1–2 | Rust NAPI-RS semantic diff engine (replaces ZLib prototype) |
| 3–4 | `parseXmlFromBuffer` — in-memory gzip diffing |
| 5–6 | `PianoRollCanvas` MIDI diff visualization |
| 7–8 | Demucs stem separation service + async worker |
| 9–10 | `StemPlayer` component, timestamped audio comments |
| 11–12 | Token-broker sidecar, refined PAT auth flow |
| 13–14 | Polish, responsive design, performance pass |
| 15 | **Demo Day II: Final presentation** |

## Milestones

| Milestone | Status |
|-----------|--------|
| M1: End-to-end git push/pull on desktop | ✅ Complete |
| M2: Supabase Auth on web + desktop | ✅ Complete |
| M3: Gitea repository provisioning | ✅ Complete |
| M4: Semantic ALS diff (Rust NAPI-RS module) | ✅ Complete |
| M5: Piano Roll canvas diff | ✅ Complete |
| M6: Web repository explorer | ✅ Complete |
| M7: Audio snippet upload + WaveSurfer playback | ✅ Complete |
| M8: Demucs stem separation | ✅ Complete |
| M9: Timestamped audio comments | ✅ Complete |
| M10: Security hardening (RLS, headers, rate limits) | ✅ Complete |
| M11: Docker Compose full-stack deployment | ✅ Complete |

\newpage

# Our Accomplishments and Progress

## Technical Accomplishments (Group)

### Semantic Diff Engine

The most technically complex and original component of SoundHaus is the native Rust semantic diff engine. It took the team multiple iterations to arrive at the current architecture:

1. **Iteration 1 (ZLib/Node.js):** An early prototype used Node.js's `zlib` module to decompress `.als` files to disk before parsing with an XML library. This approach was slow, created git working-tree conflicts, and produced brittle text-only output.

2. **Iteration 2 (NAPI-RS Rust module):** The current implementation compiles to a native `.node` binary using NAPI-RS. Key improvements:
   - `flate2` decompresses directly into memory — no temp files, no working-tree interference
   - `quick-xml` streams through multi-million line XML in milliseconds
   - `strsim` fuzzy-matches track names across project versions to resolve identity even when track IDs change
   - LCS (Longest Common Subsequence) identifies genuine structural reorders
   - `diffFromSnapshot` introduced a snapshot caching path, reducing repeat diff time from ~50 ms to sub-millisecond

3. **Piano Roll Canvas:** Moving from text summaries to a visual piano-roll diff canvas dramatically improved the interpretability of MIDI changes. Producers can now see exactly which notes were added, removed, or adjusted without opening Ableton — a key differentiator for the product.

### Git-as-Proxy Architecture

Routing all repository data flow through git itself — rather than proxying through FastAPI — was a critical early architectural decision. Benefits:
- All heavy data transfer uses git's optimized delta compression
- FastAPI only handles metadata; no file bytes pass through the application server
- Users benefit from a standard, well-understood protocol (HTTPS git with credential helper)
- The linear rebase strategy enforces clean histories that play well with binary files

### Demucs Stem Separation

Integrating AI-powered stem separation using Facebook Research's `htdemucs` model enables a feature that was genuinely novel in the music collaboration space. The async worker model (polling `SnippetVersion` queue) decouples separation time from API response latency, allowing the UI to remain non-blocking. Stale job recovery on worker restart ensures reliability across deployments.

### Security Architecture

The security stack was built with production credibility in mind:
- **RLS at the database layer** — no application-level ownership check can accidentally be bypassed
- **Token broker sidecar** — PAT minting is isolated from the main API, minimizing blast radius if credentials are leaked
- **OWASP security headers** — prevent clickjacking, MIME sniffing, and information disclosure
- **Rate limiting** — SlowAPI protects all endpoints; custom limits per route
- **Stale credential clearing** — desktop login clears old Gitea credentials from `~/.git-credentials` before writing new ones, preventing cross-user token leakage

## Entrepreneurial Accomplishments

- Accepted into the **UpStarts Venture Incubator** program
- Participated in multiple innovation competitions
- Established mentorship connection with **Jerry Guerrero** (Project Studio Lead, GitHub), who provided guidance on both technical implementation and market fit after an introduction made at a Georgia hackathon

## Individual Contributions

Each team member contributed across multiple domains throughout the project. Technical contributions included the Rust parser (native module architecture), FastAPI backend (routing, auth, services), Next.js web application (pages, components, design system), Electron desktop application (IPC, git integration, UI), and Docker infrastructure. Entrepreneurial contributions included incubator participation, pitch preparation, and industry networking.

\newpage

# Appendix A: File Structure Overview

```
SoundHaus_0.2.0/
├── apps/
│   ├── desktop/
│   │   ├── native/
│   │   │   └── semantic-diff/          # Rust NAPI-RS module
│   │   │       ├── src/
│   │   │       │   ├── lib.rs          # NAPI entry point
│   │   │       │   ├── parser.rs       # ALS gzip/XML parser
│   │   │       │   ├── diff.rs         # Semantic diff engine
│   │   │       │   ├── models.rs       # Project/Track/Clip types
│   │   │       │   └── utils.rs        # LCS, fuzzy match helpers
│   │   │       └── Cargo.toml
│   │   └── src/
│   │       ├── electron/               # Main process handlers
│   │       │   ├── main.ts
│   │       │   ├── preload.ts
│   │       │   ├── project.ts          # git pull/commit/push
│   │       │   ├── home.ts             # Clone, file browser
│   │       │   ├── login.ts            # PAT + Gitea credentials
│   │       │   ├── git-rebase.ts       # Linear rebase strategy
│   │       │   ├── diffTransformer.ts  # Rust → ProjectDiff mapping
│   │       │   └── dialogs/            # Native OS dialogs
│   │       ├── pages/
│   │       │   ├── HomePage.tsx
│   │       │   ├── LoginPage.tsx
│   │       │   └── ProjectPage.tsx
│   │       └── components/
│   │           └── diff/
│   │               └── PianoRollCanvas.tsx
│   ├── web/
│   │   ├── app/
│   │   │   ├── (auth)/                 # Login, signup
│   │   │   ├── (dashboard)/            # Authenticated pages
│   │   │   │   ├── dashboard/
│   │   │   │   ├── explore/
│   │   │   │   ├── repositories/
│   │   │   │   ├── repository/
│   │   │   │   ├── profile/
│   │   │   │   └── settings/
│   │   │   └── api/                    # Next.js API routes
│   │   └── components/
│   │       ├── AmbientWaveform.tsx
│   │       ├── RepositoryCard.tsx
│   │       ├── AudioPlayer.tsx
│   │       ├── StemPlayer/
│   │       ├── DiffView.tsx
│   │       └── Landing3DScenes.tsx
│   ├── backend/
│   │   ├── main.py                     # FastAPI assembly
│   │   ├── routers/                    # Endpoint modules
│   │   ├── services/                   # Business logic
│   │   │   ├── auth_service.py
│   │   │   ├── gitea_service.py
│   │   │   ├── demucs_service.py
│   │   │   ├── repo_service.py
│   │   │   ├── snippet_service.py
│   │   │   └── redis_service.py
│   │   └── models/                     # SQLAlchemy + Pydantic
│   ├── token-broker/                   # PAT minting sidecar
│   └── workers/
│       └── stem_worker.py              # Async Demucs worker
├── docker-compose.yml
├── SOUNDHAUS.md
└── .env
```

\newpage

# Appendix B: Key API Reference

## Desktop ↔ FastAPI

| Call | Method + Path | Notes |
|------|---------------|-------|
| Login | `POST /api/auth/login` | Returns JWT + sets cookie |
| Get Gitea credentials | `GET /api/desktop/gitea-credentials` | Bearer token required |
| Provision PAT | `POST /api/desktop/provision-pat` | Token-broker delegated |
| Post diff | `POST /api/repos/{owner}/{repo}/diff` | `ProjectDiff` JSON body |

## Web ↔ FastAPI

| Call | Method + Path | Notes |
|------|---------------|-------|
| Get public repos | `GET /api/repos?sort=recent&genre=...` | Paginated |
| Get repo detail | `GET /api/repos/{owner}/{repo}` | |
| Get commit history | `GET /api/repos/{owner}/{repo}/commits` | |
| Get diff for commit | `GET /api/repos/{owner}/{repo}/commits/{hash}/diff` | |
| Invite collaborator | `POST /api/repos/{owner}/{repo}/collaborators` | |
| Create snippet | `POST /api/repos/{owner}/{repo}/snippets` | Multipart upload |
| Request stems | `POST /api/repos/{owner}/{repo}/stems` | Queues Demucs job |
| Post comment | `POST /api/repos/{owner}/{repo}/comments` | |

## Gitea ↔ FastAPI (Webhooks)

| Event | Handler | Action |
|-------|---------|--------|
| `push` | `POST /api/webhooks/gitea` | Sync commits, trigger snippet pipeline |
