#!/usr/bin/env python3
"""
Auth desktop_login test.

Flow:
- POST /api/auth/desktop-login with TEST_USER_EMAIL/PASSWORD
- Verify 200, check response has credentials/tokens
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
    print(f"[desktop_login] ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    base_url = os.environ.get("API_BASE_URL", "http://localhost:8000")
    email = os.environ.get("TEST_USER_EMAIL")
    password = os.environ.get("TEST_USER_PASSWORD")
    if not email or not password:
        fail("TEST_USER_EMAIL and TEST_USER_PASSWORD must be set in the environment.")

    client = httpx.Client(base_url=base_url, timeout=30.0)
    try:
        resp = client.post("/api/auth/desktop-login", json={"email": email, "password": password})
        if resp.status_code != 200:
            fail(f"desktop-login failed: {resp.status_code} {resp.text}")
        data = resp.json()
        if not data.get("success"):
            fail(f"success is not true: {data}")
        session = data.get("session", {})
        access_token = session.get("access_token") or data.get("access_token")
        if not access_token:
            fail("no access_token found in desktop-login response")
        desktop_creds = data.get("desktop_credentials", {})
        if not desktop_creds.get("pat"):
            fail("no pat in desktop_credentials")
        print(json.dumps({"test": "auth_desktop_login", "status": "ok"}))
    finally:
        client.close()

    sys.exit(0)


if __name__ == "__main__":
    main()
