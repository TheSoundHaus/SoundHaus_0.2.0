#!/usr/bin/env python3
"""
Auth reset_password test.

Flow:
- POST /api/auth/reset-password with {"email": TEST_USER_EMAIL}
- If PASSWORD_RESET_EMAIL_ENABLED=false: expect 503 with code password_reset_email_paused (skipped, exit 0)
- Else: verify 200, success=true
- Exit 0 on success/skip, 1 on failure
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
    print(f"[reset_password] ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    base_url = os.environ.get("API_BASE_URL", "http://localhost:8000")
    email = os.environ.get("TEST_USER_EMAIL")
    if not email:
        fail("TEST_USER_EMAIL must be set in the environment.")

    client = httpx.Client(base_url=base_url, timeout=30.0)
    try:
        resp = client.post("/api/auth/reset-password", json={"email": email})
        if resp.status_code == 503:
            try:
                data_skip = resp.json()
            except Exception:
                data_skip = {}
            if data_skip.get("code") == "password_reset_email_paused":
                print(
                    json.dumps(
                        {
                            "test": "auth_reset_password",
                            "status": "skipped",
                            "reason": "password_reset_email_paused",
                        }
                    )
                )
                return
        if resp.status_code != 200:
            fail(f"reset-password failed: {resp.status_code} {resp.text}")
        data = resp.json()
        if not data.get("success"):
            fail(f"success is not true: {data}")
        print(json.dumps({"test": "auth_reset_password", "status": "ok"}))
    finally:
        client.close()

    sys.exit(0)


if __name__ == "__main__":
    main()
