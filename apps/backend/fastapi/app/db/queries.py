"""
Database query functions for Supabase tables
Provides reusable functions for CRUD operations on existing tables
"""
from typing import List, Optional, Dict, Any
from datetime import datetime
from .client import get_db_client
from .models import RepoData, Genre, RepoGenre, Profile, CloneEvent


# ============== REPO_DATA QUERIES ==============


def get_repo_data(gitea_id: str) -> Optional[RepoData]:
    """
    Fetch single repository from repo_data table

    Args:
        gitea_id: Repository ID in format "owner/repo-name"

    Returns:
        RepoData object if found, None otherwise
    """
    try:
        client = get_db_client()
        response = client.table("repo_data").select("*").eq("gitea_id", gitea_id).execute()

        if response.data and len(response.data) > 0:
            return RepoData(**response.data[0])
        return None
    except Exception as e:
        print(f"[DB Query] Error fetching repo_data for {gitea_id}: {e}")
        return None


def list_all_repo_metadata(
    limit: int = 50, offset: int = 0
) -> List[RepoData]:
    """
    List all repository metadata from repo_data table

    NOTE: This returns SoundHaus-specific metadata ONLY, not basic Gitea fields.
    Use this to enrich Gitea repository data with:
    - Audio snippets and metadata
    - Clone counts
    - Commit stats
    - Activity timestamps

    For public repo discovery, combine this with Gitea API data.

    Args:
        limit: Maximum number of results
        offset: Number of results to skip (for pagination)

    Returns:
        List of RepoData objects with SoundHaus enrichment data
    """
    try:
        client = get_db_client()
        query = client.table("repo_data").select("*")

        # Order by last_activity_at descending (most recent activity first)
        # Use nulls_last to put repos without activity at the end
        query = query.order("last_activity_at", desc=True, nullslast=True)

        # Apply pagination
        query = query.range(offset, offset + limit - 1)

        response = query.execute()

        return [RepoData(**repo) for repo in response.data]
    except Exception as e:
        print(f"[DB Query] Error listing repo metadata: {e}")
        return []


def upsert_repo_data(repo: RepoData) -> Optional[RepoData]:
    """
    Insert or update repository SoundHaus metadata (idempotent operation)

    Args:
        repo: RepoData object to insert/update

    Returns:
        Updated RepoData object if successful, None otherwise
    """
    try:
        client = get_db_client()

        # Convert Pydantic model to dict
        repo_dict = repo.model_dump()

        # Convert datetime objects to ISO strings
        datetime_fields = ["last_push_at", "last_activity_at"]
        for field in datetime_fields:
            if isinstance(repo_dict.get(field), datetime):
                repo_dict[field] = repo_dict[field].isoformat()

        # Upsert (insert or update on conflict)
        response = (
            client.table("repo_data")
            .upsert(repo_dict, on_conflict="gitea_id")
            .execute()
        )

        if response.data and len(response.data) > 0:
            return RepoData(**response.data[0])
        return None
    except Exception as e:
        print(f"[DB Query] Error upserting repo_data: {e}")
        return None


def delete_repo_data(gitea_id: str) -> bool:
    """
    Delete repository from repo_data table

    Args:
        gitea_id: Repository ID in format "owner/repo-name"

    Returns:
        True if deleted successfully, False otherwise
    """
    try:
        client = get_db_client()
        response = client.table("repo_data").delete().eq("gitea_id", gitea_id).execute()
        return True
    except Exception as e:
        print(f"[DB Query] Error deleting repo_data for {gitea_id}: {e}")
        return False


# ============== GENRE QUERIES ==============


def list_genres() -> List[Genre]:
    """
    Get all available genres from genre_list table

    Returns:
        List of Genre objects
    """
    try:
        client = get_db_client()
        response = client.table("genre_list").select("*").order("genre_name").execute()
        return [Genre(**genre) for genre in response.data]
    except Exception as e:
        print(f"[DB Query] Error listing genres: {e}")
        return []


def get_repo_genres(gitea_id: str) -> List[Genre]:
    """
    Get all genres associated with a repository

    Args:
        gitea_id: Repository ID in format "owner/repo-name"

    Returns:
        List of Genre objects
    """
    try:
        client = get_db_client()

        # Join repo_genres with genre_list to get full genre details
        response = (
            client.table("repo_genres")
            .select("genre_id, genre_list(*)")
            .eq("repo_gitea_id", gitea_id)
            .execute()
        )

        genres = []
        for item in response.data:
            if item.get("genre_list"):
                genres.append(Genre(**item["genre_list"]))

        return genres
    except Exception as e:
        print(f"[DB Query] Error getting repo genres for {gitea_id}: {e}")
        return []


def set_repo_genres(gitea_id: str, genre_ids: List[int]) -> bool:
    """
    Set genres for a repository (replaces existing genres)

    Args:
        gitea_id: Repository ID in format "owner/repo-name"
        genre_ids: List of genre IDs to associate with repo

    Returns:
        True if successful, False otherwise
    """
    try:
        client = get_db_client()

        # Delete existing genre associations
        client.table("repo_genres").delete().eq("repo_gitea_id", gitea_id).execute()

        # Insert new genre associations
        if genre_ids:
            records = [
                {"repo_gitea_id": gitea_id, "genre_id": genre_id}
                for genre_id in genre_ids
            ]
            client.table("repo_genres").insert(records).execute()

        return True
    except Exception as e:
        print(f"[DB Query] Error setting repo genres for {gitea_id}: {e}")
        return False


# ============== PROFILE QUERIES ==============


def get_profile(user_id: str) -> Optional[Profile]:
    """
    Get user profile by user ID

    Args:
        user_id: Supabase Auth user ID (UUID)

    Returns:
        Profile object if found, None otherwise
    """
    try:
        client = get_db_client()
        response = client.table("profiles").select("*").eq("user_id", user_id).execute()

        if response.data and len(response.data) > 0:
            return Profile(**response.data[0])
        return None
    except Exception as e:
        print(f"[DB Query] Error getting profile for {user_id}: {e}")
        return None


def get_profile_by_username(username: str) -> Optional[Profile]:
    """
    Get user profile by username

    Args:
        username: SoundHaus username

    Returns:
        Profile object if found, None otherwise
    """
    try:
        client = get_db_client()
        response = (
            client.table("profiles").select("*").eq("username", username).execute()
        )

        if response.data and len(response.data) > 0:
            return Profile(**response.data[0])
        return None
    except Exception as e:
        print(f"[DB Query] Error getting profile for username {username}: {e}")
        return None


def upsert_profile(profile: Profile) -> Optional[Profile]:
    """
    Insert or update user profile

    Args:
        profile: Profile object to insert/update

    Returns:
        Updated Profile object if successful, None otherwise
    """
    try:
        client = get_db_client()

        profile_dict = profile.model_dump()

        # Convert datetime objects to ISO strings
        if isinstance(profile_dict.get("created_at"), datetime):
            profile_dict["created_at"] = profile_dict["created_at"].isoformat()
        if isinstance(profile_dict.get("updated_at"), datetime):
            profile_dict["updated_at"] = profile_dict["updated_at"].isoformat()

        response = (
            client.table("profiles")
            .upsert(profile_dict, on_conflict="user_id")
            .execute()
        )

        if response.data and len(response.data) > 0:
            return Profile(**response.data[0])
        return None
    except Exception as e:
        print(f"[DB Query] Error upserting profile: {e}")
        return None


# ============== CLONE EVENT QUERIES ==============


def track_clone_event(user_id: str, gitea_id: str) -> bool:
    """
    Track a repository clone event

    Args:
        user_id: User ID who cloned the repo
        gitea_id: Repository ID in format "owner/repo-name"

    Returns:
        True if tracked successfully, False otherwise
    """
    try:
        client = get_db_client()

        event = {
            "user_id": user_id,
            "repo_gitea_id": gitea_id,
            "cloned_at": datetime.utcnow().isoformat(),
        }

        client.table("clone_events").insert(event).execute()

        # Also increment clone_count in repo_data
        increment_clone_count(gitea_id)

        return True
    except Exception as e:
        print(f"[DB Query] Error tracking clone event: {e}")
        return False


def increment_clone_count(gitea_id: str) -> bool:
    """
    Increment the clone count for a repository

    Args:
        gitea_id: Repository ID in format "owner/repo-name"

    Returns:
        True if incremented successfully, False otherwise
    """
    try:
        client = get_db_client()

        # Fetch current count
        repo = get_repo_data(gitea_id)
        if repo:
            new_count = repo.clone_count + 1
            client.table("repo_data").update({"clone_count": new_count}).eq(
                "gitea_id", gitea_id
            ).execute()
            return True
        return False
    except Exception as e:
        print(f"[DB Query] Error incrementing clone count for {gitea_id}: {e}")
        return False
