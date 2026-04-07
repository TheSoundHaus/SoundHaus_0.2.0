#!/usr/bin/env python3
"""
Auth signup test.

Flow:
- POST /api/auth/signup with a unique email, password, and name (profile username)
- Verify Supabase user creation succeeded
- Verify Gitea user provisioning succeeded
- Exit 0 on success, 1 on failure
"""

import json
import os
import sys
import uuid
from pathlib import Path

import httpx

# Load profile-aware .env.local/.env.remote when run directly
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from load_env import load_env as _load_env
_load_env()


def fail(message: str) -> None:
    print(f"[signup] ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    base_url = os.environ.get("API_BASE_URL", "http://localhost:8000")

    unique_tag = uuid.uuid4().hex[:8]
    email = f"testuser+{unique_tag}@gmail.com"
    password = "TestPassword123!"

    client = httpx.Client(base_url=base_url, timeout=30.0)
    try:
        payload = {
            "email": email,
            "password": password,
            "name": f"testuser_{unique_tag}",
            "metadata": {"source": "test_signup"},
        }

        resp = client.post("/api/auth/signup", json=payload)
        if resp.status_code != 200:
            fail(f"signup failed: {resp.status_code} {resp.text}")

        body = resp.json()

        if not body.get("success"):
            fail(f"signup success flag is false: {body}")

        supabase = body.get("supabase", {})
        if not supabase.get("success"):
            fail(f"supabase signup failed: {supabase}")

        # When email confirmation is required, Supabase returns no user object yet.
        # Gitea provisioning is skipped in that path, so we can only verify the flag.
        requires_confirmation = supabase.get("requires_confirmation", False)
        supabase_user_id = supabase.get("user", {}).get("id") if not requires_confirmation else None

        gitea = body.get("gitea", {})
        if not requires_confirmation:
            if not supabase_user_id:
                fail("supabase user created but no id returned")
            if not gitea.get("success"):
                fail(f"gitea provisioning failed: {gitea}")
            if gitea.get("username") != supabase_user_id:
                fail(
                    f"gitea username should match supabase user id: got {gitea.get('username')!r} "
                    f"expected {supabase_user_id!r}"
                )

        print(
            json.dumps(
                {
                    "test": "auth_signup",
                    "status": "ok",
                    "email": email,
                    "requires_confirmation": requires_confirmation,
                    "supabase_user_id": supabase_user_id,
                    "gitea_username": gitea.get("username") if not requires_confirmation else None,
                    "gitea_is_new": gitea.get("is_new") if not requires_confirmation else None,
                }
            )
        )
    finally:
        client.close()

    sys.exit(0)


if __name__ == "__main__":
    main()
