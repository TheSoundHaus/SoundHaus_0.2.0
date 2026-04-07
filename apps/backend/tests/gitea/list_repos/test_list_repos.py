#!/usr/bin/env python3
"""
Gitea list_repos test.

Flow:
- Login with TEST_USER_EMAIL / TEST_USER_PASSWORD
- GET /repos to list Gitea repos for the current user
- Exit 0 on success, 1 on failure
"""

import json
import os
import sys
from pathlib import Path

import httpx

# Load profile-aware .env.local/.env.remote when run directly
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from load_env import load_env as _load_env
_load_env()


def fail(message: str) -> None:
    print(f"[list_repos] ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    base_url = os.environ.get("API_BASE_URL", "http://localhost:8000")
    email = os.environ.get("TEST_USER_EMAIL")
    password = os.environ.get("TEST_USER_PASSWORD")

    if not email or not password:
        fail("TEST_USER_EMAIL and TEST_USER_PASSWORD must be set in the environment.")

    client = httpx.Client(base_url=base_url, timeout=20.0)
    try:
        # Login
        resp = client.post(
            "/api/auth/login",
            json={"email": email, "password": password},
        )
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

        # List repos
        resp2 = client.get("/repos", headers=headers)
        if resp2.status_code != 200:
            fail(f"list_repos failed: {resp2.status_code} {resp2.text}")

        body = resp2.json()
        if not body.get("success"):
            fail(f"list_repos success flag is false: {body}")

        repos = body.get("repos")
        if not isinstance(repos, list):
            fail(f"list_repos 'repos' field is not a list: {type(repos)}")

        print(
            json.dumps(
                {
                    "test": "gitea_list_repos",
                    "status": "ok",
                    "repo_count": len(repos),
                }
            )
        )
    finally:
        client.close()

    sys.exit(0)


if __name__ == "__main__":
    main()

