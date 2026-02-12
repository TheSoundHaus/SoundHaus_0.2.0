"""
Repository data models.
Stores aggregate/summary data about each repository.
"""
from sqlalchemy import Column, String, Integer, Table
from sqlalchemy.orm import relationship
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
    
    # Total number of unique cloners
    clone_count = Column(Integer, default=0, nullable=False)
    
    # Relationship: One repo has many clone events
    # cascade="all, delete-orphan" means when repo is deleted, all clone events are too
    clone_events = relationship(
        "CloneEvent", 
        back_populates="repo", 
        cascade="all, delete-orphan"
    )

    genres = relationship(
        "GenreList",              # Links to GenreList class
        secondary="repo_genres",  # Through junction table (as string!)
        back_populates="repos"    # Bidirectional link
    )
    
    def __repr__(self):
        return f"<RepoData(gitea_id='{self.gitea_id}', clones={self.clone_count})>"
