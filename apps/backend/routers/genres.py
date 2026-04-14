"""
Genre endpoints – list, create, details, patch, and repo-genre assignment.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy.orm import Session
from typing import Optional

from database import get_db
from dependencies import limiter, user_limiter, verify_token, get_auth, resolve_owner_id
from logging_config import get_logger
from models.genre_models import GenreList
from models.repo_models import RepoData
from models.profile_models import Profile
from models.invitation_models import CollaboratorInvitation

logger = get_logger(__name__)

router = APIRouter(tags=["genres"])


# ── List / Create ────────────────────────────────────────────────────────────

@router.get("/genres")
@limiter.limit("60/minute")
async def get_genres(request: Request, db: Session = Depends(get_db)):
    """Get all available genres (public endpoint)."""
    genres = db.query(GenreList).all()
    return {
        "success": True,
        "genres": [
            {
                "genre_id": g.genre_id,
                "genre_name": g.genre_name,
                "genre_color": g.genre_color,
                "genre_icon": g.genre_icon,
            }
            for g in genres
        ],
    }


@router.post("/genres")
@user_limiter.limit("10/minute")
async def create_genre(
    request: Request,
    req: dict,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Create a new genre (admin only – for now just requires auth)."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Must be logged in")

    user_role = user_res.get("user", {}).get("role", "")
    if user_role != "service_role" and user_role != "supabase_admin":
        raise HTTPException(status_code=403, detail="User does not have Admin privileges")

    genre_name = req.get("genre_name")
    if not genre_name:
        raise HTTPException(status_code=400, detail="genre_name required")

    existing = db.query(GenreList).filter(GenreList.genre_name == genre_name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Genre already exists")

    new_genre = GenreList(genre_name=genre_name)
    db.add(new_genre)
    db.commit()
    db.refresh(new_genre)

    return {
        "success": True,
        "genre": {
            "genre_id": new_genre.genre_id,
            "genre_name": new_genre.genre_name,
        },
    }


# ── Details / Patch ──────────────────────────────────────────────────────────

@router.get("/genres/{genre_id}")
@limiter.limit("60/minute")
async def get_genre_details(
    request: Request,
    genre_id: int,
    db: Session = Depends(get_db),
):
    """Get genre details – description, song count, top repos, etc."""
    genre = db.query(GenreList).filter(GenreList.genre_id == genre_id).first()
    if not genre:
        raise HTTPException(status_code=404, detail="Genre not found")

    return {
        "success": True,
        "genre_name": genre.genre_name,
        "description": genre.genre_description,
        "song_count": genre.song_count,
        "genre_icon": genre.genre_icon,
        "genre_color": genre.genre_color,
    }


@router.patch("/genres/{genre_id}")
@user_limiter.limit("20/minute")
async def patch_genre_data(
    request: Request,
    genre_id: int,
    genre_name: Optional[str] = None,
    genre_description: Optional[str] = None,
    genre_icon: Optional[str] = None,
    genre_color: Optional[str] = None,
    display_order: Optional[int] = None,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Update genre fields (admin only)."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Must be logged in")

    user_role = user_res.get("user", {}).get("role", "")
    if user_role != "service_role" and user_role != "supabase_admin":
        raise HTTPException(status_code=403, detail="Admin only")

    genre = db.query(GenreList).filter(GenreList.genre_id == genre_id).first()
    if not genre:
        raise HTTPException(status_code=404, detail="Genre not found")

    if genre_name is not None:
        genre.genre_name = genre_name
    if genre_description is not None:
        genre.genre_description = genre_description
    if genre_icon is not None:
        genre.genre_icon = genre_icon
    if genre_color is not None:
        genre.genre_color = genre_color
    if display_order is not None:
        genre.display_order = display_order

    db.commit()

    return {"success": True, "message": "Genre updated"}


# ── Repo ↔ Genre Assignment ─────────────────────────────────────────────────

@router.post("/repos/{owner}/{repo}/genres")
@user_limiter.limit("20/minute")
async def update_repo_genres(
    request: Request,
    owner: str,
    repo: str,
    req: dict,
    token: str = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """Assign genres to a repo (owner only)."""
    user_res = await get_auth().get_user(token)
    if not user_res.get("success"):
        raise HTTPException(status_code=401, detail="Must be logged in")

    user_id = user_res["user"]["id"]
    # Resolve URL owner (could be username OR UUID) to canonical UUID
    owner_id = resolve_owner_id(owner, db)
    # Allow if user is the owner
    is_owner = str(user_id) == str(owner_id)
    # Allow if user is an admin collaborator
    is_admin_collab = False
    if not is_owner:
        invite = (
            db.query(CollaboratorInvitation)
            .filter(
                CollaboratorInvitation.repo_name == repo,
                CollaboratorInvitation.owner_username == owner_id,
                CollaboratorInvitation.status == "accepted",
                CollaboratorInvitation.permission == "admin",
            )
            .first()
        )
        if invite:
            # Check that the invitee is the current user
            profile = db.query(Profile).filter(Profile.email == invite.invitee_email).first()
            if profile and str(profile.id) == str(user_id):
                is_admin_collab = True
    if not is_owner and not is_admin_collab:
        raise HTTPException(status_code=403, detail="Not your repo")

    repo_id = f"{owner_id}/{repo}"
    repo_data = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
    if not repo_data:
        raise HTTPException(status_code=404, detail="Repo not registered on SoundHaus")

    genre_ids = req.get("genre_ids", [])
    genres = db.query(GenreList).filter(GenreList.genre_id.in_(genre_ids)).all()

    repo_data.genres = genres
    db.commit()

    return {"success": True, "message": "Genres updated"}
