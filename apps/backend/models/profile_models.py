import uuid
from sqlalchemy import Column, String, DateTime, Text, Boolean
from sqlalchemy.sql import func
from database import Base


class Profile(Base):
    """
    User profile data.
    - id: Supabase Auth UUID (set at signup, not auto-generated).
    - username: Human-readable, unique, immutable after creation.
    - avatar_url: Public CDN URL to the user's profile picture in Supabase Storage.
    - is_public: Whether the profile is publicly visible (default: False).
    """

    __tablename__ = "profiles"

    id = Column(String, primary_key=True)  # Supabase user UUID — set explicitly, not auto-generated
    email = Column(String, nullable=True)
    username = Column(String, nullable=False, unique=True, index=True)
    display_name = Column(String, nullable=True)
    avatar_url = Column(String(500), nullable=True)
    bio = Column(Text, nullable=True)
    is_public = Column(Boolean, nullable=False, server_default="false")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    # Social links
    social_instagram = Column(String(255), nullable=True)
    social_youtube = Column(String(255), nullable=True)
    social_spotify = Column(String(255), nullable=True)
    social_twitter = Column(String(255), nullable=True)
    social_website = Column(String(255), nullable=True)
    