"""
Webhook Service - Processes incoming Gitea webhook events.

Gitea sends webhook POST requests when events occur (push, create branch, delete, etc.)
This service:
1. Validates the webhook HMAC-SHA256 signature
2. Routes events to the appropriate handler
3. Stores delivery records and parsed event data in the database
4. Updates RepoData activity timestamps

Flow:
  Gitea -> POST /api/webhooks/gitea -> validate_signature -> process_event -> store in DB
"""
import hmac
import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from sqlalchemy.orm import Session
from logging_config import get_logger
from config import settings
from models.webhook_models import WebhookDelivery, PushEvent, RepositoryEvent, WebhookConfig
from models.repo_models import RepoData

logger = get_logger(__name__)


class WebhookService:
    """
    Service for processing incoming Gitea webhooks.

    Supported events:
    - push: Code pushed to a branch (commits)
    - create: Branch or tag created
    - delete: Branch or tag deleted
    - repository: Repo created, deleted, or renamed
    - fork: Repository forked
    """

    def validate_signature(self, payload: bytes, signature: str) -> bool:
        """
        Validate Gitea webhook HMAC-SHA256 signature.

        Gitea signs each webhook delivery with the secret configured
        when the webhook was created. We verify by computing our own
        HMAC and comparing in constant time.

        Args:
            payload: Raw request body bytes
            signature: Value from X-Gitea-Signature header

        Returns:
            True if signature is valid
        """
        if not signature:
            logger.warning("webhook_missing_signature")
            return False

        secret = settings.gitea_webhook_secret
        if not secret:
            logger.warning("webhook_secret_not_configured")
            return False

        expected = hmac.new(
            secret.encode("utf-8"),
            payload,
            hashlib.sha256
        ).hexdigest()

        is_valid = hmac.compare_digest(expected, signature)

        if not is_valid:
            logger.warning("webhook_invalid_signature",
                           expected_prefix=expected[:8],
                           received_prefix=signature[:8])

        return is_valid

    def process_event(
        self,
        event_type: str,
        delivery_id: str,
        payload: Dict[str, Any],
        db: Session
    ) -> Dict[str, Any]:
        """
        Route a webhook event to the appropriate handler.

        Every delivery is recorded in the webhook_deliveries table.
        Specific event types get additional processing.

        Args:
            event_type: Gitea event type (push, create, delete, repository, fork)
            delivery_id: Unique delivery ID from X-Gitea-Delivery header
            payload: Parsed JSON payload
            db: Database session

        Returns:
            Dict with processing result
        """
        # Extract repo info
        repo_info = payload.get("repository", {})
        repo_full_name = repo_info.get("full_name", "unknown")

        logger.info("webhook_processing",
                     event_type=event_type,
                     delivery_id=delivery_id,
                     repo=repo_full_name)

        # Step 1: Record the delivery
        # Check if repo exists in our DB (FK constraint on repo_id)
        repo_exists = db.query(RepoData).filter(
            RepoData.gitea_id == repo_full_name
        ).first()

        delivery = None
        if repo_exists:
            delivery = WebhookDelivery(
                repo_id=repo_full_name,
                event_type=event_type,
                payload=payload,
                signature=delivery_id,
                processing_status="pending"
            )
            db.add(delivery)
            db.flush()
        else:
            logger.warning("webhook_repo_not_in_db",
                           repo=repo_full_name,
                           event_type=event_type,
                           message="Repo not in repo_data table, skipping delivery record")

        # Step 2: Route to specific handler
        result = {
            "event_type": event_type,
            "delivery_id": delivery_id,
            "db_delivery_id": delivery.id if delivery else None,
            "repo": repo_full_name,
            "repo_tracked": repo_exists is not None,
            "status": "processed"
        }

        try:
            if event_type == "push":
                handler_result = self._handle_push(payload, delivery, db)
            elif event_type == "create":
                handler_result = self._handle_create(payload, delivery, db)
            elif event_type == "delete":
                handler_result = self._handle_delete(payload, delivery, db)
            elif event_type == "repository":
                handler_result = self._handle_repository(payload, delivery, db)
            elif event_type == "fork":
                handler_result = self._handle_fork(payload, delivery, db)
            else:
                logger.info("webhook_unhandled_event", event_type=event_type)
                handler_result = {"status": "ignored", "reason": f"unhandled event: {event_type}"}

            result.update(handler_result)
            if delivery:
                delivery.processing_status = "success"
            db.commit()

        except Exception as e:
            logger.error("webhook_handler_failed",
                         event_type=event_type,
                         delivery_id=delivery_id,
                         error=str(e),
                         exc_info=True)
            if delivery:
                delivery.processing_status = "failed"
                delivery.error_message = str(e)
            db.commit()
            result["status"] = "failed"
            result["error"] = str(e)

        return result

    def _handle_push(
        self,
        payload: Dict[str, Any],
        delivery: WebhookDelivery,
        db: Session
    ) -> Dict[str, Any]:
        """
        Handle push events — someone pushed commits to a repo.

        Stores each push as a PushEvent record and updates
        RepoData with latest activity timestamps + commit count.
        """
        repo_full_name = payload.get("repository", {}).get("full_name", "")
        ref = payload.get("ref", "")
        before_sha = payload.get("before", "")
        after_sha = payload.get("after", "")
        commits = payload.get("commits", [])
        pusher = payload.get("pusher", {})
        pusher_username = pusher.get("username", pusher.get("login", "unknown"))

        logger.info("webhook_push",
                     repo=repo_full_name,
                     ref=ref,
                     commit_count=len(commits),
                     pusher=pusher_username)

        # Create PushEvent record (only if repo exists in our DB - FK constraint)
        repo_data = db.query(RepoData).filter(
            RepoData.gitea_id == repo_full_name
        ).first()

        if repo_data:
            push_event = PushEvent(
                repo_id=repo_full_name,
                pusher_id=pusher_username,
                pusher_username=pusher_username,
                ref=ref,
                before_sha=before_sha,
                after_sha=after_sha,
                commit_count=len(commits)
            )
            db.add(push_event)

            # Update RepoData activity
            now = datetime.now(timezone.utc)
            repo_data.last_push_at = now
            repo_data.total_commits = (repo_data.total_commits or 0) + len(commits)
            repo_data.last_activity_at = now
            logger.debug("repo_activity_updated",
                         repo=repo_full_name,
                         total_commits=repo_data.total_commits)
        else:
            logger.warning("webhook_push_repo_not_tracked",
                           repo=repo_full_name,
                           message="Push received for repo not in repo_data")

        # Build commit summaries for response
        commit_summaries = []
        for c in commits[:10]:  # Cap at 10 to avoid huge responses
            commit_summaries.append({
                "sha": c.get("id", "")[:8],
                "message": c.get("message", "")[:120],
                "author": c.get("author", {}).get("name", ""),
            })

        return {
            "status": "processed",
            "ref": ref,
            "commit_count": len(commits),
            "pusher": pusher_username,
            "commits": commit_summaries
        }

    def _handle_create(
        self,
        payload: Dict[str, Any],
        delivery: WebhookDelivery,
        db: Session
    ) -> Dict[str, Any]:
        """Handle create events — branch or tag created."""
        repo_full_name = payload.get("repository", {}).get("full_name", "")
        ref_type = payload.get("ref_type", "unknown")  # "branch" or "tag"
        ref = payload.get("ref", "")
        sender = payload.get("sender", {})
        sender_username = sender.get("username", sender.get("login", "unknown"))

        logger.info("webhook_create",
                     repo=repo_full_name,
                     ref_type=ref_type,
                     ref=ref,
                     sender=sender_username)

        # Record event (only if repo is tracked in our DB)
        repo_data = db.query(RepoData).filter(
            RepoData.gitea_id == repo_full_name
        ).first()

        if repo_data:
            repo_event = RepositoryEvent(
                repo_id=repo_full_name,
                event_type=f"{ref_type}_created",
                actor_id=sender_username,
                actor_username=sender_username
            )
            db.add(repo_event)
            repo_data.last_activity_at = datetime.now(timezone.utc)

        return {
            "status": "processed",
            "ref_type": ref_type,
            "ref": ref,
            "sender": sender_username
        }

    def _handle_delete(
        self,
        payload: Dict[str, Any],
        delivery: WebhookDelivery,
        db: Session
    ) -> Dict[str, Any]:
        """Handle delete events — branch or tag deleted."""
        repo_full_name = payload.get("repository", {}).get("full_name", "")
        ref_type = payload.get("ref_type", "unknown")
        ref = payload.get("ref", "")
        sender = payload.get("sender", {})
        sender_username = sender.get("username", sender.get("login", "unknown"))

        logger.info("webhook_delete",
                     repo=repo_full_name,
                     ref_type=ref_type,
                     ref=ref,
                     sender=sender_username)

        # Record event (only if repo is tracked in our DB)
        repo_data = db.query(RepoData).filter(
            RepoData.gitea_id == repo_full_name
        ).first()

        if repo_data:
            repo_event = RepositoryEvent(
                repo_id=repo_full_name,
                event_type=f"{ref_type}_deleted",
                actor_id=sender_username,
                actor_username=sender_username
            )
            db.add(repo_event)

        return {
            "status": "processed",
            "ref_type": ref_type,
            "ref": ref,
            "sender": sender_username
        }

    def _handle_repository(
        self,
        payload: Dict[str, Any],
        delivery: WebhookDelivery,
        db: Session
    ) -> Dict[str, Any]:
        """Handle repository lifecycle events (created, deleted, renamed)."""
        action = payload.get("action", "unknown")
        repo_full_name = payload.get("repository", {}).get("full_name", "")
        sender = payload.get("sender", {})
        sender_username = sender.get("username", sender.get("login", "unknown"))

        logger.info("webhook_repository",
                     repo=repo_full_name,
                     action=action,
                     sender=sender_username)

        # Record event and handle repo lifecycle
        repo_data = db.query(RepoData).filter(
            RepoData.gitea_id == repo_full_name
        ).first()

        if repo_data:
            repo_event = RepositoryEvent(
                repo_id=repo_full_name,
                event_type=f"repository_{action}",
                actor_id=sender_username,
                actor_username=sender_username
            )
            db.add(repo_event)

        # If repo deleted in Gitea, clean up our metadata
        if action == "deleted" and repo_data:
                db.delete(repo_data)
                logger.info("repo_data_cleaned_up", repo=repo_full_name)

        return {
            "status": "processed",
            "action": action,
            "sender": sender_username
        }

    def _handle_fork(
        self,
        payload: Dict[str, Any],
        delivery: WebhookDelivery,
        db: Session
    ) -> Dict[str, Any]:
        """Handle fork events — repo was forked by another user."""
        original_repo = payload.get("repository", {}).get("full_name", "")
        forkee = payload.get("forkee", {})
        forked_repo = forkee.get("full_name", "unknown")
        sender = payload.get("sender", {})
        sender_username = sender.get("username", sender.get("login", "unknown"))

        logger.info("webhook_fork",
                     original_repo=original_repo,
                     forked_repo=forked_repo,
                     sender=sender_username)

        # Increment clone count (fork ≈ clone)
        repo_data = db.query(RepoData).filter(
            RepoData.gitea_id == original_repo
        ).first()
        if repo_data:
            repo_data.clone_count = (repo_data.clone_count or 0) + 1
            repo_data.last_activity_at = datetime.now(timezone.utc)
            logger.debug("fork_count_incremented", repo=original_repo)

        return {
            "status": "processed",
            "original_repo": original_repo,
            "forked_repo": forked_repo,
            "sender": sender_username
        }

    def setup_webhook_for_repo(
        self,
        owner: str,
        repo: str,
        gitea_admin,
        db: Session
    ) -> Dict[str, Any]:
        """
        Create a Gitea webhook for a repo and store the config in our DB.

        Called automatically when a new repo is created.

        Args:
            owner: Repository owner (Supabase UUID)
            repo: Repository name
            gitea_admin: GiteaAdminService instance
            db: Database session

        Returns:
            Dict with success status and details
        """
        webhook_url = f"{settings.webhook_base_url}/api/webhooks/gitea"
        secret = settings.gitea_webhook_secret
        events = ["push", "create", "delete", "repository", "fork"]

        logger.info("webhook_setup_start",
                     owner=owner,
                     repo=repo,
                     webhook_url=webhook_url)

        # Create webhook in Gitea
        result = gitea_admin.create_webhook(
            owner=owner,
            repo=repo,
            webhook_url=webhook_url,
            secret=secret,
            events=events
        )

        if not result.get("success"):
            logger.warning("webhook_setup_failed",
                           owner=owner,
                           repo=repo,
                           error=result.get("message", "Unknown error"))
            return result

        # Store config in our DB
        try:
            webhook_config = WebhookConfig(
                repo_id=f"{owner}/{repo}",
                gitea_webhook_id=result.get("webhook_id"),
                webhook_secret=secret,
                is_active=True
            )
            db.add(webhook_config)
            db.flush()

            logger.info("webhook_setup_success",
                         owner=owner,
                         repo=repo,
                         webhook_id=result.get("webhook_id"))

            return {
                "success": True,
                "webhook_id": result.get("webhook_id"),
                "url": webhook_url,
                "events": events
            }
        except Exception as e:
            logger.error("webhook_config_save_failed",
                         owner=owner,
                         repo=repo,
                         error=str(e))
            # Webhook was created in Gitea but DB save failed
            # Still return success since the webhook is functional
            return {
                "success": True,
                "webhook_id": result.get("webhook_id"),
                "url": webhook_url,
                "events": events,
                "warning": f"Webhook created but config save failed: {str(e)}"
            }


# Singleton instance
webhook_service = WebhookService()
