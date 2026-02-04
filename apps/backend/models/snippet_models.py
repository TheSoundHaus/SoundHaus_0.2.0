from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

from .base import Base

class Snippet(Base):
    __tablename__ = "snippets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    repo_id = Column(UUID(as_uuid=True), ForeignKey("repos.id"), nullable=True)

    file_path = Column(String(500), nullable=False)
    duration = Column(Float, nullable=True)
    format = Column(String(20), nullable=False)

    sample_rate = Column(Integer, nullable=True)
    channels = Column(Integer, nullable=True)
    bit_depth = Column(Integer, nullable=True)
    bpm = Column(Float, nullable=True)
    key = Column(String(10), nullable=True)

    created_at = Column(DateTime, default=datetime.now(datetime.timezone.utc))
    updated_at = Column(DateTime, default=datetime.now(datetime.timezone.utc)), onupdate=datetime.now(datetime.timezone.utc)
    
    storage_backend = Column(String(20), default="local")  # "local" or "s3"