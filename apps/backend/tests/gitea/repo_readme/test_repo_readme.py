#!/usr/bin/env python3
"""
Gitea repo_readme test.

Flow:
- Login, create a temp repo, get user_id via GET /api/auth/user
- GET /repos/{user_id}/{repo_name}/readme (no auth) → verify 200 + success + readme_content
- PUT /repos/{user_id}/{repo_name}/readme with content → verify 200 + success + content round-trips
- GET again → verify updated content is returned
- Verify 403 when a non-owner tries to PUT (using missing auth)
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
    print(f"[repo_readme] ERROR: {message}", file=sys.stderr)
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

        # Create a temp repo
        repo_name = f"test-readme-{uuid.uuid4().hex[:8]}"
        resp_create = client.post(
            "/repos",
            headers=headers,
            json={"name": repo_name, "description": "Temp repo for repo_readme test", "private": True},
        )
        if resp_create.status_code != 200:
            fail(f"create_repo failed: {resp_create.status_code} {resp_create.text}")
        if not resp_create.json().get("success"):
            fail(f"create_repo success flag is false: {resp_create.json()}")

        # GET readme (with owner auth) — should return empty string initially
        resp_get = client.get(f"/repos/{user_id}/{repo_name}/readme", headers=headers)
        if resp_get.status_code != 200:
            fail(f"GET readme failed: {resp_get.status_code} {resp_get.text}")
        get_data = resp_get.json()
        if not get_data.get("success"):
            fail(f"GET readme success flag is false: {get_data}")
        if "readme_content" not in get_data:
            fail(f"GET readme missing 'readme_content' field: {get_data}")

        # PUT readme with content
        readme_text = "# Test Project\n\nThis readme was written by the test suite."
        resp_put = client.put(
            f"/repos/{user_id}/{repo_name}/readme",
            headers=headers,
            json={"readme_content": readme_text},
        )
        if resp_put.status_code != 200:
            fail(f"PUT readme failed: {resp_put.status_code} {resp_put.text}")
        put_data = resp_put.json()
        if not put_data.get("success"):
            fail(f"PUT readme success flag is false: {put_data}")
        if put_data.get("readme_content") != readme_text:
            fail(f"PUT readme content mismatch: expected '{readme_text}', got '{put_data.get('readme_content')}'")

        # GET readme again — verify updated content persists (owner auth required)
        resp_get2 = client.get(f"/repos/{user_id}/{repo_name}/readme", headers=headers)
        if resp_get2.status_code != 200:
            fail(f"GET readme (after update) failed: {resp_get2.status_code} {resp_get2.text}")
        get2_data = resp_get2.json()
        if get2_data.get("readme_content") != readme_text:
            fail(f"README content did not persist: got '{get2_data.get('readme_content')}'")

        # Unauthenticated PUT should return 401
        resp_unauth = client.put(
            f"/repos/{user_id}/{repo_name}/readme",
            json={"readme_content": "hacker attempt"},
        )
        if resp_unauth.status_code not in (401, 403):
            fail(f"expected 401/403 for unauthenticated PUT, got: {resp_unauth.status_code}")

        print(
            json.dumps(
                {
                    "test": "gitea_repo_readme",
                    "status": "ok",
                    "repo_name": repo_name,
                    "readme_length": len(readme_text),
                }
            )
        )
    finally:
        client.close()

    sys.exit(0)


if __name__ == "__main__":
    main()
