#!/usr/bin/env python3
"""
Genres list test.

Flow:
- GET /genres (public, no auth)
- Verify 200 and response contains genres list
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
    print(f"[genres] ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    base_url = os.environ.get("API_BASE_URL", "http://localhost:8000")

    client = httpx.Client(base_url=base_url, timeout=30.0)
    try:
        resp = client.get("/genres")
        if resp.status_code != 200:
            fail(f"get genres failed: {resp.status_code} {resp.text}")
        data = resp.json()
        genres = data.get("genres") if isinstance(data, dict) else data
        if not isinstance(genres, list):
            fail(f"genres is not a list: {type(genres)}")
        print(json.dumps({"test": "supabase_genres", "status": "ok", "genre_count": len(genres)}))
    finally:
        client.close()
    sys.exit(0)


if __name__ == "__main__":
    main()
