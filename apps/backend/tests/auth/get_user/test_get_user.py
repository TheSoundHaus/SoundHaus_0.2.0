#!/usr/bin/env python3
"""
Auth get_user test.

Flow:
- Login first, then GET /api/auth/user with Bearer token
- Verify 200, success=true, user object has id and email
- Exit 0 on success, 1 on failure
"""

import json
import os
import sys
from pathlib import Path

import httpx

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[3] / ".env", override=True)
except ImportError:
    pass


def fail(message: str) -> None:
    print(f"[get_user] ERROR: {message}", file=sys.stderr)
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

        resp2 = client.get("/api/auth/user", headers=headers)
        if resp2.status_code != 200:
            fail(f"get_user failed: {resp2.status_code} {resp2.text}")
        data2 = resp2.json()
        if not data2.get("success"):
            fail(f"success is not true: {data2}")
        user = data2.get("user", {})
        if not user.get("id"):
            fail("user object missing id")
        if not user.get("email"):
            fail("user object missing email")
        print(json.dumps({"test": "auth_get_user", "status": "ok"}))
    finally:
        client.close()

    sys.exit(0)


if __name__ == "__main__":
    main()
