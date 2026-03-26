#!/usr/bin/env python3
"""
PAT CRUD test.

Flow:
- Login, create a PAT, list PATs, delete the created PAT
- Exit 0 on success, 1 on failure
"""

import json
import os
import sys
import uuid
from pathlib import Path

import httpx

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[3] / ".env", override=True)
except ImportError:
    pass


def fail(message: str) -> None:
    print(f"[pat_crud] ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    base_url = os.environ.get("API_BASE_URL", "http://localhost:8000")
    email = os.environ.get("TEST_USER_EMAIL")
    password = os.environ.get("TEST_USER_PASSWORD")
    if not email or not password:
        fail("TEST_USER_EMAIL and TEST_USER_PASSWORD must be set in the environment.")

    client = httpx.Client(base_url=base_url, timeout=30.0)
    try:
        resp = client.post("/api/auth/login", json={"email": email, "password": password})
        if resp.status_code != 200:
            fail(f"login failed: {resp.status_code} {resp.text}")
        data = resp.json()
        access_token = data.get("session", {}).get("access_token") or data.get("access_token")
        if not access_token:
            fail("no access_token found in login response")
        headers = {"Authorization": f"Bearer {access_token}"}

        token_name = f"test-pat-{uuid.uuid4().hex[:8]}"
        resp_create = client.post("/api/auth/tokens", headers=headers, json={"name": token_name})
        if resp_create.status_code != 200:
            fail(f"create PAT failed: {resp_create.status_code} {resp_create.text}")
        create_data = resp_create.json()
        if not create_data.get("success"):
            fail(f"create PAT success flag is false: {create_data}")
        token_id = create_data.get("token", {}).get("id") or create_data.get("token_id")
        if not token_id:
            fail(f"no token_id returned from create: {create_data}")

        resp_list = client.get("/api/auth/tokens", headers=headers)
        if resp_list.status_code != 200:
            fail(f"list PATs failed: {resp_list.status_code} {resp_list.text}")

        resp_delete = client.delete(f"/api/auth/tokens/{token_id}", headers=headers)
        if resp_delete.status_code != 200:
            fail(f"delete PAT failed: {resp_delete.status_code} {resp_delete.text}")

        print(json.dumps({"test": "supabase_pat_crud", "status": "ok", "token_name": token_name}))
    finally:
        client.close()
    sys.exit(0)


if __name__ == "__main__":
    main()
