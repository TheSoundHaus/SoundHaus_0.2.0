#!/usr/bin/env python3
"""
Auth refresh test.

Flow:
- Login first (get refresh_token from response), then POST /api/auth/refresh with refresh_token
- Verify 200, success=true, new access_token returned
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
    print(f"[refresh] ERROR: {message}", file=sys.stderr)
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
        refresh_token = data.get("session", {}).get("refresh_token") or data.get("refresh_token")
        if not refresh_token:
            fail("no refresh_token found in login response")

        resp2 = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
        if resp2.status_code != 200:
            fail(f"refresh failed: {resp2.status_code} {resp2.text}")
        data2 = resp2.json()
        if not data2.get("success"):
            fail(f"success is not true: {data2}")
        new_access_token = data2.get("session", {}).get("access_token") or data2.get("access_token")
        if not new_access_token:
            fail("no access_token found in refresh response")
        print(json.dumps({"test": "auth_refresh", "status": "ok"}))
    finally:
        client.close()

    sys.exit(0)


if __name__ == "__main__":
    main()
