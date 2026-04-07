"""
Migration: Drop the display_name column from profiles.

Prerequisites:
    - All display_name values have been copied to username already
      (this was enforced in code — display_name was always set to username).
    - The backend code no longer references display_name.

Usage:
    cd apps/backend
    python scripts/migrate_drop_display_name.py

This script:
    1. Copies any display_name → username where username is NULL (safety net).
    2. Drops the display_name column.
"""

import sys
import os

# Add parent dir so `database` and `config` can be imported
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text
from database import SessionLocal


def main():
    db = SessionLocal()
    try:
        # Safety net: copy display_name → username for any row where username is null
        result = db.execute(
            text("""
                UPDATE profiles
                SET username = display_name
                WHERE username IS NULL
                  AND display_name IS NOT NULL
            """)
        )
        if result.rowcount:
            print(f"  Backfilled {result.rowcount} username(s) from display_name.")

        # Drop the column
        db.execute(text("ALTER TABLE profiles DROP COLUMN IF EXISTS display_name;"))
        db.commit()
        print("Migration complete: display_name column dropped from profiles.")
    except Exception as e:
        db.rollback()
        print(f"Migration failed: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
