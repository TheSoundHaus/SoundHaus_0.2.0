#!/usr/bin/env python3
"""
Gitea repo_contents test.

Flow:
- Login, create temp repo, upload a file, then GET /repos/{repo_name}/contents to verify the file appears
- Print repo_name and file count
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
    print(f"[repo_contents] ERROR: {message}", file=sys.stderr)
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

        repo_name = f"test-contents-{uuid.uuid4().hex[:8]}"
        create_payload = {"name": repo_name, "description": "Temp repo for repo_contents test", "private": True}
        resp_repo = client.post("/repos", headers=headers, json=create_payload)
        if resp_repo.status_code != 200:
            fail(f"create_repo failed: {resp_repo.status_code} {resp_repo.text}")
        if not resp_repo.json().get("success"):
            fail(f"create_repo success flag is false: {resp_repo.json()}")

        file_path = "test_contents.txt"
        upload_payload = {
            "file_path": file_path,
            "content": "hello from repo_contents test\n",
            "message": "Add test file",
            "branch": "main",
        }
        resp_up = client.post(f"/repos/{repo_name}/upload", headers=headers, json=upload_payload)
        if resp_up.status_code != 200:
            fail(f"upload failed: {resp_up.status_code} {resp_up.text}")
        if not resp_up.json().get("success"):
            fail(f"upload success flag is false: {resp_up.json()}")

        resp_contents = client.get(f"/repos/{repo_name}/contents", headers=headers)
        if resp_contents.status_code != 200:
            fail(f"get contents failed: {resp_contents.status_code} {resp_contents.text}")
        contents_data = resp_contents.json()
        if not contents_data.get("success"):
            fail(f"get contents success flag is false: {contents_data}")
        contents = contents_data.get("contents", [])
        if not isinstance(contents, list):
            fail(f"contents is not a list: {type(contents)}")
        file_count = len(contents)

        print(json.dumps({"test": "gitea_repo_contents", "status": "ok", "repo_name": repo_name, "file_count": file_count}))
    finally:
        client.close()
    sys.exit(0)


if __name__ == "__main__":
    main()
