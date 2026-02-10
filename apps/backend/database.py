from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from config import settings
from logging_config import get_logger

# Get database URL from settings
DATABASE_URL = settings.database_url

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

logger = get_logger(__name__)

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
        logger.info("✅ Database connection successful!")
        return True
    except Exception as e:
        logger.info(f"❌ Database connection failed: {e}")
        return False

# Initialize database tables
def init_db():
    """Create all tables defined in models."""
    # Import all models so they're registered with Base
    # IMPORTANT: Import webhook_models BEFORE repo_models to avoid circular dependency
    from models.webhook_models import (
        WebhookDelivery,
        PushEvent,
        RepositoryEvent,
        WebhookConfig
    )
    from models.invitation_models import CollaboratorInvitation
    from models.repo_models import RepoData
    from models.clone_models import CloneEvent
    from models.genre_models import GenreList, repo_genres
    from models.pat_models import PersonalAccessToken
    
    Base.metadata.create_all(bind=engine)
    logger.info("✅ Database tables created!")
