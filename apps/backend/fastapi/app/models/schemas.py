from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any, List

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


# ============== PUBLIC REPOSITORY DISCOVERY SCHEMAS ==============


class PublicReposListRequest(BaseModel):
    """Query parameters for listing public repositories"""
    limit: int = 50
    offset: int = 0
    search: Optional[str] = None
    sort_by: Optional[str] = "updated"  # updated, stars, name


class PublicReposListResponse(BaseModel):
    """Response for public repository listing"""
    success: bool
    repos: List[Dict[str, Any]]
    total: int
    limit: int
    offset: int


# ============== GENRE MANAGEMENT SCHEMAS ==============


class SetRepoGenresRequest(BaseModel):
    """Request to set genres for a repository"""
    genre_ids: List[int]


class GenreResponse(BaseModel):
    """Response for single genre"""
    genre_id: int
    genre_name: str
    genre_color: Optional[str] = None
    genre_icon: Optional[str] = None


class GenresListResponse(BaseModel):
    """Response for genre listing"""
    success: bool
    genres: List[GenreResponse]


class RepoGenresResponse(BaseModel):
    """Response for repository genres"""
    success: bool
    gitea_id: str
    genres: List[GenreResponse]