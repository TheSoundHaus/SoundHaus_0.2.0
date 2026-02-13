"""
Clone event models.
Stores individual clone actions by users.
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class CloneEvent(Base):
    """
    Stores individual clone events.
    One row per clone action.
    
    Attributes:
        id: Auto-incrementing primary key
        repo_id: Which repository was cloned (foreign key)
        user_id: Who cloned it (Supabase UUID)
        cloned_at: When the clone happened
        repo: Relationship back to RepoData
    """
    __tablename__ = "clone_events"
    
    # Auto-incrementing ID
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Which repo was cloned (foreign key to repo_data.gitea_id)
    repo_id = Column(
        String(255), 
        ForeignKey("repo_data.gitea_id", ondelete="CASCADE"), 
        nullable=False,
        index=True  # Index for faster lookups
    )
    
    # Who cloned it (Supabase user UUID)
    user_id = Column(String(255), nullable=False, index=True)  # Index for user lookups
    
    # When it was cloned (automatically set to NOW())
    cloned_at = Column(DateTime, server_default=func.now(), nullable=False)
    
    # Relationship: Each clone belongs to one repo
    repo = relationship("RepoData", back_populates="clone_events")
    
    # Table-level constraints
    __table_args__ = (
        # Ensure one user can only clone a repo once
        UniqueConstraint('repo_id', 'user_id', name='unique_clone_per_user'),
    )
    
    def __repr__(self):
        return f"<CloneEvent(repo='{self.repo_id}', user='{self.user_id}', at='{self.cloned_at}')>"