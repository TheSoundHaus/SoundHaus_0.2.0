"""
Backfill RepoData.total_commits from CommitDetail rows.

Run inside the FastAPI container:
    python scripts/backfill_commit_counts.py
"""

import os
import sys

from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker

# Allow imports from the parent package
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.commit_models import CommitDetail  # noqa: E402
from models.repo_models import RepoData  # noqa: E402

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set")
    sys.exit(1)

engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)


def main():
    db = Session()
    try:
        counts = dict(
            db.query(CommitDetail.repo_id, func.count(CommitDetail.id))
            .group_by(CommitDetail.repo_id)
            .all()
        )

        rows = db.query(RepoData).all()
        updated = 0
        for r in rows:
            new_total = int(counts.get(r.gitea_id, 0))
            if int(r.total_commits or 0) != new_total:
                r.total_commits = new_total
                updated += 1

        db.commit()
        print(f"Done. Updated: {updated}, Total repos: {len(rows)}")
    finally:
        db.close()


if __name__ == "__main__":
    main()

