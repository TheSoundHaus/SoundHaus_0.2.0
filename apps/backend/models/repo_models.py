"""
Repository data models.
Stores aggregate/summary data about each repository.

TODO: Add the following imports for webhook integration:
    from sqlalchemy import DateTime
    from sqlalchemy.sql import func
"""
from sqlalchemy import Column, String, Integer, Float, Boolean, Table, DateTime
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

    # ── New push-tracking columns (Phase 1) ──────────────────────────────
    # Set to True by webhook_service._handle_push() when new commits arrive.
    # Set to False by POST /repos/{owner}/{repo}/diff after Desktop posts diff.
    # The web UI reads this to show the "New push available" UpdateBanner.
    # Default False = no pending update on row creation.
    needs_update = Column(Boolean, default=False, nullable=False)

    # The git HEAD SHA after the most recent push.
    # Populated by webhook_service._handle_push() from payload["after"].
    # Used in UpdateBanner: "Commit <short_sha> was just pushed".
    # nullable=True because existing rows pre-dating this column won't have it.
    last_push_commit_sha = Column(String(40), nullable=True)
    
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
        uselist=False  # One-to-one relationship
    )

    # ── New relationships (Phase 1) ───────────────────────────────────────
    # Populated by: models/commit_models.py — CommitDetail table
    # Each push event creates N CommitDetail rows (one per commit in the push).
    # Back-reference: CommitDetail.repo
    commit_details = relationship(
        "CommitDetail",
        back_populates="repo",
        cascade="all, delete-orphan"
    )

    # Populated by: models/diff_models.py — AlsDiff table
    # Each Desktop push creates 0 or 1 AlsDiff rows (if .als file changed).
    # Back-reference: AlsDiff.repo
    als_diffs = relationship(
        "AlsDiff",
        back_populates="repo",
        cascade="all, delete-orphan"
    )

    # Populated by: models/snippet_models.py — SnippetHistory table
    # Each snippet overwrite creates 1 SnippetHistory row (snapshot of old version).
    # Back-reference: SnippetHistory.repo
    snippet_history = relationship(
        "SnippetHistory",
        back_populates="repo",
        cascade="all, delete-orphan",
        # Order queries in the router/service instead of here — SQLAlchemy
        # relationship order_by requires a mapped column expression, not a string.
        # Use: db.query(SnippetHistory).filter(...).order_by(SnippetHistory.version_number.desc())
    )

    def __repr__(self):
        return f"<RepoData(gitea_id='{self.gitea_id}', clones={self.clone_count})>"
