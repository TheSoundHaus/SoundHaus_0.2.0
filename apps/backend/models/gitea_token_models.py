import uuid
from sqlalchemy import Column, String, DateTime, Integer, Boolean
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
from database import Base

class GiteaToken(Base):
    """
    Gitea Personal Access Token model for git operations.
    Stores user's Gitea PAT in hashed form for reuse across sessions.
    Prevents token sprawl by caching one token per user.
    """
    __tablename__ = "gitea_tokens"

    # Primary key
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # User reference (Supabase user UUID)
    user_id = Column(String, nullable=False, index=True, unique=True)
    # Unique constraint ensures one active token per user

    # Token storage (bcrypt hashed, never stored in plaintext)
    token_hash = Column(String, nullable=False)

    # Token prefix for identification (first 8-16 chars, e.g., "gt_abc123...")
    token_prefix = Column(String, nullable=False)

    # Metadata
    token_name = Column(String, nullable=False)
    # Example: "Web Access Token - 20250226-143022"

    scopes = Column(String(), nullable=True)
    # JSON string of Gitea scopes (e.g., '["write:repository", "read:user"]')

    # Token source (web or desktop)
    created_via = Column(String, default='web', nullable=False)
    # 'web' or 'desktop' - helps identify token origin

    # Lifecycle tracking
    created_at = Column(DateTime(timezone=True), nullable=True, default=func.now())
    last_used = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    # NULL = never expires (Gitea tokens don't expire by default)

    # Revocation and usage
    is_revoked = Column(Boolean, default=False, nullable=True)
    usage_count = Column(Integer, default=0, nullable=True)

    def __repr__(self):
        return f"<GiteaToken {self.token_name} (user={self.user_id[:8]}..., revoked={self.is_revoked})>"
