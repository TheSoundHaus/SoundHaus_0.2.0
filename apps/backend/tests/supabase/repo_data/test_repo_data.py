#!/usr/bin/env python3
"""
Public repos test.

Flow:
- GET /repos/public (public, no auth)
- Verify 200 and response contains repos list
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
    print(f"[repo_data] ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    base_url = os.environ.get("API_BASE_URL", "http://localhost:8000")

    client = httpx.Client(base_url=base_url, timeout=30.0)
    try:
        resp = client.get("/repos/public")
        if resp.status_code != 200:
            fail(f"get public repos failed: {resp.status_code} {resp.text}")
        data = resp.json()
        repos = data.get("repos") if isinstance(data, dict) else data
        if not isinstance(repos, list):
            fail(f"repos is not a list: {type(repos)}")
        print(json.dumps({"test": "supabase_repo_data", "status": "ok", "repo_count": len(repos)}))
    finally:
        client.close()
    sys.exit(0)


if __name__ == "__main__":
    main()
