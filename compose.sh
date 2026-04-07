#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: ./compose.sh <local|remote> [docker compose args...]" >&2
  exit 1
fi

mode="$1"
shift || true

if [[ "$mode" != "local" && "$mode" != "remote" ]]; then
  echo "Invalid mode '$mode'. Use: local or remote." >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$script_dir"
compose_env_file="$repo_root/.env.compose.$mode"
profile_file="$repo_root/.soundhaus-compose-profile"

if [[ ! -f "$compose_env_file" ]]; then
  echo "Missing $compose_env_file" >&2
  echo "Create it from: .env.compose.$mode.example" >&2
  exit 1
fi

backend_env_file="$(awk -F= '/^[[:space:]]*BACKEND_ENV_FILE[[:space:]]*=/{gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2); print $2; exit}' "$compose_env_file" || true)"
if [[ -n "${backend_env_file:-}" ]]; then
  backend_env_file="${backend_env_file%\"}"
  backend_env_file="${backend_env_file#\"}"
  if [[ ! -f "$repo_root/$backend_env_file" ]]; then
    echo "Warning: BACKEND_ENV_FILE points to missing file: $backend_env_file" >&2
    echo "Create it from: ${backend_env_file}.example" >&2
  fi
fi

printf '%s\n' "$mode" > "$profile_file"
echo "profile=$mode"
echo "compose_env_file=.env.compose.$mode"

cd "$repo_root"
docker compose --env-file ".env.compose.$mode" "$@"
