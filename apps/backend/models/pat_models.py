import uuid
from sqlalchemy import Column, String, DateTime, Integer, Boolean
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
from database import Base

class PersonalAccessToken(Base):
    """
    Personal Access Token model for desktop app authentication.
    Tokens are bcrypt-hashed and only shown once during creation.
    """
    __tablename__ = "personal_access_tokens"
    
    # TODO: Add primary key column (id) - use String type with uuid default
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    # TODO: Add user_id column - String, not nullable, indexed
    user_id = Column(String, nullable=False, index=True)
    # This is the Supabase user UUID
    # TODO: Add token_name column - String, not nullable
    token_name = Column(String, nullable=False)
    # User-friendly name like "My Desktop App"
    
    # TODO: Add token_hash column - String, not nullable
    token_hash = Column(String, nullable=False)
    # Bcrypt hash of the actual token
    
    # TODO: Add token_prefix column - String, not nullable
    # First 8-16 chars for identification (e.g., "soundh_a1b2c3d4")
    token_prefix = Column(String, nullable=False)
    # TODO: Add scopes column - String, nullable
    scopes = Column(String(), nullable=True)
    # JSON string of permissions (for future use)
    
    # TODO: Add last_used column - DateTime with timezone, nullable
    last_used = Column(DateTime(timezone=True), nullable=True)
    # TODO: Add created_at column - DateTime with timezone, default to now
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # TODO: Add expires_at column - DateTime with timezone, nullable
    expires_at = Column(DateTime(timezone=True), nullable=True)
    # NULL = never expires
    
    # TODO: Add is_revoked column - Boolean, default False, not nullable
    is_revoked = Column(Boolean, default=False, nullable=False)
    # TODO: Add usage_count column - Integer, default 0
    usage_count = Column(Integer, default=0)
    
    def __repr__(self):
        return f"<PAT {self.token_name} (user={self.user_id[:8]}...)>"
