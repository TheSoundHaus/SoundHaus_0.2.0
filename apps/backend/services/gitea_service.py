"""  
Gitea Admin Service
Provides admin-level operations against a Gitea server, such as creating users.

Requirements:
- Settings from config.py:
  - gitea_url: Base URL to the Gitea instance, e.g. http://gitea:3000 or http://localhost:3000
  - gitea_admin_token: Personal access token with admin permissions
"""

from __future__ import annotations

from typing import Any, Dict, Optional

import requests
from logging_config import get_logger
from config import settings

logger = get_logger("soundhaus.gitea")

class GiteaAdminService:
	"""Service wrapper for Gitea admin endpoints."""

	def __init__(self, base_url: Optional[str] = None, admin_token: Optional[str] = None) -> None:
		self.base_url = (base_url or settings.gitea_url).rstrip("/")
		self.token = admin_token or settings.gitea_admin_token		# Debug (non-sensitive)
		logger.debug("gitea_service_init",
			base_url=self.base_url or "<unset>",
			admin_token_present=bool(self.token),
			admin_token_length=len(self.token) if self.token else 0
		)

		if not self.base_url:
			raise ValueError("GITEA_URL is not set. Please configure the Gitea base URL.")
		if not self.token:
			raise ValueError(
				"Gitea admin token not set. Provide GITEA_ADMIN_TOKEN in environment."
			)

		self.headers = {
			"Authorization": f"token {self.token}",
			"Content-Type": "application/json",
			"Accept": "application/json",
		}

	def _url(self, path: str) -> str:
		full = f"{self.base_url}{path}"
		return full

	def create_user(
		self,
		*,
		username: str,
		email: str,
		password: str,
		full_name: str = "",
		send_notify: bool = False,
		must_change_password: bool = False,
		restricted: Optional[bool] = None,
		visibility: Optional[str] = None,
	) -> Dict[str, Any]:
		"""Create a new Gitea user with email alias to avoid conflicts.
		
		Uses +soundhaus email alias pattern to ensure SoundHaus Gitea accounts
		are completely isolated from any personal Gitea accounts the user may have.
		
		Example: user@gmail.com -> user+soundhaus@gmail.com
		"""
		# Add +soundhaus to email to avoid conflicts with existing Gitea accounts
		# This ensures complete isolation between personal and SoundHaus repos
		if '@' in email:
			local_part, domain = email.rsplit('@', 1)
			gitea_email = f"{local_part}+soundhaus@{domain}"
		else:
			gitea_email = email  # Fallback if email format is invalid
		
		payload: Dict[str, Any] = {
			"username": username,
			"email": gitea_email,  # Use aliased email
			"password": password,
			"full_name": full_name or username,
			"send_notify": send_notify,
			"must_change_password": must_change_password,
		}

		if restricted is not None:
			payload["restricted"] = restricted
		if visibility:
			payload["visibility"] = visibility
		else:
			payload["visibility"] = "private"  # Default to private

		logger.info("create_user_request",
			username=payload.get("username"),
			email=payload.get("email"),
			original_email=email,
			full_name=payload.get("full_name")
		)
		
		try:
			resp = requests.post(
				self._url("/api/v1/admin/users"), 
				json=payload, 
				headers=self.headers, 
				timeout=15
			)
			
			logger.debug("create_user_response", status_code=resp.status_code)
			
			if resp.status_code in (200, 201):
				logger.info("create_user_success", username=payload.get("username"))
				user_data = resp.json()
				return {
					"success": True,
					"status": resp.status_code,
					"data": user_data,
					"message": "User created successfully",
					"username": user_data.get("login"),
					"email": user_data.get("email"),
				}

			# Error handling
			msg = "Failed to create user"
			try:
				detail = resp.json()
				if isinstance(detail, dict):
					msg = detail.get("message") or detail.get("error") or msg
			except Exception:
				msg = resp.text[:200] if resp.text else msg
				
			logger.warning("create_user_failed", status_code=resp.status_code, error=msg)

			return {
				"success": False,
				"status": resp.status_code,
				"data": None,
				"message": msg,
			}
		except requests.Timeout:
			logger.error("create_user_timeout")
			return {
				"success": False,
				"status": 504,
				"data": None,
				"message": "Gitea API timeout",
			}
		except requests.RequestException as e:
			logger.error("create_user_network_error", error=str(e))
			return {
				"success": False,
				"status": 0,
				"data": None,
				"message": f"Network error creating user: {e}",
			}
		except Exception as e:
			logger.exception("create_user_unexpected_error", error=str(e))
			return {
				"success": False,
				"status": 500,
				"data": None,
				"message": f"Unexpected error: {e}",
			}

	def get_user(self, username: str) -> Dict[str, Any]:
		"""Fetch a user's details via the admin API.

		GET /api/v1/admin/users/{username}
		"""
		logger.debug("get_user_request", username=username)
		try:
			resp = requests.get(self._url(f"/api/v1/admin/users/{username}"), headers=self.headers, timeout=10)
			if resp.status_code == 200:
				logger.debug("get_user_success", username=username)
				return {"success": True, "status": 200, "data": resp.json()}

			msg = "Failed to get user"
			try:
				detail = resp.json()
				if isinstance(detail, dict):
					msg = detail.get("message") or detail.get("error") or msg
			except Exception:
				pass
			logger.warning("get_user_failed", username=username, status_code=resp.status_code, error=msg)

			return {"success": False, "status": resp.status_code, "data": None, "message": msg}
		except requests.RequestException as e:
			logger.error("get_user_network_error", username=username, error=str(e))
			return {"success": False, "status": 0, "data": None, "message": f"Network error: {e}"}

	def get_user_by_username(self, username: str) -> Dict[str, Any]:
		"""Check if a Gitea user exists with the given username.
		
		Used to verify if a SoundHaus Gitea account already exists for a user.
		
		Returns:
			{"exists": True, "data": user_object} if found
			{"exists": False} if not found
		"""
		logger.debug("get_user_by_username_request", username=username)
		try:
			resp = requests.get(
				self._url(f"/api/v1/users/{username}"),
				headers=self.headers,
				timeout=10
			)
			
			logger.debug("get_user_by_username_response", status_code=resp.status_code)
			
			if resp.status_code == 200:
				logger.debug("get_user_by_username_exists", username=username)
				return {"exists": True, "data": resp.json()}
			elif resp.status_code == 404:
				logger.debug("get_user_by_username_not_found", username=username)
				return {"exists": False}
			elif resp.status_code == 401:
				logger.error("get_user_by_username_unauthorized", username=username, response=resp.text[:200])
				return {"exists": False, "error": "unauthorized"}
			else:
				logger.warning("get_user_by_username_unexpected_status", username=username, status_code=resp.status_code, response=resp.text[:200])
				return {"exists": False}
		except requests.RequestException as e:
			logger.error("get_user_by_username_network_error", username=username, error=str(e))
			return {"exists": False}

	def create_or_get_user_token_cli(
		self,
		username: str,
		token_name: str,
		scopes: Optional[list] = None
	) -> Dict[str, Any]:
		"""
		Create a Gitea Personal Access Token for a user using the Gitea CLI command.
		This uses the 'gitea admin user generate-access-token' command which bypasses
		API authentication issues.
		
		This method requires:
		- Docker access to the Gitea container, OR
		- SSH access to the Gitea server, OR  
		- The Gitea CLI to be available locally
		
		Args:
			username: Gitea username (Supabase UUID)
			token_name: Name for the token (e.g., "Desktop App Git Access")
			scopes: List of permission scopes (default: ["write:repository", "read:user"])
		
		Returns:
			{
				"success": True/False,
				"token": {"sha1": str, "name": str} (if success),
				"message": str (if error)
			}
		
		CLI Command Format:
			gitea admin user generate-access-token -u <username> --token-name <name> --scopes <scopes>
		"""
		import subprocess
		import json as json_lib
		
		if scopes is None:
			scopes = ["write:repository", "read:user", "write:user"]
		
		# Join scopes with commas for CLI
		scopes_str = ",".join(scopes)
		
		logger.info("create_token_cli_request", username=username, token_name=token_name, scopes=scopes_str)
		
		# Try multiple methods to execute the Gitea CLI command
		gitea_container = settings.gitea_container_name
		gitea_ssh_host = settings.gitea_ssh_host  # e.g., "git@localhost" or "user@129.212.182.247"
		gitea_ssh_port = settings.gitea_ssh_port  # Default to 22, use 2222 for local Docker
		
		try:
			# Method 1: Try SSH (for remote Gitea servers) - PRIMARY METHOD
			if gitea_ssh_host:
				# Build the SSH command to run docker exec on the remote server
				# Using -u git to run as the git user (Gitea doesn't run as root)
				ssh_port_arg = f"-p {gitea_ssh_port}" if gitea_ssh_port != "22" else ""
				ssh_command = (
					f'ssh {ssh_port_arg} {gitea_ssh_host} '
					f'"docker exec -u git gitea gitea admin user generate-access-token '
					f'--username \'{username}\' '
					f'--token-name \'{token_name}\' '
					f'--scopes \'{scopes_str}\' '
					f'--raw"'
				)
				
				logger.debug("create_token_cli_ssh_attempt", host=gitea_ssh_host, port=gitea_ssh_port)
				
				try:
					result = subprocess.run(
						ssh_command,
						shell=True,
						capture_output=True,
						text=True,
						timeout=30
					)
					
					if result.returncode == 0:
						token = result.stdout.strip()
						if token and len(token) > 20:  # Validate token looks valid
							logger.info("create_token_cli_ssh_success", token_prefix=token[:10])
							return {
								"success": True,
								"token": {
									"sha1": token,
									"name": token_name
								}
							}
						else:
							logger.warning("create_token_cli_ssh_invalid_token", token_snippet=token[:20] if token else "<empty>", stderr=result.stderr)
					else:
						logger.warning("create_token_cli_ssh_failed", exit_code=result.returncode, stderr=result.stderr, stdout=result.stdout)
				except subprocess.TimeoutExpired:
					logger.warning("create_token_cli_ssh_timeout")
				except Exception as e:
					logger.exception("create_token_cli_ssh_error", error=str(e))
			else:
				logger.debug("create_token_cli_ssh_not_configured")
			
			# Method 2: Try Docker exec (for local Gitea containers) - FALLBACK
			docker_cmd = [
				"docker", "exec", "-u", "git", gitea_container,
				"gitea", "admin", "user", "generate-access-token",
				"--username", username,
				"--token-name", token_name,
				"--scopes", scopes_str,
				"--raw"  # Output just the token without extra text
			]
			
			logger.debug("create_token_cli_docker_attempt")
			try:
				result = subprocess.run(
					docker_cmd,
					capture_output=True,
					text=True,
					timeout=10
				)
				
				if result.returncode == 0:
					token = result.stdout.strip()
					logger.info("create_token_cli_docker_success", token_prefix=token[:10])
					return {
						"success": True,
						"token": {
							"sha1": token,
							"name": token_name
						}
					}
				else:
					logger.warning("create_token_cli_docker_failed", stderr=result.stderr)
			except FileNotFoundError:
				logger.warning("create_token_cli_docker_not_found")
			except subprocess.TimeoutExpired:
				logger.warning("create_token_cli_docker_timeout")
			except Exception as e:
				logger.error("create_token_cli_docker_error", error=str(e))
			
			# If both methods failed, return error
			return {
				"success": False,
				"message": "Unable to execute Gitea CLI command. Configure GITEA_CONTAINER_NAME or GITEA_SSH_HOST environment variables."
			}
			
		except Exception as e:
			logger.exception("create_token_cli_unexpected_error", error=str(e))
			return {
				"success": False,
				"message": f"Unexpected error: {e}"
			}

	def create_or_get_user_token(
		self,
		username: str,
		token_name: str,
		scopes: Optional[list] = None
	) -> Dict[str, Any]:
		"""
		Create a Gitea Personal Access Token for a user.
		
		Uses SSH CLI method exclusively since Gitea REST API does not support
		creating tokens for other users via token authentication (requires admin:user
		scope which is not available in Gitea 1.24.6).
		
		Args:
			username: Gitea username (Supabase UUID)
			token_name: Name for the token (e.g., "Desktop App Git Access")
			scopes: List of permission scopes (default: ["write:repository", "read:user"])
		
		Returns:
			{
				"success": True/False,
				"token": {"id": int, "name": str, "sha1": str} (if success),
				"message": str (if error)
			}
		
		Example usage:
			result = gitea.create_or_get_user_token(
				username="user-uuid-123",
				token_name="Desktop App - 20240115"
			)
			if result["success"]:
				git_token = result["token"]["sha1"]  # Use this for Git operations
		"""
		logger.debug("create_or_get_user_token", username=username)
		
		# Use SSH CLI method directly (REST API doesn't work with our permissions)
		return self.create_or_get_user_token_cli(username, token_name, scopes)

	def list_user_tokens(self, username: str) -> Dict[str, Any]:
		"""
		List all Gitea tokens for a user (metadata only, no plaintext tokens).
		
		Admin uses "Sudo mode" to list tokens on behalf of users by adding
		the Sudo header with the target username.
		
		Args:
			username: Gitea username (Supabase UUID)
		
		Returns:
			{
				"success": True/False,
				"tokens": [{"id": int, "name": str, "token_last_eight": str}, ...],
				"message": str (if error)
			}
		
		Note: Gitea API never returns plaintext tokens after creation.
		      Only shows last 8 characters for identification.
		"""
		try:
			url = f"{self.base_url}/api/v1/users/{username}/tokens"
			headers = self.headers.copy()
			headers["Sudo"] = username
			
			resp = requests.get(url, headers=headers, timeout=10)
			
			if resp.status_code == 200:
				return {"success": True, "tokens": resp.json()}
			elif resp.status_code == 404:
				return {"success": False, "message": "User not found"}
			elif resp.status_code in (401, 403):
				return {"success": False, "message": "Admin authentication failed"}
			else:
				return {"success": False, "message": f"Error: {resp.text}"}
		except requests.Timeout:
			return {"success": False, "status": 504, "message": "Gitea API timeout"}
		except requests.RequestException as e:
			return {"success": False, "status": 0, "message": f"Network error: {e}"}
		except Exception as e:
			return {"success": False, "status": 500, "message": f"Unexpected error: {e}"}

	def delete_user_token(self, username: str, token_id: int) -> Dict[str, Any]:
		"""
		Delete a specific Gitea token by ID.
		
		Admin uses "Sudo mode" to delete tokens on behalf of users by adding
		the Sudo header with the target username.
		
		Args:
			username: Gitea username (Supabase UUID)
			token_id: ID of the token to delete (from list_user_tokens)
		
		Returns:
			{"success": True/False, "message": str}
		
		Example usage:
			# First list tokens to get ID
			tokens = gitea.list_user_tokens("user-uuid-123")
			token_id = tokens["tokens"][0]["id"]
			
			# Then delete
			result = gitea.delete_user_token("user-uuid-123", token_id)
		"""
		try:
			url = f"{self.base_url}/api/v1/users/{username}/tokens/{token_id}"
			headers = self.headers.copy()
			headers["Sudo"] = username
			
			resp = requests.delete(url, headers=headers, timeout=10)
			
			if resp.status_code == 204:
				return {"success": True, "message": "Token deleted"}
			elif resp.status_code == 404:
				return {"success": False, "message": "Token or user not found"}
			elif resp.status_code in (401, 403):
				return {"success": False, "message": "Admin authentication failed"}
			else:
				return {"success": False, "message": f"Error: {resp.text}"}
		except requests.Timeout:
			return {"success": False, "status": 504, "message": "Gitea API timeout"}
		except requests.RequestException as e:
			return {"success": False, "status": 0, "message": f"Network error: {e}"}
		except Exception as e:
			return {"success": False, "status": 500, "message": f"Unexpected error: {e}"}


	# ============== WEBHOOK MANAGEMENT METHODS ==============

	def create_webhook(
		self,
		owner: str,
		repo: str,
		webhook_url: str,
		secret: str,
		events: list[str] = None
	) -> Dict[str, Any]:
		"""
		Create a webhook for a repository.
		
		Args:
			owner: Repository owner username (Supabase UUID)
			repo: Repository name
			webhook_url: URL to send webhook events
			secret: Secret for HMAC signature validation
			events: List of events to subscribe to
		
		Returns:
			Dictionary with success status and webhook details
		"""
		if events is None:
			events = ["push", "create", "delete", "repository"]
		
		payload = {
			"type": "gitea",
			"config": {
				"url": webhook_url,
				"content_type": "json",
				"secret": secret
			},
			"events": events,
			"active": True
		}
		
		url = self._url(f"/api/v1/repos/{owner}/{repo}/hooks")
		logger.debug("create_webhook_request", owner=owner, repo=repo)
		
		try:
			resp = requests.post(url, json=payload, headers=self.headers, timeout=10)
			
			if resp.status_code == 201:
				webhook_data = resp.json()
				return {
					"success": True,
					"webhook_id": webhook_data.get("id"),
					"url": webhook_data.get("config", {}).get("url"),
					"events": webhook_data.get("events", []),
					"created_at": webhook_data.get("created_at")
				}
			elif resp.status_code == 404:
				return {"success": False, "message": "Repository not found"}
			elif resp.status_code == 409:
				return {"success": False, "message": "Webhook already exists"}
			elif resp.status_code in (401, 403):
				return {"success": False, "message": "Authentication failed"}
			else:
				return {"success": False, "message": f"Error: {resp.text}"}
		except requests.Timeout:
			return {"success": False, "message": "Gitea API timeout"}
		except requests.RequestException as e:
			return {"success": False, "message": f"Network error: {e}"}
		except Exception as e:
			return {"success": False, "message": f"Unexpected error: {e}"}


	def list_webhooks(self, owner: str, repo: str) -> Dict[str, Any]:
		"""
		List all webhooks for a repository.
		
		Args:
			owner: Repository owner username
			repo: Repository name
		
		Returns:
			Dictionary with success status and list of webhooks
		"""
		url = self._url(f"/api/v1/repos/{owner}/{repo}/hooks")
		logger.debug("list_webhooks_request", owner=owner, repo=repo)
		
		try:
			resp = requests.get(url, headers=self.headers, timeout=10)
			
			if resp.status_code == 200:
				webhooks = resp.json()
				return {
					"success": True,
					"webhooks": webhooks
				}
			elif resp.status_code == 404:
				return {"success": False, "message": "Repository not found"}
			elif resp.status_code in (401, 403):
				return {"success": False, "message": "Authentication failed"}
			else:
				return {"success": False, "message": f"Error: {resp.text}"}
		except requests.Timeout:
			return {"success": False, "message": "Gitea API timeout"}
		except requests.RequestException as e:
			return {"success": False, "message": f"Network error: {e}"}
		except Exception as e:
			return {"success": False, "message": f"Unexpected error: {e}"}


	def get_webhook(self, owner: str, repo: str, webhook_id: int) -> Dict[str, Any]:
		"""
		Get details of a specific webhook.
		
		Args:
			owner: Repository owner username
			repo: Repository name
			webhook_id: Gitea webhook ID
		
		Returns:
			Dictionary with webhook details
		"""
		url = self._url(f"/api/v1/repos/{owner}/{repo}/hooks/{webhook_id}")
		logger.debug("get_webhook_request", owner=owner, repo=repo, webhook_id=webhook_id)
		
		try:
			resp = requests.get(url, headers=self.headers, timeout=10)
			
			if resp.status_code == 200:
				return {
					"success": True,
					"webhook": resp.json()
				}
			elif resp.status_code == 404:
				return {"success": False, "message": "Webhook not found"}
			elif resp.status_code in (401, 403):
				return {"success": False, "message": "Authentication failed"}
			else:
				return {"success": False, "message": f"Error: {resp.text}"}
		except requests.Timeout:
			return {"success": False, "message": "Gitea API timeout"}
		except requests.RequestException as e:
			return {"success": False, "message": f"Network error: {e}"}
		except Exception as e:
			return {"success": False, "message": f"Unexpected error: {e}"}


	def update_webhook(
		self,
		owner: str,
		repo: str,
		webhook_id: int,
		webhook_url: Optional[str] = None,
		events: Optional[list[str]] = None,
		active: Optional[bool] = None
	) -> Dict[str, Any]:
		"""
		Update an existing webhook.
		
		Args:
			owner: Repository owner username
			repo: Repository name
			webhook_id: Gitea webhook ID
			webhook_url: New webhook URL (optional)
			events: New event list (optional)
			active: Enable/disable webhook (optional)
		
		Returns:
			Dictionary with success status and updated webhook details
		"""
		# Build PATCH payload with only provided fields
		payload: Dict[str, Any] = {}
		
		if webhook_url is not None:
			payload["config"] = {"url": webhook_url, "content_type": "json"}
		if events is not None:
			payload["events"] = events
		if active is not None:
			payload["active"] = active
		
		url = self._url(f"/api/v1/repos/{owner}/{repo}/hooks/{webhook_id}")
		logger.debug("update_webhook_request", owner=owner, repo=repo, webhook_id=webhook_id)
		
		try:
			resp = requests.patch(url, json=payload, headers=self.headers, timeout=10)
			
			if resp.status_code == 200:
				return {
					"success": True,
					"webhook": resp.json()
				}
			elif resp.status_code == 404:
				return {"success": False, "message": "Webhook not found"}
			elif resp.status_code in (401, 403):
				return {"success": False, "message": "Authentication failed"}
			else:
				return {"success": False, "message": f"Error: {resp.text}"}
		except requests.Timeout:
			return {"success": False, "message": "Gitea API timeout"}
		except requests.RequestException as e:
			return {"success": False, "message": f"Network error: {e}"}
		except Exception as e:
			return {"success": False, "message": f"Unexpected error: {e}"}


	def delete_webhook(self, owner: str, repo: str, webhook_id: int) -> Dict[str, Any]:
		"""
		Delete a webhook from a repository.
		
		Args:
			owner: Repository owner username
			repo: Repository name
			webhook_id: Gitea webhook ID
		
		Returns:
			Dictionary with success status
		"""
		url = self._url(f"/api/v1/repos/{owner}/{repo}/hooks/{webhook_id}")
		logger.debug("delete_webhook_request", owner=owner, repo=repo, webhook_id=webhook_id)
		
		try:
			resp = requests.delete(url, headers=self.headers, timeout=10)
			
			if resp.status_code == 204:
				return {"success": True, "message": "Webhook deleted"}
			elif resp.status_code == 404:
				return {"success": False, "message": "Webhook not found"}
			elif resp.status_code in (401, 403):
				return {"success": False, "message": "Authentication failed"}
			else:
				return {"success": False, "message": f"Error: {resp.text}"}
		except requests.Timeout:
			return {"success": False, "message": "Gitea API timeout"}
		except requests.RequestException as e:
			return {"success": False, "message": f"Network error: {e}"}
		except Exception as e:
			return {"success": False, "message": f"Unexpected error: {e}"}


	def test_webhook(self, owner: str, repo: str, webhook_id: int) -> Dict[str, Any]:
		"""
		Trigger a test delivery for a webhook.
		
		Args:
			owner: Repository owner username
			repo: Repository name
			webhook_id: Gitea webhook ID
		
		Returns:
			Dictionary with test delivery status
		"""
		url = self._url(f"/api/v1/repos/{owner}/{repo}/hooks/{webhook_id}/tests")
		logger.debug("test_webhook_request", owner=owner, repo=repo, webhook_id=webhook_id)
		
		try:
			resp = requests.post(url, headers=self.headers, timeout=10)
			
			if resp.status_code == 204:
				return {"success": True, "message": "Test webhook delivered"}
			elif resp.status_code == 404:
				return {"success": False, "message": "Webhook not found"}
			elif resp.status_code in (401, 403):
				return {"success": False, "message": "Authentication failed"}
			else:
				return {"success": False, "message": f"Error: {resp.text}"}
		except requests.Timeout:
			return {"success": False, "message": "Gitea API timeout"}
		except requests.RequestException as e:
			return {"success": False, "message": f"Network error: {e}"}
		except Exception as e:
			return {"success": False, "message": f"Unexpected error: {e}"}

