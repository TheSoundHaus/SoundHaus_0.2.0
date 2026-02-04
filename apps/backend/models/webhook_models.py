"""
Webhook event models for Gitea webhook integration.
"""

from sqlalchemy import Column, String, Integer, DateTime, Boolean, Text, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base
import uuid
import hmac
import hashlib
from typing import Optional


class WebhookDelivery(Base):
    """
    Logs all webhook deliveries from Gitea for debugging and auditing.
    Tracks every webhook received, its processing status, and any errors.
    """
    __tablename__ = "webhook_deliveries"
    
    # Primary key - UUID for webhook delivery
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Foreign key to repository
    repo_id = Column(String(255), ForeignKey("repo_data.gitea_id", ondelete="CASCADE"), 
                     nullable=False, index=True)
    
    # Event metadata
    event_type = Column(String(50), nullable=False, index=True)
    payload = Column(JSON, nullable=False)
    signature = Column(String(255), nullable=True)
    
    # Delivery tracking
    delivered_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    processing_status = Column(String(20), default="pending", nullable=False)
    error_message = Column(Text, nullable=True)
    
    # Relationship back to repository
    repo = relationship("RepoData", back_populates="webhook_deliveries")
    
    def __repr__(self):
        return f"<WebhookDelivery(id='{self.id}', event='{self.event_type}', status='{self.processing_status}')>"


class PushEvent(Base):
    """
    Tracks individual push events to repositories.
    Records commit information and pusher details.
    """
    __tablename__ = "push_events"
    
    # Primary key - auto-incrementing integer
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Foreign key to repository
    repo_id = Column(String(255), ForeignKey("repo_data.gitea_id", ondelete="CASCADE"), 
                     nullable=False, index=True)
    
    # Pusher information
    pusher_id = Column(String(255), nullable=False, index=True)
    pusher_username = Column(String(255), nullable=False)
    
    # Git metadata
    ref = Column(String(255), nullable=False)
    before_sha = Column(String(64), nullable=False)
    after_sha = Column(String(64), nullable=False)
    commit_count = Column(Integer, default=0, nullable=False)
    
    # Timestamp
    pushed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    
    # Relationship back to repository
    repo = relationship("RepoData", back_populates="push_events")
    
    def __repr__(self):
        return f"<PushEvent(id={self.id}, repo='{self.repo_id}', commits={self.commit_count})>"


class RepositoryEvent(Base):
    """
    Tracks repository lifecycle events (creation, deletion, etc.).
    """
    __tablename__ = "repository_events"
    
    # Primary key - auto-incrementing integer
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Foreign key to repository
    repo_id = Column(String(255), ForeignKey("repo_data.gitea_id", ondelete="CASCADE"), 
                     nullable=False, index=True)
    
    # Event details
    event_type = Column(String(50), nullable=False)
    
    # Actor information
    actor_id = Column(String(255), nullable=False, index=True)
    actor_username = Column(String(255), nullable=False)
    
    # Timestamp
    occurred_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    
    # Relationship back to repository
    repo = relationship("RepoData", back_populates="repository_events")
    
    def __repr__(self):
        return f"<RepositoryEvent(id={self.id}, type='{self.event_type}', repo='{self.repo_id}')>"


class WebhookConfig(Base):
    """
    Stores webhook configuration per repository.
    One-to-one relationship with RepoData.
    """
    __tablename__ = "webhook_configs"
    
    # Primary key - UUID
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Foreign key to repository (unique - one webhook config per repo)
    repo_id = Column(String(255), ForeignKey("repo_data.gitea_id", ondelete="CASCADE"), 
                     nullable=False, unique=True, index=True)
    
    # Gitea webhook details
    gitea_webhook_id = Column(Integer, nullable=False)
    webhook_secret = Column(String(255), nullable=False)
    
    # Status tracking
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_delivery_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationship back to repository (one-to-one)
    repo = relationship("RepoData", back_populates="webhook_config", uselist=False)
    
    # Unique constraint on repo_id to enforce one-to-one
    __table_args__ = (
        UniqueConstraint('repo_id', name='unique_webhook_per_repo'),
    )
    
    def __repr__(self):
        return f"<WebhookConfig(id='{self.id}', repo='{self.repo_id}', active={self.is_active})>"


# ============== HELPER FUNCTIONS ==============

def validate_webhook_signature(payload: bytes, signature: str, secret: str) -> bool:
    """
    Validates HMAC-SHA256 signature from Gitea webhook.
    
    Args:
        payload: Raw request body as bytes
        signature: Signature from X-Gitea-Signature header
        secret: Webhook secret from environment or database
    
    Returns:
        True if signature is valid, False otherwise
    """
    if not signature or not secret:
        return False
    
    try:
        # Compute expected signature
        expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
        
        # Use constant-time comparison to prevent timing attacks
        return hmac.compare_digest(expected, signature)
    except Exception:
        return False


def parse_gitea_event(headers: dict) -> str:
    """
    Extracts event type from Gitea webhook headers.
    
    Args:
        headers: Request headers dictionary (case-insensitive)
    
    Returns:
        Event type string
    
    Raises:
        ValueError: If X-Gitea-Event header is missing
    """
    # Try both case variations
    event_type = headers.get("X-Gitea-Event") or headers.get("x-gitea-event")
    
    if not event_type:
        raise ValueError("Missing X-Gitea-Event header")
    
    return event_type


def extract_repo_info(payload: dict) -> dict:
    """
    Extracts repository information from webhook payload.
    
    Args:
        payload: Parsed JSON webhook payload
    
    Returns:
        Dictionary with owner, repo_name, full_name
    
    Raises:
        KeyError: If required fields are missing from payload
    """
    try:
        repository = payload.get("repository", {})
        
        if not repository:
            raise KeyError("Missing 'repository' field in webhook payload")
        
        owner_info = repository.get("owner", {})
        owner_username = owner_info.get("username")
        repo_name = repository.get("name")
        full_name = repository.get("full_name")
        
        if not owner_username or not repo_name:
            raise KeyError("Missing owner username or repository name in payload")
        
        return {
            "owner": owner_username,
            "repo_name": repo_name,
            "full_name": full_name or f"{owner_username}/{repo_name}"
        }
    except (KeyError, AttributeError) as e:
        raise KeyError(f"Invalid webhook payload structure: {str(e)}")
