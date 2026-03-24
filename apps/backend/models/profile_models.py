import uuid
from sqlalchemy import Column, String, DateTime, Integer, Boolean
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
from database import Base

class Profile(Base):
    
    __tablename__ = "profiles"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, nullable=True)
    name = Column(String, nullable=False)
    