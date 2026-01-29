# Claude Local Configuration - SoundHaus

This file contains local configuration and notes for Claude Code when working on the SoundHaus project.

## Project Overview

SoundHaus is a collaborative music production platform that enables asynchronous file sharing for Ableton projects. The application is comprised of three main components in a monorepo structure:

1. **Desktop Application** (`/apps/desktop/`) - Electron-based app for local git-ified Ableton project management
2. **Web Application** (`/apps/web/`) - React/Next.js frontend for social discovery and repository management
3. **Backend** (`/apps/backend/`) - Two-tiered system using Supabase (auth/user data) and Digital Ocean (Gitea git server + file storage)

### Technology Stack
- **Desktop**: Electron, React.js, ZLib (for .als to .xml conversion), bundled Git binaries
- **Web**: React.js, Next.js
- **Backend**: FastAPI (Uvicorn), Supabase (PostgreSQL + Auth), Gitea (Git server), Docker, Digital Ocean

## Key Files and Directories

- `SOUNDHAUS.md` - Complete design overview and API documentation (READ THIS FIRST)
- `structure.txt` - Exhaustive file structure diagram (check for discrepancies)
- `.env` - Environment variables (never commit)
- `apps/desktop/` - Desktop application code
- `apps/web/` - Web application code
- `apps/backend/fastapi/` - FastAPI backend
- `apps/backend/gitea/` - Gitea configuration

## Development Guidelines

### Code Standards
- Use 4-space indentation, no trailing whitespace
- Never hardcode credentials - use .env files
- Graceful error handling (try/except, HTTPException)
- Add comments describing functionality
- Follow language-specific best practices

### API Guidelines
- **DO NOT** create new API endpoints unless explicitly instructed
- **ALWAYS** check entire FastAPI structure before making API decisions
- Most API calls are hosted by FastAPI, except Desktop git operations (push/pull/clone handled by git binary)

### File Structure Guidelines
- **ALWAYS** check `structure.txt` for current file structure
- Alert user to rerun ai-prep script if discrepancies found
- **DO NOT** edit more than 2 files at a time unless explicitly instructed
- **DO NOT** edit `SOUNDHAUS.md`

### Scope Management
- Clarify task scope before coding if interpretation is possible
- Do not edit files beyond task scope
- Refuse arbitrary tool/refactor recommendations not mentioned by user
- Refuse entire feature refactors

## Common Workflows

### Desktop App Git Operations
- Clone, Pull, Push operations handled by bundled git binary
- No data passes through API endpoints for these operations
- Git acts as proxy between Desktop and Backend/Gitea

### Authentication Flow
- Login returns session token
- Desktop can be linked from web via Desktop Authentication Link endpoint
- Logout revokes session token

### Repository Management
- Gitea uses git LFS for large audio files
- Audio files stored in Digital Ocean
- Repository metadata stored in Supabase

## Working Notes

<!-- Add temporary session-specific notes here -->
