"""Pydantic request bodies for collaborator API routes."""

from pydantic import BaseModel, Field


class InviteCollaboratorRequest(BaseModel):
    email: str = Field(..., min_length=1)
    permission: str = Field(default="write")
