#!/usr/bin/env python3
"""
Look up a Supabase user by email and check if a Gitea account exists with that user id as username.
Also list all Gitea usernames.

Usage (from apps/backend):
  python scripts/check_user_supabase_gitea.py [EMAIL]
  EMAIL defaults to abc123@gmail.com

When using Docker Compose, run inside the fastapi container so Gitea URL and token work:
  docker compose exec fastapi python scripts/check_user_supabase_gitea.py [EMAIL]

Requires in .env:
  - SUPABASE_URL, SUPABASE_SERVICE_KEY (for Auth Admin API)
  - GITEA_URL (in container) or GITEA_PUBLIC_URL (on host), GITEA_ADMIN_TOKEN
"""
from __future__ import annotations

import os
import sys

# Load .env from backend root
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, backend_dir)
os.chdir(backend_dir)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(backend_dir, ".env"))
except ImportError:
    pass

import requests

DEFAULT_EMAIL = "abc123@gmail.com"


def get_supabase_user_id_by_email(email: str) -> str | None:
    """Get Supabase Auth user id for the given email using Auth Admin API."""
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set.")
        return None
    auth_url = f"{url}/auth/v1/admin/users"
    headers = {
        "Authorization": f"Bearer {key}",
        "apikey": key,
        "Content-Type": "application/json",
    }
    page = 1
    per_page = 100
    while True:
        resp = requests.get(auth_url, headers=headers, params={"page": page, "per_page": per_page}, timeout=15)
        if resp.status_code != 200:
            print(f"Supabase Auth Admin API error: {resp.status_code} {resp.text[:200]}")
            return None
        data = resp.json()
        users = data.get("users") if isinstance(data, dict) else data
        if not users:
            break
        for u in users:
            if (u.get("email") or "").strip().lower() == email.strip().lower():
                return u.get("id")
        if len(users) < per_page:
            break
        page += 1
    return None


def get_all_gitea_usernames() -> list[dict]:
    """List all Gitea users (login, id, email) via Admin API."""
    # Prefer GITEA_URL so that inside Docker (fastapi container) we use http://gitea:3000.
    # When running on host, set GITEA_URL=http://localhost:3000 if needed.
    base = (os.environ.get("GITEA_URL") or os.environ.get("GITEA_PUBLIC_URL") or "http://localhost:3000").rstrip("/")
    token = os.environ.get("GITEA_ADMIN_TOKEN")
    if not token:
        print("GITEA_ADMIN_TOKEN must be set.")
        return []
    url = f"{base}/api/v1/admin/users"
    headers = {"Authorization": f"token {token}", "Content-Type": "application/json"}
    result = []
    page = 1
    limit = 50
    while True:
        resp = requests.get(url, headers=headers, params={"page": page, "limit": limit}, timeout=15)
        if resp.status_code == 401:
            print("Gitea Admin API 401: check GITEA_ADMIN_TOKEN. From host use GITEA_PUBLIC_URL for Gitea URL.")
            return result
        if resp.status_code != 200:
            print(f"Gitea Admin API error: {resp.status_code} {resp.text[:200]}")
            return result
        users = resp.json()
        if not users:
            break
        for u in users:
            result.append({"login": u.get("login"), "id": u.get("id"), "email": u.get("email")})
        if len(users) < limit:
            break
        page += 1
    return result


def main() -> None:
    email = (sys.argv[1] if len(sys.argv) > 1 else DEFAULT_EMAIL).strip()
    if not email:
        print("Usage: python scripts/check_user_supabase_gitea.py [EMAIL]")
        sys.exit(1)

    print(f"Email: {email}")
    print("-" * 50)

    # 1) Supabase user id
    user_id = get_supabase_user_id_by_email(email)
    if user_id is None:
        print("Supabase: no user found for this email (or Auth Admin API not configured).")
    else:
        print(f"Supabase user id: {user_id}")

    # 2) All Gitea users
    gitea_users = get_all_gitea_usernames()
    print(f"\nGitea: total users = {len(gitea_users)}")
    if gitea_users:
        print("Gitea usernames (login):")
        for u in gitea_users:
            login = u.get("login") or ""
            uid = u.get("id")
            em = u.get("email") or ""
            print(f"  - {login!r} (id={uid}, email={em})")

    # 3) Check if Supabase user id exists as Gitea username
    if user_id and gitea_users:
        logins = [u.get("login") for u in gitea_users if u.get("login")]
        exists_exact = user_id in logins
        exists_lower = user_id.lower() in [s.lower() for s in logins if s]
        if exists_exact:
            print(f"\nGitea account with username {user_id!r} exists (exact match).")
        elif exists_lower:
            print(f"\nGitea account with username matching {user_id!r} exists (case-insensitive).")
        else:
            print(f"\nNo Gitea account with username {user_id!r} found.")


if __name__ == "__main__":
    main()
