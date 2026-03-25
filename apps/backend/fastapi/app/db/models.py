"""
Pydantic models for existing Supabase database tables
These models match the schema of tables that already exist in Supabase
"""
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class RepoData(BaseModel):
    """
    Model for repo_data table
    Stores repository metadata cache from Gitea
    """
    gitea_id: str  # Primary key: "owner/repo-name"
    owner: str
    repo_name: str
    description: Optional[str] = None
    private: bool = False
    created_at: datetime
    updated_at: datetime
    clone_count: int = 0
    audio_snippet: Optional[str] = None  # URL to audio snippet file


class Genre(BaseModel):
    """
    Model for genre_list table
    Available music genres for classification
    """
    genre_id: int
    genre_name: str
    genre_color: Optional[str] = None  # Hex color code, e.g. "#FF5733"
    genre_icon: Optional[str] = None  # Icon identifier


class RepoGenre(BaseModel):
    """
    Model for repo_genres table
    Junction table linking repositories to genres (many-to-many)
    """
    repo_gitea_id: str  # Foreign key to repo_data.gitea_id
    genre_id: int  # Foreign key to genre_list.genre_id


class Profile(BaseModel):
    """
    Model for profiles table
    Extended user profile information beyond Supabase Auth
    """
    user_id: str  # Foreign key to Supabase Auth user.id
    username: str
    display_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CloneEvent(BaseModel):
    """
    Model for clone_events table
    Tracks when users clone repositories
    """
    id: Optional[int] = None
    user_id: str
    repo_gitea_id: str
    cloned_at: datetime


class CollaboratorInvitation(BaseModel):
    """
    Model for collaborator_invitations table
    Pending/accepted/declined collaboration invites
    """
    id: Optional[int] = None
    repo_gitea_id: str
    inviter_user_id: str
    invitee_email: str
    permission: str  # "read", "write", or "admin"
    status: str  # "pending", "accepted", "declined"
    created_at: datetime
    expires_at: Optional[datetime] = None
    responded_at: Optional[datetime] = None


class PushEvent(BaseModel):
    """
    Model for push_events table
    Git push events from Gitea webhooks
    """
    id: Optional[int] = None
    repo_gitea_id: str
    ref: str  # Branch ref, e.g. "refs/heads/main"
    before_sha: Optional[str] = None
    after_sha: Optional[str] = None
    commit_count: int = 0
    pusher: str  # Username
    pushed_at: Optional[datetime] = None


class RepositoryEvent(BaseModel):
    """
    Model for repository_events table
    Repository lifecycle events (created, deleted, etc.)
    """
    id: Optional[int] = None
    repo_gitea_id: str
    event_type: str  # "repository_created", "repository_deleted", etc.
    actor: str  # Username
    occurred_at: Optional[datetime] = None


class WebhookConfig(BaseModel):
    """
    Model for webhook_configs table
    Gitea webhook configuration
    """
    id: Optional[int] = None
    repo_gitea_id: str
    gitea_webhook_id: int
    events: List[str]  # List of subscribed events
    active: bool = True
    created_at: Optional[datetime] = None


class WebhookDelivery(BaseModel):
    """
    Model for webhook_deliveries table
    Log of webhook delivery attempts
    """
    id: Optional[int] = None
    webhook_config_id: int
    event_type: str
    payload: dict
    delivered_at: datetime
    status_code: int
    success: bool
