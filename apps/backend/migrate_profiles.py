from database import SessionLocal
from sqlalchemy import text

def migrate():
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username VARCHAR(255) UNIQUE;"))
        db.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);"))
        db.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(1024);"))
        db.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;"))
        db.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());"))
        db.commit()
        print("Migration successful: Added username, display_name, avatar_url, bio, and updated_at to profiles.")
    except Exception as e:
        db.rollback()
        print(f"Migration failed: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    migrate()
