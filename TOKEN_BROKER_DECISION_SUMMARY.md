# SoundHaus Token Minting Decision Summary

## Context and Goal

The objective was to make desktop credential issuance reliable in production without requiring direct Docker CLI access from the FastAPI container, while keeping the design secure and maintainable.

The target flow is:

1. Desktop calls `GET /api/desktop/credentials`
2. Backend validates SoundHaus PAT
3. Backend obtains/creates a user-scoped Gitea token
4. Backend returns token to desktop for Git operations

---

## What We Tried

### 1) API-First Token Creation (Primary Attempt)

Implemented/used API path in backend (`create_or_get_user_token`) with:
- Admin PAT auth
- `Sudo` header
- `POST /api/v1/users/{username}/tokens`

Also improved desktop/backend transport:
- Switched cached token transfer to header (`X-Cached-Gitea-Token`)
- Added cached token ownership validation (token must belong to requesting user)

### 2) Deployment and Production Validation

Deployed backend to droplet and tested live credentials flow.

Observed behavior:
- Gitea token create endpoint returned `401 Unauthorized`
- Gitea logs pointed to auth gate `reqBasicOrRevProxyAuth` for that route
- Other admin-token operations worked, but this specific endpoint did not accept PAT-based auth in the tested setup/version path

### 3) CLI-Based Token Generation Validation

Tested Gitea CLI command directly (works):
- `gitea admin user generate-access-token --username <user> --token-name <name> --scopes ... --raw`

Result:
- CLI generated valid user token
- Token validated against Gitea user endpoint

Blocker discovered:
- FastAPI container did not have Docker runtime access (`docker` not available / no socket access), so it could not execute CLI in the Gitea container directly.

---

## What Went Wrong (Root Causes)

1. **Gitea API auth mismatch for token creation endpoint**
   - The intended API endpoint for creating user tokens was not usable with current PAT auth path in this runtime.

2. **Runtime capability gap in FastAPI container**
   - No Docker CLI/socket access, so CLI fallback was not executable from backend service.

3. **Security risk of quick fix**
   - Mounting Docker socket into FastAPI would solve execution but grants broad host-level control to the main API container.

---

## Solutions Considered

### Option A — Mount Docker socket into FastAPI (quick, less secure)
**Pros**
- Fastest to implement
- Reuses existing CLI fallback code

**Cons**
- Expands blast radius of main API service
- Violates least-privilege principle

### Option B — Dedicated HTTP token broker sidecar (selected)
**Pros**
- Isolates Docker socket access to single-purpose service
- Keeps FastAPI unprivileged
- Clear operational boundary and logging for privileged action
- Works with existing Docker Compose networking

**Cons**
- Adds one service to deploy/maintain

### Option C — SSH execution bridge
**Pros**
- Avoids Docker socket in app containers

**Cons**
- Key management + host hardening complexity
- More operational moving parts

### Option D — Pre-generated token pool
**Pros**
- No runtime privileged minting

**Cons**
- Token lifecycle, rotation, and assignment complexity
- Hard to guarantee clean user ownership at scale

### Option E — Reconfigure Gitea auth path
**Pros**
- Keeps pure API architecture

**Cons**
- Depends on Gitea auth model/version behavior and riskier global config changes
- Not guaranteed to resolve immediately in current environment

---

## Why We Chose Option B

Option B best balances:
- **Security**: least privilege (only broker has Docker socket)
- **Reliability**: uses known-good CLI mint path
- **Practicality**: minimal disruption to existing backend and desktop flows
- **Maintainability**: narrow service responsibility and clear failure boundaries

It avoids putting host-level Docker capabilities into the primary FastAPI surface.

---

## What Was Implemented

### New token broker service
Added `apps/token-broker/` with:
- `main.py` (`POST /mint-token`, `GET /health`)
- `config.py`
- `logging_config.py`
- `requirements.txt`
- `Dockerfile`
- `.env.example`

### Docker Compose integration
- Added `token-broker` service to `docker-compose.yml`
- Mounted `/var/run/docker.sock` **only** on token-broker
- Kept token-broker internal to Docker network (no public port exposure)
- Added healthcheck
- Made `fastapi` depend on healthy token-broker

### Backend integration
Updated backend config and Gitea service:
- Added broker settings (`token_broker_enabled`, `token_broker_url`, optional key)
- Added broker call helper in Gitea service
- `create_or_get_user_token` now attempts broker path first
- Existing API path retained as fallback if broker fails

---

## Current Status

- Broker image builds successfully.
- Broker container starts and health endpoint responds.
- Compose configuration validates.
- Backend code is wired for broker-first token minting with fallback.

---

## Open Follow-Up Work

1. End-to-end verification of `/api/desktop/credentials` using real auth token/user in deployed environment
2. Confirm broker mint call produces valid token in full desktop login flow
3. Add final service documentation/readme and deployment runbook updates
4. Optional hardening: enforce shared internal API key between FastAPI and broker

---

## Key Takeaway

The final design keeps the main API container unprivileged while restoring reliable token minting through a controlled sidecar. This gives a practical production path now, with room to migrate back to pure API minting later if Gitea auth behavior/config changes make that viable.
