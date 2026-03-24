#!/usr/bin/env python3
"""
Test runner. Discovers and runs test scripts under auth/, gitea/, supabase/.
Writes results and logs into each feature folder (at most the five newest ``run_*.log``
files per feature). Optional console output of captured stdout/stderr:

  --logs          print logs for every test (pass or fail)
  --log-failures  print logs only for failed tests
  (neither)       status lines only (OK / FAIL)

Use --dry-run to list without running.

Loads profile-aware env from apps/backend/.env.local or apps/backend/.env.remote,
selected by repo root marker file .soundhaus-compose-profile ("local" or "remote").
If the marker is missing/invalid, it falls back to local. If the profile file is
missing, it falls back to apps/backend/.env for backward compatibility.

Target API:
  --base-url  explicit URL override
  (none)      API_BASE_URL from loaded env, else http://localhost:8000

Usage:
  python tests/run_all.py [--base-url URL] [--auth | --gitea | --supabase] [--dry-run]
  python tests/run_all.py --logs
  python tests/run_all.py --gitea --log-failures
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent
BACKEND_DIR = TESTS_DIR.parent
REPO_ROOT = BACKEND_DIR.parent.parent
SYSTEMS = ("auth", "gitea", "supabase")
SCRIPT_GLOB = "test_*.py"
MAX_RUN_LOGS = 5


def load_env_file(env_file: Path) -> None:
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


def detect_profile() -> str:
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
    """Load profile env file with fallback and return (profile, loaded_file)."""
    profile = detect_profile()
    profile_env_file = BACKEND_DIR / f".env.{profile}"
    fallback_env_file = BACKEND_DIR / ".env"

    if profile_env_file.exists():
        load_env_file(profile_env_file)
        return profile, profile_env_file

    print(
        f"WARNING: {profile_env_file} not found; falling back to {fallback_env_file}.",
        file=sys.stderr,
    )
    if fallback_env_file.exists():
        load_env_file(fallback_env_file)
    else:
        print(f"WARNING: {fallback_env_file} not found", file=sys.stderr)
    return profile, fallback_env_file


def find_feature_scripts(system: str) -> list[tuple[str, Path]]:
    features: list[tuple[str, Path]] = []
    system_dir = TESTS_DIR / system
    if not system_dir.is_dir():
        return features
    for feature_dir in sorted(system_dir.iterdir()):
        if not feature_dir.is_dir():
            continue
        for script in sorted(feature_dir.glob(SCRIPT_GLOB)):
            if script.is_file():
                features.append((f"{system}/{feature_dir.name}", script))
    return features


def run_script(script: Path, base_url: str, env: dict) -> tuple[int, str, dict]:
    env = {**os.environ, **env, "API_BASE_URL": base_url}
    try:
        result = subprocess.run(
            [sys.executable, str(script)],
            cwd=script.parent,
            env=env,
            capture_output=True,
            text=True,
            timeout=60,
        )
        out = (result.stdout or "").strip() + "\n" + (result.stderr or "").strip()
        return result.returncode, out, {"exit_code": result.returncode, "stdout": result.stdout, "stderr": result.stderr}
    except subprocess.TimeoutExpired:
        return -1, "timeout", {"exit_code": -1, "error": "timeout"}
    except Exception as e:
        return -1, str(e), {"exit_code": -1, "error": str(e)}


def emit_captured_log(feature_name: str, log_out: str) -> None:
    """Print combined stdout/stderr for one test run."""
    body = (log_out or "").strip()
    print(f"----- log: {feature_name} -----")
    if body:
        print(body)
    else:
        print("(no output)")
    print(f"----- end log: {feature_name} -----")


def prune_run_logs(logs_dir: Path, keep: int = MAX_RUN_LOGS) -> None:
    """Keep only the ``keep`` most recently modified ``run_*.log`` files under ``logs_dir``."""
    paths = sorted(
        logs_dir.glob("run_*.log"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for path in paths[keep:]:
        try:
            path.unlink()
        except OSError:
            pass


def main() -> int:
    profile, loaded_env_file = load_env()
    print("PROFILE:", profile)
    print("ENV_FILE:", loaded_env_file)
    print("TEST_USER_EMAIL:", os.environ.get("TEST_USER_EMAIL", "(not set)"))
    print("TEST_USER_PASSWORD:", os.environ.get("TEST_USER_PASSWORD", "(not set)"))
    parser = argparse.ArgumentParser(description="Run Phase 0 feature tests")
    parser.add_argument("--auth", action="store_true", help="Run only auth tests")
    parser.add_argument("--gitea", action="store_true", help="Run only gitea tests")
    parser.add_argument("--supabase", action="store_true", help="Run only supabase tests")
    parser.add_argument("--base-url", metavar="URL", default=None, help="Explicit API base URL")
    parser.add_argument("--dry-run", action="store_true", help="Only list tests, do not run")
    parser.add_argument(
        "--logs",
        action="store_true",
        help="Print captured stdout/stderr for every test",
    )
    parser.add_argument(
        "--log-failures",
        action="store_true",
        help="Print captured stdout/stderr only for failed tests",
    )
    parser.add_argument(
        "--feature",
        metavar="NAME",
        help=(
            "Run a single feature by path (e.g. gitea/collaborators, supabase/webhook_deliveries). "
            "Same logging flags apply."
        ),
    )
    args = parser.parse_args()

    base_url = args.base_url or os.environ.get("API_BASE_URL", "http://localhost:8000")

    print("API_BASE_URL:", base_url)

    if args.auth:
        systems = ["auth"]
    elif args.gitea:
        systems = ["gitea"]
    elif args.supabase:
        systems = ["supabase"]
    else:
        systems = list(SYSTEMS)

    all_scripts: list[tuple[str, Path]] = []
    for system in systems:
        all_scripts.extend(find_feature_scripts(system))

    if args.feature:
        want = args.feature.strip().strip("/").replace("\\", "/")
        all_scripts = [(n, p) for n, p in all_scripts if n == want]
        if not all_scripts:
            print(f"No test script found for feature {want!r}.", file=sys.stderr)
            print("Use --dry-run to list available features.", file=sys.stderr)
            return 1

    if not all_scripts:
        print("No test scripts found.", file=sys.stderr)
        return 0

    if args.dry_run:
        for name, script in all_scripts:
            print(name, script)
        return 0

    env = {"API_BASE_URL": base_url}
    failed = 0
    for feature_name, script in all_scripts:
        feature_dir = script.parent
        results_dir = feature_dir / "results"
        logs_dir = feature_dir / "logs"
        results_dir.mkdir(parents=True, exist_ok=True)
        logs_dir.mkdir(parents=True, exist_ok=True)

        code, log_out, result_data = run_script(script, base_url, env)
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        result_data["feature"] = feature_name
        result_data["timestamp"] = ts
        result_data["base_url"] = base_url

        (results_dir / "last_run.json").write_text(json.dumps(result_data, indent=2))
        (logs_dir / f"run_{ts}.log").write_text(log_out or "(no output)")
        prune_run_logs(logs_dir)
        if code != 0:
            failed += 1
            print(f"FAIL {feature_name} (exit {code})")
        else:
            print(f"OK   {feature_name}")

        show_log = args.logs or (args.log_failures and code != 0)
        if show_log:
            emit_captured_log(feature_name, log_out)

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
