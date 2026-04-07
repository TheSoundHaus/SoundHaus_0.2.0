"""
Migration: Add diff_pending and diff_pending_since columns to commit_details.

These columns track whether the desktop app's diff upload is expected but
hasn't arrived yet (race condition between Gitea webhook and diff POST).

Run: python migrate_diff_pending.py
"""
from database import SessionLocal
from sqlalchemy import text


def migrate():
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE commit_details "
            "ADD COLUMN IF NOT EXISTS diff_pending VARCHAR(20) NOT NULL DEFAULT 'none';"
        ))
        db.execute(text(
            "ALTER TABLE commit_details "
            "ADD COLUMN IF NOT EXISTS diff_pending_since TIMESTAMP WITH TIME ZONE;"
        ))
        db.commit()
        print("Migration successful: Added diff_pending and diff_pending_since to commit_details.")
    except Exception as e:
        db.rollback()
        print(f"Migration failed: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    migrate()
