"""
Review service — business logic for the Mastering Gate workflow.

Handles review session lifecycle (create, approve, deny),
annotations, role checks, and Producer promotions.
"""

from datetime import UTC, datetime
from typing import Any, Dict, List, Optional

import requests
from sqlalchemy import func
from sqlalchemy.orm import Session

from config import settings
from logging_config import get_logger
from models.invitation_models import CollaboratorInvitation
from models.profile_models import Profile
from models.repo_models import RepoData
from models.review_models import ReviewAnnotation, ReviewSession

logger = get_logger(__name__)

# ── Role hierarchy ───────────────────────────────────────────────────────────
# owner > producer > artist
ROLE_HIERARCHY = {"owner": 3, "producer": 2, "artist": 1}
REVIEW_ROLES = {"owner", "producer"}  # roles that can approve/deny


class ReviewService:
    """Encapsulates all Mastering Gate business logic."""

    # ── Role resolution ──────────────────────────────────────────────────

    @staticmethod
    def resolve_role(
        user_id: str,
        user_email: str,
        repo_id: str,
        db: Session,
    ) -> str:
        """Determine the caller's role for a given repository.

        Returns one of: "owner", "producer", "artist", or "none".
        """
        repo = db.query(RepoData).filter(RepoData.gitea_id == repo_id).first()
        if not repo:
            return "none"

        # Owner check — RepoData.owner_id is the Supabase UUID
        if repo.owner_id == user_id:
            return "owner"

        # Look up accepted invitation to determine role
        invitation = (
            db.query(CollaboratorInvitation)
            .filter(
                func.lower(CollaboratorInvitation.invitee_email) == (user_email or "").strip().lower(),
                CollaboratorInvitation.repo_name == repo_id.split("/", 1)[-1],
                CollaboratorInvitation.status == "accepted",
            )
            .first()
        )
        if not invitation:
            return "none"

        # Map stored permission to role
        perm = invitation.permission
        if perm in ("admin", "producer"):
            return "producer"
        if perm in ("write", "artist"):
            return "artist"
        return "none"

    @staticmethod
    def can_review(role: str) -> bool:
        """Return True if the role is allowed to approve/deny reviews."""
        return role in REVIEW_ROLES

    @staticmethod
    def can_promote(role: str) -> bool:
        """Return True if the role is allowed to promote Artists to Producers."""
        return role in REVIEW_ROLES

    # ── Review session lifecycle ─────────────────────────────────────────

    @staticmethod
    def create_session(
        repo_id: str,
        commit_sha: str,
        branch_name: str,
        artist_id: str,
        db: Session,
    ) -> ReviewSession:
        """Create a new pending review session for an Artist push."""
        session = ReviewSession(
            repo_id=repo_id,
            commit_sha=commit_sha,
            branch_name=branch_name,
            artist_id=artist_id,
            status="pending",
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        logger.info(
            "review_session_created",
            session_id=session.id,
            repo=repo_id,
            artist=artist_id,
            branch=branch_name,
        )
        return session

    @staticmethod
    def list_sessions(
        repo_id: str,
        db: Session,
        status: Optional[str] = None,
    ) -> List[ReviewSession]:
        """List review sessions for a repo, optionally filtered by status."""
        query = db.query(ReviewSession).filter(ReviewSession.repo_id == repo_id)
        if status:
            query = query.filter(ReviewSession.status == status)
        return query.order_by(ReviewSession.created_at.desc()).all()

    @staticmethod
    def get_session(session_id: str, db: Session) -> Optional[ReviewSession]:
        """Fetch a single review session by ID."""
        return db.query(ReviewSession).filter(ReviewSession.id == session_id).first()

    @staticmethod
    def approve_session(
        session: ReviewSession,
        reviewer_id: str,
        reviewer_notes: Optional[str],
        owner: str,
        repo_name: str,
        db: Session,
    ) -> Dict[str, Any]:
        """Approve a pending review session and merge the branch to main."""
        if session.status != "pending":
            return {"success": False, "message": f"Review is already {session.status}"}

        # Attempt Gitea merge via API
        merge_result = ReviewService._merge_branch(
            owner, repo_name, session.branch_name,
        )

        if not merge_result.get("success"):
            return {
                "success": False,
                "message": f"Merge failed: {merge_result.get('message', 'unknown error')}",
            }

        session.status = "approved"
        session.reviewer_id = reviewer_id
        session.reviewer_notes = reviewer_notes
        session.reviewed_at = datetime.now(UTC)
        db.commit()

        logger.info(
            "review_approved",
            session_id=session.id,
            reviewer=reviewer_id,
            branch=session.branch_name,
        )
        return {"success": True, "message": "Changes approved and merged to main"}

    @staticmethod
    def deny_session(
        session: ReviewSession,
        reviewer_id: str,
        reviewer_notes: Optional[str],
        db: Session,
    ) -> Dict[str, Any]:
        """Deny a pending review session."""
        if session.status != "pending":
            return {"success": False, "message": f"Review is already {session.status}"}

        session.status = "denied"
        session.reviewer_id = reviewer_id
        session.reviewer_notes = reviewer_notes
        session.reviewed_at = datetime.now(UTC)
        db.commit()

        logger.info(
            "review_denied",
            session_id=session.id,
            reviewer=reviewer_id,
            branch=session.branch_name,
        )
        return {"success": True, "message": "Changes denied"}

    # ── Annotations ──────────────────────────────────────────────────────

    @staticmethod
    def add_annotation(
        session_id: str,
        author_id: str,
        comment_text: str,
        target_path: Optional[str],
        db: Session,
    ) -> ReviewAnnotation:
        """Attach a comment to a review session."""
        annotation = ReviewAnnotation(
            review_session_id=session_id,
            author_id=author_id,
            comment_text=comment_text,
            target_path=target_path,
        )
        db.add(annotation)
        db.commit()
        db.refresh(annotation)
        logger.info(
            "review_annotation_added",
            annotation_id=annotation.id,
            session_id=session_id,
            author=author_id,
        )
        return annotation

    @staticmethod
    def list_annotations(session_id: str, db: Session) -> List[ReviewAnnotation]:
        """List all annotations for a review session."""
        return (
            db.query(ReviewAnnotation)
            .filter(ReviewAnnotation.review_session_id == session_id)
            .order_by(ReviewAnnotation.created_at)
            .all()
        )

    # ── Role promotion ───────────────────────────────────────────────────

    @staticmethod
    def promote_to_producer(
        repo_name: str,
        owner_username: str,
        target_email: str,
        db: Session,
    ) -> Dict[str, Any]:
        """Promote an Artist to Producer by updating their invitation permission."""
        invitation = (
            db.query(CollaboratorInvitation)
            .filter(
                func.lower(CollaboratorInvitation.invitee_email) == (target_email or "").strip().lower(),
                CollaboratorInvitation.repo_name == repo_name,
                CollaboratorInvitation.owner_username == owner_username,
                CollaboratorInvitation.status == "accepted",
            )
            .first()
        )
        if not invitation:
            return {
                "success": False,
                "message": "No accepted invitation found for this user on this repo",
            }

        if invitation.permission in ("admin", "producer"):
            return {"success": False, "message": "User is already a Producer"}

        invitation.permission = "producer"
        db.commit()

        logger.info(
            "artist_promoted_to_producer",
            email=target_email,
            repo=repo_name,
        )
        return {"success": True, "message": f"{target_email} promoted to Producer"}

    # ── Internal: Gitea merge ────────────────────────────────────────────

    @staticmethod
    def _merge_branch(
        owner: str,
        repo_name: str,
        branch_name: str,
        target_branch: str = "main",
    ) -> Dict[str, Any]:
        """Merge a branch into the target branch via the Gitea contents API.

        Uses the Gitea merge API to perform a server-side merge.
        """
        base_url = settings.gitea_url.rstrip("/")
        url = f"{base_url}/api/v1/repos/{owner}/{repo_name}/merge-upstream"
        headers = {"Authorization": f"token {settings.gitea_admin_token}"}
        payload = {"base": target_branch, "head": branch_name}

        try:
            resp = requests.post(url, json=payload, headers=headers, timeout=15)
            if resp.status_code in (200, 201, 204):
                return {"success": True}
            # Fallback: try the raw git merge endpoint
            return ReviewService._merge_via_update_ref(
                owner, repo_name, branch_name, target_branch,
            )
        except requests.RequestException as e:
            logger.error(
                "gitea_merge_error",
                owner=owner,
                repo=repo_name,
                branch=branch_name,
                error=str(e),
            )
            return {"success": False, "message": f"Network error: {e}"}

    @staticmethod
    def _merge_via_update_ref(
        owner: str,
        repo_name: str,
        source_branch: str,
        target_branch: str,
    ) -> Dict[str, Any]:
        """Fallback merge — get source branch HEAD and update target ref."""
        base_url = settings.gitea_url.rstrip("/")
        headers = {"Authorization": f"token {settings.gitea_admin_token}"}

        # Get source branch SHA
        branch_url = f"{base_url}/api/v1/repos/{owner}/{repo_name}/branches/{source_branch}"
        try:
            resp = requests.get(branch_url, headers=headers, timeout=15)
            if resp.status_code != 200:
                return {"success": False, "message": f"Branch {source_branch} not found"}
            source_sha = resp.json().get("commit", {}).get("id")
            if not source_sha:
                return {"success": False, "message": "Could not resolve source branch SHA"}

            # Update target branch ref
            ref_url = (
                f"{base_url}/api/v1/repos/{owner}/{repo_name}"
                f"/git/refs/heads/{target_branch}"
            )
            resp = requests.patch(
                ref_url,
                json={"sha": source_sha},
                headers=headers,
                timeout=15,
            )
            if resp.status_code in (200, 204):
                return {"success": True}
            msg = resp.json().get("message", resp.text[:200])
            return {"success": False, "message": msg}
        except requests.RequestException as e:
            return {"success": False, "message": f"Network error: {e}"}
