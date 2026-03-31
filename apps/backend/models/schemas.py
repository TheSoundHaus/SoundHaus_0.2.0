from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any

class SignUpRequest(BaseModel):
    email: EmailStr
    password: str
    metadata: Optional[Dict[str, Any]] = None
    name: str  # SoundHaus profile username (unique); Gitea login is provisioned as Supabase user id


class ProfileUpdateRequest(BaseModel):
    display_name: Optional[str] = None
    bio: Optional[str] = None
    is_public: Optional[bool] = None

class SignInRequest(BaseModel):
    email: EmailStr
    password: str

class UpdateUserRequest(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

class ResetPasswordRequest(BaseModel):
    email: EmailStr

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class CreateRepoRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    private: bool = True

class RegisterRepoRequest(BaseModel):
    """Register a Gitea repo in the local database (used by desktop app after direct Gitea creation)."""
    name: str
    description: Optional[str] = ""
    private: bool = True

class UploadFileRequest(BaseModel):
    file_path: str
    content: str
    message: str
    branch: Optional[str] = "main"

class DeleteFileRequest(BaseModel):
    message: str
    branch: Optional[str] = "main"

class WatchStartRequest(BaseModel):
    repo_name: str
    branch: Optional[str] = "main"
    repo_path: Optional[str] = ""

class SpawnWorkerRequest(BaseModel):
    watch_id: str
    local_path: str

class RepoPreferencesRequest(BaseModel):
    repo_name: str
    local_path: str


# ============== WEBHOOK SCHEMAS ==============

class WebhookPayload(BaseModel):
    """
    Generic webhook payload from Gitea.
    
    TODO: This is a base schema - you may need to create more specific ones
    for different event types (PushEventPayload, CreateEventPayload, etc.)
    
    Gitea webhook structure reference:
    https://docs.gitea.io/en-us/webhooks/
    """
    secret: Optional[str] = None
    ref: Optional[str] = None
    before: Optional[str] = None
    after: Optional[str] = None
    compare_url: Optional[str] = None
    commits: Optional[list] = None
    repository: Optional[Dict[str, Any]] = None
    pusher: Optional[Dict[str, Any]] = None
    sender: Optional[Dict[str, Any]] = None


class CreateWebhookRequest(BaseModel):
    """
    Request to create a webhook for a repository.
    """
    type: str = "gitea"  # Webhook type (usually "gitea")
    config: Dict[str, Any]  # Webhook configuration
    events: list[str] = ["push", "create", "delete", "repository"]
    active: bool = True


class WebhookConfigResponse(BaseModel):
    """
    Response schema for webhook configuration.
    """
    id: int  # Gitea webhook ID
    type: str
    active: bool
    events: list[str]
    config: Dict[str, Any]
    created_at: str
    updated_at: str


class PushEventResponse(BaseModel):
    """
    Response schema for push events.
    """
    id: int
    repo_id: str
    pusher_username: str
    ref: str
    commit_count: int
    before_sha: str
    after_sha: str
    pushed_at: str


class WebhookDeliveryResponse(BaseModel):
    """
    Response schema for webhook delivery logs.
    """
    id: str
    event_type: str
    processing_status: str
    delivered_at: str
    error_message: Optional[str] = None


# ============== STEM SCHEMAS ==============

from datetime import datetime
from typing import List
from enum import Enum

class StemJobStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    SUCCEEDED = "succeeded"
    FAILED = "failed"

class StemType(str, Enum):
    VOCALS = "vocals"
    DRUMS = "drums"
    BASS = "bass"
    OTHER = "other"

class StemFileResponse(BaseModel):
    id: int
    stem_type: StemType
    public_url: str
    duration_seconds: Optional[float] = None
    file_size_bytes: Optional[int] = None
    format: str
    created_at: datetime

    class Config:
        from_attributes = True

class SnippetVersionResponse(BaseModel):
    id: int
    repo_gitea_id: str
    source_upload_url: str
    commit_sha: Optional[str] = None
    status: StemJobStatus
    error_message: Optional[str] = None
    is_confirmed: bool
    created_at: datetime
    demucs_model_version: str
    stem_files: List[StemFileResponse] = []

    class Config:
        from_attributes = True

class StemJobCreate(BaseModel):
    """Request to start stem generation."""
    source_snippet_url: str          # Supabase CDN URL of the source snippet
    commit_sha: Optional[str] = None

class StemJobStatusResponse(BaseModel):
    """Job status response (returned immediately and by polling)."""
    job_id: int
    status: StemJobStatus
    error_message: Optional[str] = None
    progress_percent: Optional[int] = None

class StemsLatestResponse(BaseModel):
    """Latest confirmed stems for a repo."""
    snippet_version: Optional[SnippetVersionResponse] = None
    has_stems: bool
