from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any

class SignUpRequest(BaseModel):
    email: EmailStr
    password: str
    metadata: Optional[Dict[str, Any]] = None
    name: Optional[str] = None

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
# TODO: These schemas are for the webhook system implementation

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
    
    TODO: Implement endpoint that uses this schema
    Endpoint: POST /repos/{owner}/{repo}/webhooks
    """
    type: str = "gitea"  # Webhook type (usually "gitea")
    config: Dict[str, Any]  # Webhook configuration
    events: list[str] = ["push", "create", "delete", "repository"]
    active: bool = True


class WebhookConfigResponse(BaseModel):
    """
    Response schema for webhook configuration.
    
    TODO: Return this from GET /repos/{owner}/{repo}/webhooks
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
    
    TODO: Return this from GET /repos/{owner}/{repo}/events
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
    
    TODO: Return this from GET /repos/{owner}/{repo}/webhook-deliveries
    for debugging webhook issues
    """
    id: str
    event_type: str
    processing_status: str
    delivered_at: str
    error_message: Optional[str] = None