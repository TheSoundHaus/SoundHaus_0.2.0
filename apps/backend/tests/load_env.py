"""
Shared env-loader for individual test scripts.

When running a test directly (e.g. ``python tests/gitea/list_repos/test_list_repos.py``),
this module replicates the profile-aware env loading that ``run_all.py`` performs before
spawning each test as a subprocess.

Usage (add near the top of any test script's ``main()`` or at module level):

    from tests.load_env import load_env
    load_env()

    # or, when running from the test's own directory:
    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
    from load_env import load_env
    load_env()
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Resolve paths relative to this file's location (tests/)
TESTS_DIR = Path(__file__).resolve().parent
BACKEND_DIR = TESTS_DIR.parent
REPO_ROOT = BACKEND_DIR.parent.parent


def _load_env_file(env_file: Path) -> None:
    """Load one env file into os.environ with override enabled."""
    try:
        from dotenv import load_dotenv
        load_dotenv(env_file, override=True)
    except ImportError:
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ[key.strip()] = value.strip()


def _detect_profile() -> str:
    """Read compose profile marker and normalize to local/remote."""
    profile_file = REPO_ROOT / ".soundhaus-compose-profile"
    if not profile_file.exists():
        return "local"
    profile = profile_file.read_text(encoding="utf-8").strip().lower()
    if profile in {"local", "remote"}:
        return profile
    print(
        f"WARNING: {profile_file} has invalid value {profile!r}; defaulting to local.",
        file=sys.stderr,
    )
    return "local"


def load_env() -> tuple[str, Path]:
    """
    Load the profile-aware env file (.env.local or .env.remote) into os.environ.

    Returns (profile, loaded_file). Safe to call multiple times — subsequent calls
    are no-ops if the env vars are already set (dotenv respects override=True but
    the values were already populated from the first call).
    """
    profile = _detect_profile()
    profile_env_file = BACKEND_DIR / f".env.{profile}"
    fallback_env_file = BACKEND_DIR / ".env"

    if profile_env_file.exists():
        _load_env_file(profile_env_file)
        return profile, profile_env_file

    print(
        f"WARNING: {profile_env_file} not found; falling back to {fallback_env_file}.",
        file=sys.stderr,
    )
    if fallback_env_file.exists():
        _load_env_file(fallback_env_file)
    else:
        print(f"WARNING: {fallback_env_file} not found", file=sys.stderr)
    return profile, fallback_env_file
