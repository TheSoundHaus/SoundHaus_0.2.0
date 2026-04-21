#!/usr/bin/env python3
"""
Gitea repo_stats test.

Flow:
- Login, create a temp repo, get user_id via GET /api/auth/user
- GET /repos/{user_id}/{repo_name}/stats (no auth required) → verify 200 + success + expected fields
- GET /repos/{user_id}/nonexistent-repo/stats → verify 404
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
    print(f"[repo_stats] ERROR: {message}", file=sys.stderr)
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

        # Create a temp repo so a RepoData row exists
        repo_name = f"test-stats-{uuid.uuid4().hex[:8]}"
        resp_create = client.post(
            "/repos",
            headers=headers,
            json={"name": repo_name, "description": "Temp repo for repo_stats test", "private": True},
        )
        if resp_create.status_code != 200:
            fail(f"create_repo failed: {resp_create.status_code} {resp_create.text}")
        if not resp_create.json().get("success"):
            fail(f"create_repo success flag is false: {resp_create.json()}")

        # GET /repos/{owner}/{repo}/stats — requires auth for private repos
        resp_stats = client.get(f"/repos/{user_id}/{repo_name}/stats", headers=headers)
        if resp_stats.status_code != 200:
            fail(f"repo_stats failed: {resp_stats.status_code} {resp_stats.text}")

        stats = resp_stats.json()
        if not stats.get("success"):
            fail(f"repo_stats success flag is false: {stats}")

        # Verify expected fields
        for field in ("gitea_id", "clone_count", "genres", "recent_clones"):
            if field not in stats:
                fail(f"repo_stats missing expected field '{field}': {stats}")

        if stats.get("gitea_id") != f"{user_id}/{repo_name}":
            fail(f"repo_stats gitea_id mismatch: expected '{user_id}/{repo_name}', got '{stats.get('gitea_id')}'")

        if not isinstance(stats.get("genres"), list):
            fail(f"repo_stats 'genres' is not a list: {type(stats.get('genres'))}")

        if not isinstance(stats.get("recent_clones"), list):
            fail(f"repo_stats 'recent_clones' is not a list: {type(stats.get('recent_clones'))}")

        # GET non-existent repo → 404
        resp_404 = client.get(f"/repos/{user_id}/this-repo-does-not-exist-xyz/stats")
        if resp_404.status_code != 404:
            fail(f"expected 404 for missing repo, got: {resp_404.status_code} {resp_404.text}")

        print(
            json.dumps(
                {
                    "test": "gitea_repo_stats",
                    "status": "ok",
                    "repo_name": repo_name,
                    "clone_count": stats.get("clone_count"),
                }
            )
        )
    finally:
        client.close()

    sys.exit(0)


if __name__ == "__main__":
    main()
