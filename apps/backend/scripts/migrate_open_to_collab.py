"""
Add open_to_collab column to repo_data table.

Run: PYTHONPATH=. python scripts/migrate_open_to_collab.py
"""
from sqlalchemy import text
from database import engine

def migrate():
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'repo_data' AND column_name = 'open_to_collab'"
        ))
        if result.fetchone():
            print("Column 'open_to_collab' already exists — skipping.")
            return

        conn.execute(text(
            "ALTER TABLE repo_data ADD COLUMN open_to_collab BOOLEAN NOT NULL DEFAULT FALSE"
        ))
        conn.commit()
        print("Added 'open_to_collab' column to repo_data table.")

if __name__ == "__main__":
    migrate()
