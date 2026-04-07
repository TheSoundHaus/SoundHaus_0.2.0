#!/usr/bin/env python3
"""
Gitea repo_thumbnail test.

Flow:
- Login, create a temp repo, get user_id via GET /api/auth/user
- PUT /repos/{user_id}/{repo_name}/thumbnail with a YouTube URL → verify 200 + success
- PUT /repos/{user_id}/{repo_name}/thumbnail with an invalid type → verify 400
- PUT /repos/{user_id}/{repo_name}/thumbnail with a bad YouTube URL → verify 400
- DELETE /repos/{user_id}/{repo_name}/thumbnail → verify 200 + success
- Verify 403 when non-owner tries PUT (mismatched user_id in URL)
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
    print(f"[repo_thumbnail] ERROR: {message}", file=sys.stderr)
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
        repo_name = f"test-thumb-{uuid.uuid4().hex[:8]}"
        resp_create = client.post(
            "/repos",
            headers=headers,
            json={"name": repo_name, "description": "Temp repo for repo_thumbnail test", "private": True},
        )
        if resp_create.status_code != 200:
            fail(f"create_repo failed: {resp_create.status_code} {resp_create.text}")
        if not resp_create.json().get("success"):
            fail(f"create_repo success flag is false: {resp_create.json()}")

        # PUT thumbnail with a valid YouTube URL
        yt_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        resp_put = client.put(
            f"/repos/{user_id}/{repo_name}/thumbnail",
            headers=headers,
            json={"type": "youtube", "url": yt_url},
        )
        if resp_put.status_code != 200:
            fail(f"PUT thumbnail (youtube) failed: {resp_put.status_code} {resp_put.text}")
        put_data = resp_put.json()
        if not put_data.get("success"):
            fail(f"PUT thumbnail success flag is false: {put_data}")
        if put_data.get("thumbnail_url") != yt_url:
            fail(f"thumbnail_url mismatch: expected '{yt_url}', got '{put_data.get('thumbnail_url')}'")
        if put_data.get("thumbnail_type") != "youtube":
            fail(f"thumbnail_type mismatch: expected 'youtube', got '{put_data.get('thumbnail_type')}'")

        # PUT thumbnail with an invalid type → 400
        resp_bad_type = client.put(
            f"/repos/{user_id}/{repo_name}/thumbnail",
            headers=headers,
            json={"type": "soundcloud", "url": "https://soundcloud.com/foo"},
        )
        if resp_bad_type.status_code != 400:
            fail(f"expected 400 for invalid type, got: {resp_bad_type.status_code} {resp_bad_type.text}")

        # PUT thumbnail with a bad YouTube URL → 400
        resp_bad_url = client.put(
            f"/repos/{user_id}/{repo_name}/thumbnail",
            headers=headers,
            json={"type": "youtube", "url": "https://not-youtube.com/watch?v=abc123"},
        )
        if resp_bad_url.status_code != 400:
            fail(f"expected 400 for invalid YouTube URL, got: {resp_bad_url.status_code} {resp_bad_url.text}")

        # PUT thumbnail with wrong owner in URL → 403
        fake_owner = str(uuid.uuid4())
        resp_403 = client.put(
            f"/repos/{fake_owner}/{repo_name}/thumbnail",
            headers=headers,
            json={"type": "youtube", "url": yt_url},
        )
        if resp_403.status_code != 403:
            fail(f"expected 403 for wrong owner, got: {resp_403.status_code} {resp_403.text}")

        # DELETE thumbnail
        resp_del = client.delete(f"/repos/{user_id}/{repo_name}/thumbnail", headers=headers)
        if resp_del.status_code != 200:
            fail(f"DELETE thumbnail failed: {resp_del.status_code} {resp_del.text}")
        del_data = resp_del.json()
        if not del_data.get("success"):
            fail(f"DELETE thumbnail success flag is false: {del_data}")

        print(
            json.dumps(
                {
                    "test": "gitea_repo_thumbnail",
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
