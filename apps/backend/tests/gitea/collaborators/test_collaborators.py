#!/usr/bin/env python3
"""
Gitea collaborators test.

Flow:
- Login, GET /api/auth/user for user_id, create temp repo, then
  GET /repos/{user_id}/{repo_name}/collaborators with Bearer token
- Verify 200+success, collaborators is a list
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
    print(f"[collaborators] ERROR: {message}", file=sys.stderr)
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

        repo_name = f"test-collab-{uuid.uuid4().hex[:8]}"
        create_payload = {"name": repo_name, "description": "Temp repo for collaborators test", "private": True}
        resp_repo = client.post("/repos", headers=headers, json=create_payload)
        if resp_repo.status_code != 200:
            fail(f"create_repo failed: {resp_repo.status_code} {resp_repo.text}")
        if not resp_repo.json().get("success"):
            fail(f"create_repo success flag is false: {resp_repo.json()}")

        resp_collab = client.get(f"/repos/{user_id}/{repo_name}/collaborators", headers=headers)
        if resp_collab.status_code != 200:
            fail(f"list collaborators failed: {resp_collab.status_code} {resp_collab.text}")
        collab_data = resp_collab.json()
        if not collab_data.get("success"):
            fail(f"list collaborators success flag is false: {collab_data}")
        collaborators = collab_data.get("collaborators", [])
        if not isinstance(collaborators, list):
            fail(f"collaborators is not a list: {type(collaborators)}")

        print(json.dumps({"test": "gitea_collaborators", "status": "ok", "repo_name": repo_name, "collaborator_count": len(collaborators)}))
    finally:
        client.close()
    sys.exit(0)


if __name__ == "__main__":
    main()
