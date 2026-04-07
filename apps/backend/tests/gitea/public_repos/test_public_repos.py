#!/usr/bin/env python3
"""
Gitea public_repos test.

Flow:
- GET /repos/public (no auth) → verify 200 + success + repos is a list
- GET /repos/public?genres=Electronic (no auth) → verify 200 + success
- Login, get user_id, GET /repos/user/{user_id} → verify 200 + success + repos is a list
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
    print(f"[public_repos] ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    base_url = os.environ.get("API_BASE_URL", "http://localhost:8000")
    email = os.environ.get("TEST_USER_EMAIL")
    password = os.environ.get("TEST_USER_PASSWORD")

    if not email or not password:
        fail("TEST_USER_EMAIL and TEST_USER_PASSWORD must be set in the environment.")

    client = httpx.Client(base_url=base_url, timeout=30.0)
    try:
        # GET /repos/public — no auth required
        resp = client.get("/repos/public")
        if resp.status_code != 200:
            fail(f"GET /repos/public failed: {resp.status_code} {resp.text}")

        body = resp.json()
        if not body.get("success"):
            fail(f"GET /repos/public success flag is false: {body}")
        if not isinstance(body.get("repos"), list):
            fail(f"GET /repos/public 'repos' is not a list: {type(body.get('repos'))}")

        # TEMPORARY: log first 3 repos
        for i, repo in enumerate(body.get("repos", [])[:3]):
            print(f"[DEBUG] repo[{i}]: {json.dumps(repo, indent=2)}", file=sys.stderr)

        # GET /repos/public with genre filter
        resp_genre = client.get("/repos/public", params={"genres": "Electronic", "match": "any"})
        if resp_genre.status_code != 200:
            fail(f"GET /repos/public?genres=Electronic failed: {resp_genre.status_code} {resp_genre.text}")
        body_genre = resp_genre.json()
        if not body_genre.get("success"):
            fail(f"GET /repos/public?genres=Electronic success flag is false: {body_genre}")
        if not isinstance(body_genre.get("repos"), list):
            fail(f"GET /repos/public genre filter 'repos' is not a list: {type(body_genre.get('repos'))}")

        # Login to get user_id for the /repos/user/{username} test
        resp_login = client.post("/api/auth/login", json={"email": email, "password": password})
        if resp_login.status_code != 200:
            fail(f"login failed: {resp_login.status_code} {resp_login.text}")

        data = resp_login.json()
        access_token = (
            data.get("session", {}).get("access_token")
            or data.get("access_token")
        )
        if not access_token:
            fail("no access_token found in login response")
        headers = {"Authorization": f"Bearer {access_token}"}

        resp_user = client.get("/api/auth/user", headers=headers)
        if resp_user.status_code != 200:
            fail(f"get user failed: {resp_user.status_code} {resp_user.text}")
        user_data = resp_user.json()
        user_id = user_data.get("user", {}).get("id")
        if not user_id:
            fail("no user id in user response")

        # GET /repos/user/{user_id} — no auth required, UUID as username fallback
        resp_user_repos = client.get(f"/repos/user/{user_id}")
        if resp_user_repos.status_code != 200:
            fail(f"GET /repos/user/{{user_id}} failed: {resp_user_repos.status_code} {resp_user_repos.text}")
        user_repos_body = resp_user_repos.json()
        if not user_repos_body.get("success"):
            fail(f"GET /repos/user/{{user_id}} success flag is false: {user_repos_body}")
        if not isinstance(user_repos_body.get("repos"), list):
            fail(f"GET /repos/user/{{user_id}} 'repos' is not a list: {type(user_repos_body.get('repos'))}")

        print(
            json.dumps(
                {
                    "test": "gitea_public_repos",
                    "status": "ok",
                    "public_repo_count": len(body.get("repos", [])),
                    "user_repo_count": len(user_repos_body.get("repos", [])),
                }
            )
        )
    finally:
        client.close()

    sys.exit(0)


if __name__ == "__main__":
    main()
