"""
In-memory storage for application state
TODO: Replace with proper database in the future
"""
from typing import Dict, Any

# Watch sessions storage
# Format: {watch_id: {user_email, repo_name, watch_token, local_path, status, ...}}
watch_sessions: Dict[str, Dict[str, Any]] = {}

# Pending collaboration invitations
# Format: {invitation_id: {repo_name, inviter, invitee, created_at, ...}}
pending_invitations: Dict[str, Dict[str, Any]] = {}

# Repository preferences
# Format: {user_email: {repo_name: {preferences_dict}}}
repo_preferences: Dict[str, Dict[str, Dict[str, Any]]] = {}
