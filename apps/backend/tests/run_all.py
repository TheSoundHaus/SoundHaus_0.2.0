#!/usr/bin/env python3
"""
Test runner. Discovers and runs test scripts under auth/, gitea/, supabase/.
Writes results and logs into each feature folder. Use --dry-run to list without running.

Usage:
  python tests/run_all.py [--auth | --gitea | --supabase] [--base-url URL] [--dry-run]
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
SYSTEMS = ("auth", "gitea", "supabase")
SCRIPT_GLOB = "test_*.py"


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


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Phase 0 feature tests")
    parser.add_argument("--auth", action="store_true", help="Run only auth tests")
    parser.add_argument("--gitea", action="store_true", help="Run only gitea tests")
    parser.add_argument("--supabase", action="store_true", help="Run only supabase tests")
    parser.add_argument("--base-url", default=os.environ.get("API_BASE_URL", "http://localhost:8000"), help="API base URL")
    parser.add_argument("--dry-run", action="store_true", help="Only list tests, do not run")
    args = parser.parse_args()

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

    if not all_scripts:
        print("No test scripts found.", file=sys.stderr)
        return 0

    if args.dry_run:
        for name, script in all_scripts:
            print(name, script)
        return 0

    env = {"API_BASE_URL": args.base_url}
    failed = 0
    for feature_name, script in all_scripts:
        feature_dir = script.parent
        results_dir = feature_dir / "results"
        logs_dir = feature_dir / "logs"
        results_dir.mkdir(parents=True, exist_ok=True)
        logs_dir.mkdir(parents=True, exist_ok=True)

        code, log_out, result_data = run_script(script, args.base_url, env)
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        result_data["feature"] = feature_name
        result_data["timestamp"] = ts
        result_data["base_url"] = args.base_url

        (results_dir / "last_run.json").write_text(json.dumps(result_data, indent=2))
        (logs_dir / f"run_{ts}.log").write_text(log_out or "(no output)")
        if code != 0:
            failed += 1
            print(f"FAIL {feature_name} (exit {code})")
        else:
            print(f"OK   {feature_name}")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
