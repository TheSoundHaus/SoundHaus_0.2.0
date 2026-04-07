#!/usr/bin/env python3
"""
Gitea enriched_repos test.

Flow:
- Login, create a temp repo so the user has at least one repo
- GET /repos/enriched → verify 200 + success + repos is a list with expected fields
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
    print(f"[enriched_repos] ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    base_url = os.environ.get("API_BASE_URL", "http://localhost:8000")
    email = os.environ.get("TEST_USER_EMAIL")
    password = os.environ.get("TEST_USER_PASSWORD")

    if not email or not password:
        fail("TEST_USER_EMAIL and TEST_USER_PASSWORD must be set in the environment.")

    client = httpx.Client(base_url=base_url, timeout=60.0)
    try:
        # Login
        resp = client.post("/api/auth/login", json={"email": email, "password": password})
        if resp.status_code != 200:
            fail(f"login failed: {resp.status_code} {resp.text}")

        data = resp.json()
        access_token = (
            data.get("session", {}).get("access_token")
            or data.get("access_token")
        )
        if not access_token:
            fail("no access_token found in login response")
        headers = {"Authorization": f"Bearer {access_token}"}

        # Create a temp repo to ensure at least one repo exists
        repo_name = f"test-enriched-{uuid.uuid4().hex[:8]}"
        resp_create = client.post(
            "/repos",
            headers=headers,
            json={"name": repo_name, "description": "Temp repo for enriched_repos test", "private": True},
        )
        if resp_create.status_code != 200:
            fail(f"create_repo failed: {resp_create.status_code} {resp_create.text}")
        if not resp_create.json().get("success"):
            fail(f"create_repo success flag is false: {resp_create.json()}")

        # GET /repos/enriched
        resp_enriched = client.get("/repos/enriched", headers=headers)
        if resp_enriched.status_code != 200:
            fail(f"enriched_repos failed: {resp_enriched.status_code} {resp_enriched.text}")

        body = resp_enriched.json()
        if not body.get("success"):
            fail(f"enriched_repos success flag is false: {body}")

        repos = body.get("repos")
        if not isinstance(repos, list):
            fail(f"enriched_repos 'repos' is not a list: {type(repos)}")

        # Verify shape of enriched fields on any returned repo
        if repos:
            first = repos[0]
            for field in ("name", "full_name", "private", "clone_count", "genres", "is_starred", "role"):
                if field not in first:
                    fail(f"enriched repo missing expected field '{field}': {first}")

        print(
            json.dumps(
                {
                    "test": "gitea_enriched_repos",
                    "status": "ok",
                    "repo_count": len(repos),
                }
            )
        )
    finally:
        client.close()

    sys.exit(0)


if __name__ == "__main__":
    main()
