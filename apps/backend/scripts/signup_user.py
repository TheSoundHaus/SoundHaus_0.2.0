#!/usr/bin/env python3
"""
Sign up a user via the API (Supabase + Gitea provisioning).

Usage:
    python scripts/signup_user.py

Creates a user with a unique email (testuser+<uuid>@gmail.com) and hardcoded password.
"""

import json
import os
import sys
import uuid

import httpx


def fail(message: str) -> None:
    print(f"[signup_user] ERROR: {message}", file=sys.stderr)
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
            "metadata": {"source": "signup_user"},
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

        supabase_user_id = supabase.get("user", {}).get("id")
        if not supabase_user_id:
            fail("supabase user created but no id returned")

        gitea = body.get("gitea", {})
        if not gitea.get("success"):
            fail(f"gitea provisioning failed: {gitea}")

        print(
            json.dumps(
                {
                    "status": "ok",
                    "email": email,
                    "password": password,
                    "supabase_user_id": supabase_user_id,
                    "gitea_username": gitea.get("username"),
                    "gitea_is_new": gitea.get("is_new"),
                }
            )
        )
    finally:
        client.close()

    sys.exit(0)


if __name__ == "__main__":
    main()
