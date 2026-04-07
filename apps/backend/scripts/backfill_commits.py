"""
Backfill commit history from Gitea into the SoundHaus database.

Run inside the FastAPI container:
    python scripts/backfill_commits.py

Reads all repos from repo_data, fetches their commit history from the Gitea
API, and inserts PushEvent + CommitDetail rows for commits not already stored.
"""

import os
import sys
import uuid
from datetime import datetime, timezone

import requests
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Allow imports from the parent package
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.repo_models import RepoData
from models.webhook_models import PushEvent
from models.commit_models import CommitDetail
from database import Base

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


def fetch_gitea_commits(owner: str, repo: str, page: int = 1, limit: int = 50):
    """Fetch commits from Gitea API."""
    url = f"{GITEA_BASE_URL}/api/v1/repos/{owner}/{repo}/commits"
    headers = {"Authorization": f"token {GITEA_ADMIN_TOKEN}"}
    params = {"page": page, "limit": limit}
    resp = requests.get(url, headers=headers, params=params, timeout=30)
    if resp.status_code != 200:
        print(f"  WARNING: Gitea returned {resp.status_code} for {owner}/{repo}")
        return []
    return resp.json()


def backfill_repo(db, owner: str, repo: str):
    """Backfill all commits for a single repo."""
    repo_id = f"{owner}/{repo}"
    
    # Get existing SHAs to avoid duplicates
    existing_shas = set(
        row[0] for row in
        db.query(CommitDetail.sha).filter(CommitDetail.repo_id == repo_id).all()
    )

    page = 1
    total_inserted = 0
    while True:
        commits = fetch_gitea_commits(owner, repo, page=page, limit=50)
        if not commits:
            break
        
        new_commits = [c for c in commits if c.get("sha") not in existing_shas]
        if not new_commits:
            # All commits on this page already exist
            if len(commits) < 50:
                break
            page += 1
            continue

        # Create a synthetic PushEvent for the backfill batch
        push_event = PushEvent(
            repo_id=repo_id,
            pusher_id="backfill",
            pusher_username="backfill",
            ref="refs/heads/main",
            before_sha="0" * 40,
            after_sha=new_commits[0].get("sha", "0" * 40),
            commit_count=len(new_commits),
        )
        db.add(push_event)
        db.flush()  # Get the auto-generated ID

        for c in new_commits:
            sha = c.get("sha", "")
            if sha in existing_shas:
                continue

            commit_info = c.get("commit", {})
            author = commit_info.get("author", {})
            
            # Parse timestamp
            ts_str = author.get("date") or c.get("created")
            ts = None
            if ts_str:
                try:
                    ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    ts = datetime.now(timezone.utc)

            # Extract file changes from the commit stats if available
            files = c.get("files", []) or []
            added = [f["filename"] for f in files if f.get("status") == "added"]
            modified = [f["filename"] for f in files if f.get("status") == "modified"]
            removed = [f["filename"] for f in files if f.get("status") == "removed"]

            detail = CommitDetail(
                id=str(uuid.uuid4()),
                push_event_id=push_event.id,
                repo_id=repo_id,
                sha=sha,
                short_sha=sha[:8],
                message=commit_info.get("message", ""),
                author_name=author.get("name", "unknown"),
                author_email=author.get("email"),
                timestamp=ts,
                files_added=added if added else [],
                files_modified=modified if modified else [],
                files_removed=removed if removed else [],
            )
            db.add(detail)
            existing_shas.add(sha)
            total_inserted += 1

        db.commit()

        if len(commits) < 50:
            break
        page += 1

    return total_inserted


def main():
    db = Session()
    try:
        repos = db.query(RepoData).all()
        print(f"Found {len(repos)} repos in database")

        for repo_row in repos:
            gitea_id = repo_row.gitea_id
            if "/" not in gitea_id:
                print(f"  SKIP: Invalid gitea_id '{gitea_id}'")
                continue
            owner, repo_name = gitea_id.split("/", 1)
            print(f"  Backfilling {owner}/{repo_name}...", end=" ")
            count = backfill_repo(db, owner, repo_name)
            print(f"{count} new commits")

        print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
