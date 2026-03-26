#!/usr/bin/env python3
"""
Supabase DB connection test.

Flow:
- GET /health to verify FastAPI and DB connectivity
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
    print(f"[db_connection] ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    base_url = os.environ.get("API_BASE_URL", "http://localhost:8000")

    client = httpx.Client(base_url=base_url, timeout=30.0)
    try:
        resp = client.get("/health")
        if resp.status_code != 200:
            fail(f"health check failed: {resp.status_code} {resp.text}")
        print(json.dumps({"test": "supabase_db_connection", "status": "ok"}))
    finally:
        client.close()
    sys.exit(0)


if __name__ == "__main__":
    main()
