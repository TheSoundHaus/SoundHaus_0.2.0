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