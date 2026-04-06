#!/usr/bin/env python3
"""
Gitea repo_snippet test.

Flow:
- Login, verify snippet metadata endpoint GET /repos/{user_id}/{repo_name}/snippet/metadata
- Use first repo from list or create one if empty
- Accept 200 or 404 as valid (no snippet may exist)
- Exit 0 on success, 1 on failure
"""

import json
import os
import sys
from pathlib import Path
import uuid

import httpx

# Load profile-aware .env.local/.env.remote when run directly
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from load_env import load_env as _load_env
_load_env()


def fail(message: str) -> None:
    print(f"[repo_snippet] ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    base_url = os.environ.get("API_BASE_URL", "http://localhost:8000")
    email = os.environ.get("TEST_USER_EMAIL")
    password = os.environ.get("TEST_USER_PASSWORD")
    if not email or not password:
        fail("TEST_USER_EMAIL and TEST_USER_PASSWORD must be set in the environment.")

    client = httpx.Client(base_url=base_url, timeout=60.0)
    try:
        resp = client.post("/api/auth/login", json={"email": email, "password": password})
        if resp.status_code != 200:
            fail(f"login failed: {resp.status_code} {resp.text}")
        data = resp.json()
        access_token = data.get("session", {}).get("access_token") or data.get("access_token")
        if not access_token:
            fail("no access_token found in login response")
        headers = {"Authorization": f"Bearer {access_token}"}

        resp_user = client.get("/api/auth/user", headers=headers)
        if resp_user.status_code != 200:
            fail(f"get user failed: {resp_user.status_code} {resp_user.text}")
        user_data = resp_user.json()
        if not user_data.get("success"):
            fail(f"get user success flag is false: {user_data}")
        user_id = user_data.get("user", {}).get("id")
        if not user_id:
            fail("no user id in user response")

        resp_repos = client.get("/repos", headers=headers)
        if resp_repos.status_code != 200:
            fail(f"list repos failed: {resp_repos.status_code} {resp_repos.text}")
        repos_data = resp_repos.json()
        if not repos_data.get("success"):
            fail(f"list repos success flag is false: {repos_data}")
        repos = repos_data.get("repos", [])

        if repos:
            first_repo = repos[0]
            full_name = first_repo.get("full_name", "")
            if full_name and "/" in full_name:
                owner, repo_name = full_name.split("/", 1)
            else:
                owner_obj = first_repo.get("owner", {})
                owner = owner_obj.get("login", str(user_id)) if isinstance(owner_obj, dict) else str(user_id)
                repo_name = first_repo.get("name", "")
        else:
            repo_name = f"test-snippet-{uuid.uuid4().hex[:8]}"
            owner = str(user_id)
            create_payload = {"name": repo_name, "description": "Temp repo for repo_snippet test", "private": True}
            resp_create = client.post("/repos", headers=headers, json=create_payload)
            if resp_create.status_code != 200:
                fail(f"create_repo failed: {resp_create.status_code} {resp_create.text}")

        resp_meta = client.get(f"/repos/{owner}/{repo_name}/snippet/metadata")
        if resp_meta.status_code not in (200, 404):
            fail(f"snippet metadata failed: {resp_meta.status_code} {resp_meta.text}")

        if resp_meta.status_code == 200:
            meta_data = resp_meta.json()
            has_snippet = meta_data.get("success") and meta_data.get("snippet")
        else:
            has_snippet = False

        print(json.dumps({"test": "gitea_repo_snippet", "status": "ok", "repo": f"{owner}/{repo_name}", "has_snippet": has_snippet}))
    finally:
        client.close()
    sys.exit(0)


if __name__ == "__main__":
    main()
