#!/usr/bin/env python3
"""
Gitea delete_repo test.

Flow:
- Login, create a temp repo, get user_id via GET /api/auth/user
- DELETE /repos/{user_id}/{repo_name} to remove it
- Verify 200 + success
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
    print(f"[delete_repo] ERROR: {message}", file=sys.stderr)
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

        # Get user_id (owner must match the URL param)
        resp_user = client.get("/api/auth/user", headers=headers)
        if resp_user.status_code != 200:
            fail(f"get user failed: {resp_user.status_code} {resp_user.text}")
        user_data = resp_user.json()
        if not user_data.get("success"):
            fail(f"get user success flag is false: {user_data}")
        user_id = user_data.get("user", {}).get("id")
        if not user_id:
            fail("no user id in user response")

        # Create a temp repo to delete
        repo_name = f"test-delete-{uuid.uuid4().hex[:8]}"
        resp_create = client.post(
            "/repos",
            headers=headers,
            json={"name": repo_name, "description": "Temp repo for delete_repo test", "private": True},
        )
        if resp_create.status_code != 200:
            fail(f"create_repo failed: {resp_create.status_code} {resp_create.text}")
        if not resp_create.json().get("success"):
            fail(f"create_repo success flag is false: {resp_create.json()}")

        # Delete the repo
        resp_del = client.delete(f"/repos/{user_id}/{repo_name}", headers=headers)
        if resp_del.status_code != 200:
            fail(f"delete_repo failed: {resp_del.status_code} {resp_del.text}")

        del_data = resp_del.json()
        if not del_data.get("success"):
            fail(f"delete_repo success flag is false: {del_data}")

        print(
            json.dumps(
                {
                    "test": "gitea_delete_repo",
                    "status": "ok",
                    "repo_name": repo_name,
                }
            )
        )
    finally:
        client.close()

    sys.exit(0)


if __name__ == "__main__":
    main()
