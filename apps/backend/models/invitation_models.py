from sqlalchemy import Column, String, DateTime, Index
from sqlalchemy.sql import func
from database import Base
import uuid


class CollaboratorInvitation(Base):
    __tablename__ = "collaborator_invitations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    invitation_token = Column(String, unique=True, nullable=False, index=True)
    repo_name = Column(String, nullable=False, index=True)
    owner_email = Column(String, nullable=False)
    owner_username = Column(String, nullable=False)
    invitee_email = Column(String, nullable=False, index=True)
    permission = Column(String, nullable=False, default="write")
    status = Column(String, nullable=False, default="pending")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    responded_at = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self):
        return f"<CollaboratorInvitation(id='{self.id}', invitation_token={self.invitation_token})>"