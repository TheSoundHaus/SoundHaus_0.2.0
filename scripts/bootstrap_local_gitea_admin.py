#!/usr/bin/env python3
"""
Bootstrap a local Gitea admin user, personal access token, and webhook secret.

Prerequisites:
  - Docker running with the `gitea` container up (same compose setup as SoundHaus).
  - Default exec user is `git` (matches gitea/gitea image).

Usage:
  python scripts/bootstrap_local_gitea_admin.py
  python scripts/bootstrap_local_gitea_admin.py --username admin --email admin@local.test

Copy the printed GITEA_* lines into apps/backend/.env.local (and restart fastapi if needed).

For webhooks on the Docker network without ngrok, set:
  WEBHOOK_BASE_URL=http://fastapi:8000
(GITEA__webhook__ALLOWED_HOST_LIST must include `fastapi` — already set in docker-compose.yml.)
"""

from __future__ import annotations

import argparse
import re
import secrets
import subprocess
import sys
from typing import List, Sequence

# Enough scope for SoundHaus backend admin API (users, repos, hooks).
DEFAULT_TOKEN_SCOPES = (
    "read:user,write:user,read:repository,write:repository,"
    "read:admin,write:admin,read:organization,write:organization"
)


def run_gitea(container: str, args: Sequence[str], *, timeout: int = 60) -> subprocess.CompletedProcess[str]:
    cmd: List[str] = [
        "docker",
        "exec",
        "-u",
        "git",
        container,
        "gitea",
        *args,
    ]
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def user_exists_message(stderr: str, stdout: str) -> bool:
    combined = f"{stderr}\n{stdout}".lower()
    patterns = (
        "already exists",
        "user already",
        "username has been already taken",
        "email has been already taken",
    )
    return any(p in combined for p in patterns)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create local Gitea admin + PAT + webhook secret (docker exec)."
    )
    parser.add_argument("--container", default="gitea", help="Docker container name (default: gitea)")
    parser.add_argument("--username", default="soundhaus-admin", help="Gitea admin username")
    parser.add_argument("--email", default="soundhaus-admin@local.dev", help="Gitea admin email")
    parser.add_argument(
        "--password",
        default="",
        help="Admin password (default: random; only echoed if user was created or password set here)",
    )
    parser.add_argument(
        "--token-name",
        default="soundhaus-backend-local",
        help="Name for the generated personal access token",
    )
    parser.add_argument(
        "--scopes",
        default=DEFAULT_TOKEN_SCOPES,
        help="Comma-separated Gitea token scopes (use 'all' if Gitea rejects this list)",
    )
    args = parser.parse_args()

    explicit_password = bool(args.password)
    password = args.password or secrets.token_urlsafe(24)

    create = run_gitea(
        args.container,
        [
            "admin",
            "user",
            "create",
            "--username",
            args.username,
            "--password",
            password,
            "--email",
            args.email,
            "--admin",
            "--must-change-password=false",
        ],
    )
    created_new = create.returncode == 0
    if not created_new:
        if user_exists_message(create.stderr, create.stdout):
            print(
                f"Note: Gitea user '{args.username}' already exists; skipping create.\n",
                file=sys.stderr,
            )
        else:
            print("Failed to create Gitea admin user:\n", file=sys.stderr)
            print(create.stderr or create.stdout, file=sys.stderr)
            return 1

    token_proc = run_gitea(
        args.container,
        [
            "admin",
            "user",
            "generate-access-token",
            "--username",
            args.username,
            "--token-name",
            args.token_name,
            "--scopes",
            args.scopes,
            "--raw",
        ],
    )
    if token_proc.returncode != 0:
        print("Failed to generate access token:\n", file=sys.stderr)
        print(token_proc.stderr or token_proc.stdout, file=sys.stderr)
        print(
            "\nIf the token name is already taken, pick a new one:\n"
            f"  --token-name {args.token_name}-{secrets.token_hex(3)}\n",
            file=sys.stderr,
        )
        return 1

    token = (token_proc.stdout or "").strip()
    if not token or re.search(r"\s", token):
        print("Unexpected token output from Gitea:\n", file=sys.stderr)
        print(token_proc.stdout, file=sys.stderr)
        return 1

    webhook_secret = secrets.token_urlsafe(48).rstrip("=")

    print()
    print("# --- Paste into apps/backend/.env.local (or merge with existing) ---")
    print(f"GITEA_ADMIN_TOKEN={token}")
    print(f"GITEA_WEBHOOK_SECRET={webhook_secret}")
    print("# Suggested for same-host Docker (Gitea -> FastAPI); adjust if you use ngrok:")
    print("WEBHOOK_BASE_URL=http://fastapi:8000")
    if created_new or explicit_password:
        print("# --- Gitea UI login ---")
        print(f"# username={args.username}")
        print(f"# password={password}")
    else:
        print(
            "# Gitea UI password not shown (user already existed). "
            "Use --password on next run if you need a known password.",
        )
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
