#!/usr/bin/env python3
"""
Gitea upload_delete_file test.

Flow:
- Login with TEST_USER_EMAIL / TEST_USER_PASSWORD
- Create a temporary repo for this test
- Upload a small text file to the repo
- Delete the same file
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
    print(f"[upload_delete_file] ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def login_and_get_token(client: httpx.Client, base_url: str) -> str:
    email = os.environ.get("TEST_USER_EMAIL")
    password = os.environ.get("TEST_USER_PASSWORD")
    if not email or not password:
        fail("TEST_USER_EMAIL and TEST_USER_PASSWORD must be set in the environment.")

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
    return access_token


def main() -> None:
    base_url = os.environ.get("API_BASE_URL", "http://localhost:8000")
    client = httpx.Client(base_url=base_url, timeout=30.0)

    try:
        token = login_and_get_token(client, base_url)
        headers = {"Authorization": f"Bearer {token}"}

        # Create a temporary repo for this test run
        repo_name = f"test-files-{uuid.uuid4().hex[:8]}"
        create_payload = {
            "name": repo_name,
            "description": "Temp repo for upload/delete file test",
            "private": True,
        }
        resp_repo = client.post("/repos", headers=headers, json=create_payload)
        if resp_repo.status_code != 200:
            fail(f"create_repo failed: {resp_repo.status_code} {resp_repo.text}")
        repo_body = resp_repo.json()
        if not repo_body.get("success"):
            fail(f"create_repo success flag is false: {repo_body}")

        # Upload a small text file
        file_path = "test_upload_delete.txt"
        upload_payload = {
            "file_path": file_path,
            "content": "hello from upload_delete_file test\n",
            "message": "Add test file from upload_delete_file test",
            "branch": "main",
        }
        resp_up = client.post(
            f"/repos/{repo_name}/upload",
            headers=headers,
            json=upload_payload,
        )
        if resp_up.status_code != 200:
            fail(f"upload_file failed: {resp_up.status_code} {resp_up.text}")
        up_body = resp_up.json()
        if not up_body.get("success"):
            fail(f"upload_file success flag is false: {up_body}")

        # Delete the same file
        delete_payload = {
            "message": "Delete test file from upload_delete_file test",
            "branch": "main",
        }
        resp_del = client.request(
            "DELETE",
            f"/repos/{repo_name}/contents",
            headers={**headers, "Content-Type": "application/json"},
            params={"file_path": file_path},
            content=json.dumps(delete_payload),
        )
        if resp_del.status_code != 200:
            fail(f"delete_file failed: {resp_del.status_code} {resp_del.text}")
        del_body = resp_del.json()
        if not del_body.get("success"):
            fail(f"delete_file success flag is false: {del_body}")

        print(
            json.dumps(
                {
                    "test": "gitea_upload_delete_file",
                    "status": "ok",
                    "repo_name": repo_name,
                    "file_path": file_path,
                }
            )
        )
    finally:
        client.close()

    sys.exit(0)


if __name__ == "__main__":
    main()

