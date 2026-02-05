from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set!")

# creating engine to access our database
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True, # ensures connections are valid before sending queries
    echo=True # logs SQL statements for debugging, could be removed in PROD
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for all models
Base = declarative_base()

def get_db():
    """Dependency to get DB session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Test connection function
def test_connection():
    """Test if database connection works."""
    from sqlalchemy import text
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        print("✅ Database connection successful!")
        return True
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False

# Initialize database tables
def init_db():
    """Create all tables defined in models."""
    # Import all models so they're registered with Base
    from models.repo_models import RepoData
    from models.clone_models import CloneEvent
    from models.genre_models import GenreList, repo_genres
    from models.pat_models import PersonalAccessToken
    
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables created!")
