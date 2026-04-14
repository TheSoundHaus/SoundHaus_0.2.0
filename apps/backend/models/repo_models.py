"""
Repository data models — stores aggregate/summary data about each repository.
"""
from sqlalchemy import Column, String, Integer, Float, Boolean, Table, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class RepoData(Base):
    """
    Stores aggregate data about each repository.
    One row per repo.
    
    Attributes:
        gitea_id: Unique repository identifier (e.g., "uuid-123/my-beats")
        owner_id: Supabase UUID of the repo owner (for isolation)
        audio_snippet: URL to audio snippet in DigitalOcean Spaces
        clone_count: Total number of unique cloners
        clone_events: Relationship to CloneEvent records
    """
    __tablename__ = "repo_data"
    # Primary key: unique repo identifier (owner/repo-name)
    gitea_id = Column(String(255), primary_key=True, index=True)
    
    # Owner's Supabase UUID - ensures repos are only shown to their owner
    owner_id = Column(String(255), index=True, nullable=False)
    
    # URL to audio snippet (stored in DigitalOcean Spaces)
    audio_snippet = Column(String(500), nullable=True)
    
    # Snippet metadata (for progress bar, display)
    snippet_duration = Column(Float, nullable=True)  # Duration in seconds
    snippet_file_size = Column(Integer, nullable=True)  # File size in bytes
    snippet_format = Column(String(20), nullable=True)  # e.g., "mp3", "wav"
    snippet_sample_rate = Column(Integer, nullable=True)  # e.g., 44100, 48000
    snippet_channels = Column(Integer, nullable=True)  # 1=mono, 2=stereo
    
    # Total number of unique cloners
    clone_count = Column(Integer, default=0, nullable=False)
    
    # Webhook event tracking columns
    last_push_at = Column(DateTime(timezone=True), nullable=True)
    total_commits = Column(Integer, default=0, nullable=False)
    last_activity_at = Column(DateTime(timezone=True), nullable=True)

    # ── Push-tracking columns ────────────────────────────────────────────
    # True when new commits arrive; cleared when Desktop posts diff.
    needs_update = Column(Boolean, default=False, nullable=False)

    # HEAD SHA after most recent push (for UpdateBanner display).
    last_push_commit_sha = Column(String(40), nullable=True)

    # Markdown README content for the repo "About" tab
    readme_content = Column(Text, nullable=True, default=None)
    
    # Cached metadata from Gitea — avoids per-request Gitea calls on listing endpoints
    description = Column(Text, nullable=True)
    stars_count = Column(Integer, default=0, nullable=False)

    # Thumbnail for repository card display
    # thumbnail_type: "image" or "youtube"
    thumbnail_url = Column(String(500), nullable=True)
    thumbnail_type = Column(String(20), nullable=True)  # "image" or "youtube"

    # Whether this repo appears in public searches / explore feed
    is_public = Column(Boolean, default=True, nullable=False)

    # If this repo is a fork, stores the source repo's gitea_id (e.g. "uuid/repo-name")
    forked_from = Column(String(255), nullable=True, default=None)
    
    # Relationship: One repo has many clone events
    # cascade="all, delete-orphan" means when repo is deleted, all clone events are too
    clone_events = relationship(
        "CloneEvent", 
        back_populates="repo", 
        cascade="all, delete-orphan"
    )

    genres = relationship(
        "GenreList",
        secondary="repo_genres",
        back_populates="repos"
    )
    
    # Webhook relationships
    push_events = relationship(
        "PushEvent",
        back_populates="repo",
        cascade="all, delete-orphan"
    )
    repository_events = relationship(
        "RepositoryEvent",
        back_populates="repo",
        cascade="all, delete-orphan"
    )
    webhook_deliveries = relationship(
        "WebhookDelivery",
        back_populates="repo",
        cascade="all, delete-orphan"
    )
    webhook_config = relationship(
        "WebhookConfig",
        back_populates="repo",
        uselist=False,  # One-to-one relationship
        cascade="all, delete-orphan"
    )

    commit_details = relationship(
        "CommitDetail",
        back_populates="repo",
        cascade="all, delete-orphan"
    )

    als_diffs = relationship(
        "AlsDiff",
        back_populates="repo",
        cascade="all, delete-orphan"
    )

    # Order queries in the router/service instead of here.
    snippet_history = relationship(
        "SnippetHistory",
        back_populates="repo",
        cascade="all, delete-orphan",
    )

    # Populated by: models/stem_models.py — SnippetVersion table
    # Each stem separation job creates a SnippetVersion row.
    # Back-reference: SnippetVersion.repo
    snippet_versions = relationship(
        "SnippetVersion",
        back_populates="repo",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<RepoData(gitea_id='{self.gitea_id}', clones={self.clone_count})>"
