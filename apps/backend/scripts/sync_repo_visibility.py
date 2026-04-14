"""
Sync RepoData.is_public with Gitea repo privacy.

Run inside the FastAPI container:
    python scripts/sync_repo_visibility.py

Reads all repos from repo_data, fetches their current privacy from Gitea, and updates
`repo_data.is_public = not repo.private`.
"""

import os
import sys

import requests
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Allow imports from the parent package
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.repo_models import RepoData  # noqa: E402

DATABASE_URL = os.environ.get("DATABASE_URL", "")
GITEA_BASE_URL = os.environ.get("GITEA_BASE_URL", "http://gitea:3000")
GITEA_ADMIN_TOKEN = os.environ.get("GITEA_ADMIN_TOKEN", "")

if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set")
    sys.exit(1)
if not GITEA_ADMIN_TOKEN:
    print("ERROR: GITEA_ADMIN_TOKEN not set")
    sys.exit(1)

engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)


def fetch_repo_private(owner: str, repo: str) -> bool | None:
    url = f"{GITEA_BASE_URL}/api/v1/repos/{owner}/{repo}"
    headers = {"Authorization": f"token {GITEA_ADMIN_TOKEN}"}
    resp = requests.get(url, headers=headers, timeout=20)
    if resp.status_code == 200:
        data = resp.json() or {}
        return bool(data.get("private", True))
    print(f"  WARNING: {owner}/{repo} -> {resp.status_code}")
    return None


def main():
    db = Session()
    try:
        rows = db.query(RepoData).all()
        updated = 0
        skipped = 0

        for r in rows:
            if not r.gitea_id or "/" not in r.gitea_id:
                skipped += 1
                continue
            owner, repo = r.gitea_id.split("/", 1)
            is_private = fetch_repo_private(owner, repo)
            if is_private is None:
                skipped += 1
                continue
            new_is_public = not is_private
            if bool(r.is_public) != bool(new_is_public):
                r.is_public = new_is_public
                updated += 1

        db.commit()
        print(f"Done. Updated: {updated}, Skipped: {skipped}, Total: {len(rows)}")
    finally:
        db.close()


if __name__ == "__main__":
    main()

