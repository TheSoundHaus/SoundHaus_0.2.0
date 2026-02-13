"""
Genre models.
Stores genre master list and genre-to-repo associations.
"""
from sqlalchemy import Column, Integer, String, ForeignKey, Table
from sqlalchemy.orm import relationship
from database import Base
from sqlalchemy.ext.hybrid import hybrid_property


# Association table for many-to-many relationship between repos and genres
# This is NOT a class - it's a Table object
repo_genres = Table(
    'repo_genres',           # Table name in PostgreSQL
    Base.metadata,           # Link to SQLAlchemy metadata
    Column('repo_id', String(255), ForeignKey('repo_data.gitea_id', ondelete='CASCADE'), primary_key=True),
    Column('genre_id', Integer, ForeignKey('genre_list.genre_id', ondelete='CASCADE'), primary_key=True)
)


class GenreList(Base):
    """
    Master list of genres available on the platform.
    Admins can add/remove genres from this list.
    
    Attributes:
        genre_id: Auto-incrementing primary key
        genre_name: Unique genre name (e.g., "Electronic", "Hip Hop")
        repos: Relationship to all repos with this genre
    """
    __tablename__ = "genre_list"
    
    # Auto-incrementing ID
    genre_id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Genre name (must be unique, indexed for fast lookups)
    genre_name = Column(String(100), unique=True, nullable=False, index=True)
    genre_description = Column(String(500), nullable=False, default="")

    genre_icon = Column(String(50), nullable=True)
    genre_color = Column(String(7), nullable=True)
    display_order = Column(Integer, default=0)

    repos = relationship(
        "RepoData",
        secondary=repo_genres,
        back_populates="genres"
    )

    @hybrid_property
    def song_count(self):
        return len(self.repos)

    # TODO: track what top song in genre is, ie most downloads, 
    # create one to many relationship, between genre and top song list
    # 
    # top_repo_in_genre = Column(String, nullable=True, default=None)

  
    def __repr__(self):
        return f"<GenreList(id={self.genre_id}, name='{self.genre_name}')>"