#!/usr/bin/env python3
"""
Gitea repo_star test.

Flow:
- Login, get user_id via GET /api/auth/user, create a temp repo
- PUT  /repos/{user_id}/{repo_name}/star   → verify 200 + success
- GET  /repos/starred                      → verify 200 + success + repos is a list
- DELETE /repos/{user_id}/{repo_name}/star → verify 200 + success
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
    print(f"[repo_star] ERROR: {message}", file=sys.stderr)
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

        # Get user_id
        resp_user = client.get("/api/auth/user", headers=headers)
        if resp_user.status_code != 200:
            fail(f"get user failed: {resp_user.status_code} {resp_user.text}")
        user_data = resp_user.json()
        user_id = user_data.get("user", {}).get("id")
        if not user_id:
            fail("no user id in user response")

        # Create a temp repo to star
        repo_name = f"test-star-{uuid.uuid4().hex[:8]}"
        resp_create = client.post(
            "/repos",
            headers=headers,
            json={"name": repo_name, "description": "Temp repo for repo_star test", "private": True},
        )
        if resp_create.status_code != 200:
            fail(f"create_repo failed: {resp_create.status_code} {resp_create.text}")
        if not resp_create.json().get("success"):
            fail(f"create_repo success flag is false: {resp_create.json()}")

        # Star the repo
        resp_star = client.put(f"/repos/{user_id}/{repo_name}/star", headers=headers)
        if resp_star.status_code != 200:
            fail(f"star_repo failed: {resp_star.status_code} {resp_star.text}")
        star_data = resp_star.json()
        if not star_data.get("success"):
            fail(f"star_repo success flag is false: {star_data}")

        # List starred repos
        resp_starred = client.get("/repos/starred", headers=headers)
        if resp_starred.status_code != 200:
            fail(f"list_starred failed: {resp_starred.status_code} {resp_starred.text}")
        starred_data = resp_starred.json()
        if not starred_data.get("success"):
            fail(f"list_starred success flag is false: {starred_data}")
        if not isinstance(starred_data.get("repos"), list):
            fail(f"list_starred 'repos' is not a list: {type(starred_data.get('repos'))}")

        # Unstar the repo
        resp_unstar = client.delete(f"/repos/{user_id}/{repo_name}/star", headers=headers)
        if resp_unstar.status_code != 200:
            fail(f"unstar_repo failed: {resp_unstar.status_code} {resp_unstar.text}")
        unstar_data = resp_unstar.json()
        if not unstar_data.get("success"):
            fail(f"unstar_repo success flag is false: {unstar_data}")

        print(
            json.dumps(
                {
                    "test": "gitea_repo_star",
                    "status": "ok",
                    "repo_name": repo_name,
                    "starred_count": len(starred_data.get("repos", [])),
                }
            )
        )
    finally:
        client.close()

    sys.exit(0)


if __name__ == "__main__":
    main()
