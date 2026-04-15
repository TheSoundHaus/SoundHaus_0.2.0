"""
Add forked_from column to repo_data table.

Run: python scripts/migrate_forked_from.py
"""
from sqlalchemy import text
from database import engine

def migrate():
    with engine.connect() as conn:
        # Check if column already exists
        result = conn.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'repo_data' AND column_name = 'forked_from'"
        ))
        if result.fetchone():
            print("Column 'forked_from' already exists — skipping.")
            return

        conn.execute(text(
            "ALTER TABLE repo_data ADD COLUMN forked_from VARCHAR(255) DEFAULT NULL"
        ))
        conn.commit()
        print("Added 'forked_from' column to repo_data table.")

if __name__ == "__main__":
    migrate()
