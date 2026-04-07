#!/usr/bin/env python3
"""
Gitea desktop_credentials test.

Flow:
- Login with POST /api/auth/login, then GET /desktop/credentials with Bearer token
- Verify 200 and response contains credential data
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
    print(f"[desktop_credentials] ERROR: {message}", file=sys.stderr)
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

        resp_creds = client.get("/desktop/credentials", headers=headers)
        if resp_creds.status_code != 200:
            fail(f"desktop credentials failed: {resp_creds.status_code} {resp_creds.text}")
        creds_data = resp_creds.json()
        if not creds_data.get("success"):
            fail(f"desktop credentials success flag is false: {creds_data}")
        if "gitea_url" not in creds_data and "token" not in creds_data:
            fail("response missing credential data (gitea_url or token)")

        print(json.dumps({"test": "gitea_desktop_credentials", "status": "ok"}))
    finally:
        client.close()
    sys.exit(0)


if __name__ == "__main__":
    main()
