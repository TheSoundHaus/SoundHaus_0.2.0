#!/usr/bin/env python3
"""
Gitea register_repo test.

Flow:
- Login, get user_id via GET /api/auth/user
- POST /repos/register with a unique repo name → expect created=True
- POST /repos/register with the same name again → expect created=False (idempotent)
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
    print(f"[register_repo] ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    base_url = os.environ.get("API_BASE_URL", "http://localhost:8000")
    email = os.environ.get("TEST_USER_EMAIL")
    password = os.environ.get("TEST_USER_PASSWORD")

    if not email or not password:
        fail("TEST_USER_EMAIL and TEST_USER_PASSWORD must be set in the environment.")

    client = httpx.Client(base_url=base_url, timeout=60.0)
    try:
        # Login
        resp = client.post("/api/auth/login", json={"email": email, "password": password})
        if resp.status_code != 200:
            fail(f"login failed: {resp.status_code} {resp.text}")

        data = resp.json()
        access_token = (
            data.get("session", {}).get("access_token")
            or data.get("access_token")
        )
        if not access_token:
            fail("no access_token found in login response")
        headers = {"Authorization": f"Bearer {access_token}"}

        # Register a new repo (first time → created=True)
        repo_name = f"test-register-{uuid.uuid4().hex[:8]}"
        resp1 = client.post("/repos/register", headers=headers, json={"name": repo_name})
        if resp1.status_code != 200:
            fail(f"register_repo failed: {resp1.status_code} {resp1.text}")

        body1 = resp1.json()
        if not body1.get("success"):
            fail(f"register_repo success flag is false: {body1}")
        if not body1.get("created"):
            fail(f"expected created=True on first registration, got: {body1}")

        repo_data = body1.get("repo_data", {})
        if not repo_data.get("gitea_id"):
            fail(f"no gitea_id in register_repo response: {body1}")

        # Register the same repo again → should be idempotent (created=False)
        resp2 = client.post("/repos/register", headers=headers, json={"name": repo_name})
        if resp2.status_code != 200:
            fail(f"register_repo (idempotent) failed: {resp2.status_code} {resp2.text}")

        body2 = resp2.json()
        if not body2.get("success"):
            fail(f"register_repo (idempotent) success flag is false: {body2}")
        if body2.get("created"):
            fail(f"expected created=False on duplicate registration, got: {body2}")

        print(
            json.dumps(
                {
                    "test": "gitea_register_repo",
                    "status": "ok",
                    "repo_name": repo_name,
                    "gitea_id": repo_data.get("gitea_id"),
                }
            )
        )
    finally:
        client.close()

    sys.exit(0)


if __name__ == "__main__":
    main()
