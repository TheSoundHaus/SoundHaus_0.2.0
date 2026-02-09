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
				self._url(f"/api/v1/admin/users/{username}"),
				headers=self.headers,
				timeout=10
			)
			
			print(f"  -> status={resp.status_code}")
			
			if resp.status_code == 200:
				print(f"  -> user exists")
				return {"exists": True, "data": resp.json()}
			elif resp.status_code == 404:
				print(f"  -> user not found")
				return {"exists": False}
			elif resp.status_code == 401:
				print(f"  -> ERROR: 401 Unauthorized - admin token may be invalid")
				print(f"  -> Response: {resp.text[:200]}")
				return {"exists": False, "error": "unauthorized"}
			else:
				print(f"  -> unexpected status")
				print(f"  -> Response: {resp.text[:200]}")
				return {"exists": False}
		except requests.RequestException as e:
			print(f"  -> network error: {e}")
			return {"exists": False}

	def verify_gitea_token(self, token: str) -> Dict[str, Any]:
		"""Verify that a Gitea token is valid.
		
		Tests any Gitea token (user or admin) by making a simple API call to get the authenticated user.
		
		Args:
			token: The Gitea token to verify
		
		Returns:
			{"valid": True, "user": user_data} if token works
			{"valid": False, "error": str} if token is invalid
		"""
		print(f"[GiteaAdminService] verify_gitea_token: GET /api/v1/user")
		try:
			headers = {
				"Authorization": f"token {token}",
				"Content-Type": "application/json",
				"Accept": "application/json",
			}
			resp = requests.get(
				self._url("/api/v1/user"),
				headers=headers,
				timeout=10
			)
			
			print(f"  -> status={resp.status_code}")
			
			if resp.status_code == 200:
				user_data = resp.json()
				print(f"  -> token is valid")
				print(f"  -> authenticated as: {user_data.get('login')}")
				return {"valid": True, "user": user_data}
			elif resp.status_code == 401:
				print(f"  -> ERROR: 401 Unauthorized - token is invalid or expired")
				return {"valid": False, "error": "unauthorized"}
			else:
				print(f"  -> unexpected status {resp.status_code}")
				return {"valid": False, "error": f"status {resp.status_code}"}
		except requests.RequestException as e:
			print(f"  -> network error: {e}")
			return {"valid": False, "error": str(e)}

	def verify_admin_token(self) -> Dict[str, Any]:
		"""Verify that the admin token is valid and has necessary permissions.
		
		Tests the token by making a simple API call to get the authenticated user.
		
		Returns:
			{"valid": True, "user": user_data} if token works
			{"valid": False, "error": str} if token is invalid
		"""
		print(f"[GiteaAdminService] verify_admin_token: GET /api/v1/user")
		try:
			resp = requests.get(
				self._url("/api/v1/user"),
				headers=self.headers,
				timeout=10
			)
			
			print(f"  -> status={resp.status_code}")
			
			if resp.status_code == 200:
				user_data = resp.json()
				print(f"  -> token is valid")
				print(f"  -> authenticated as: {user_data.get('login')}")
				print(f"  -> is_admin: {user_data.get('is_admin')}")
				return {"valid": True, "user": user_data}
			elif resp.status_code == 401:
				print(f"  -> ERROR: 401 Unauthorized - token is invalid or expired")
				print(f"  -> Response: {resp.text[:200]}")
				return {"valid": False, "error": "unauthorized"}
			else:
				print(f"  -> unexpected status")
				print(f"  -> Response: {resp.text[:200]}")
				return {"valid": False, "error": f"status {resp.status_code}"}
		except requests.RequestException as e:
			print(f"  -> network error: {e}")
			return {"valid": False, "error": str(e)}

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
		
		print(f"[GiteaAdminService] create_or_get_user_token_cli: Using Gitea CLI")
		print(f"  username={username}")
		print(f"  token_name={token_name}")
		print(f"  scopes={scopes_str}")
		
		gitea_container = os.getenv("GITEA_CONTAINER_NAME", "gitea")
		
		try:			
			# Try Docker exec from host
			docker_cmd = [
				"docker", "exec", "-u", "git", gitea_container,
				"gitea", "admin", "user", "generate-access-token",
				"--username", username,
				"--token-name", token_name,
				"--scopes", scopes_str,
				"--raw"  # Output just the token without extra text
			]
			
			print(f"  -> Attempting Docker exec from host...")
			try:
				result = subprocess.run(
					docker_cmd,
					capture_output=True,
					text=True,
					timeout=10
				)
				
				if result.returncode == 0:
					token = result.stdout.strip()
					print(f"  -> Docker method succeeded")
					print(f"  -> Token created: {token[:20]}...")
					return {
						"success": True,
						"token": {
							"sha1": token,
							"name": token_name
						}
					}
				else:
					print(f"  -> Docker method failed: {result.stderr[:100]}")
			except FileNotFoundError:
				print(f"  -> Docker not found on host, trying fallback...")
			except subprocess.TimeoutExpired:
				print(f"  -> Docker command timeout")
			except Exception as e:
				print(f"  -> Docker method error: {e}")
			
			# Fallback: Use curl to execute command in Gitea container via Docker socket
			# This works when FastAPI is in the Docker network
			print(f"  -> Attempting fallback via Gitea internal command...")
			try:
				# Try to directly call gitea command if FastAPI is in the same network
				# This requires that fastapi container can reach gitea container
				docker_cmd_fallback = [
					"docker", "exec", gitea_container,
					"bash", "-c",
					f"cd /var/lib/gitea && gitea admin user generate-access-token --username {username} --token-name \"{token_name}\" --scopes {scopes_str} --raw"
				]
				
				result = subprocess.run(
					docker_cmd_fallback,
					capture_output=True,
					text=True,
					timeout=10
				)
				
				if result.returncode == 0:
					token = result.stdout.strip()
					print(f"  -> Fallback method succeeded")
					print(f"  -> Token created: {token[:20]}...")
					return {
						"success": True,
						"token": {
							"sha1": token,
							"name": token_name
						}
					}
				else:
					print(f"  -> Fallback failed: {result.stderr[:100]}")
			except Exception as e:
				print(f"  -> Fallback error: {e}")
			
			# If both Docker methods failed, return error
			return {
				"success": False,
				"message": "Unable to execute Gitea CLI command. Ensure GITEA_CONTAINER_NAME is set correctly."
			}
			
		except Exception as e:
			print(f"  -> Unexpected error: {e}")
			import traceback
			traceback.print_exc()
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
		
		This method attempts to use the Gitea CLI command first (more reliable),
		and falls back to the API method if CLI is not available.
		
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
		# Try CLI method first (more reliable for admin operations)
		cli_result = self.create_or_get_user_token_cli(username, token_name, scopes)
		if cli_result.get("success"):
			return cli_result
		
		# Fallback to API method (kept for backwards compatibility)
		print(f"[GiteaAdminService] CLI method failed, falling back to API method...")
		
		# First, verify our admin token is valid
		token_check = self.verify_admin_token()
		if not token_check.get("valid"):
			print(f"  -> CRITICAL: Admin token verification failed!")
			return {
				"success": False, 
				"message": f"Admin token is invalid: {token_check.get('error')}"
			}
		
		# Verify the user exists in Gitea
		user_check = self.get_user_by_username(username)
		if not user_check.get("exists"):
			print(f"  -> CRITICAL: User {username} does not exist in Gitea!")
			return {
				"success": False,
				"message": "User not found in Gitea. Create the user first."
			}
		
		if scopes is None:
			scopes = ["write:repository", "read:user"]
		
		url = f"{self.base_url}/api/v1/users/{username}/tokens"
		
		# Use Sudo mode: admin creates token on behalf of user
		# Documentation: https://docs.gitea.com/api/1.24/
		# Endpoint: POST /users/{username}/tokens requires Sudo header
		headers = self.headers.copy()
		# headers["Sudo"] = username
		
		payload = {"name": token_name, "scopes": scopes}

		print(f"[GiteaAdminService] create_or_get_user_token (API): POST /api/v1/users/{username}/tokens")
		print(f"  token_name={token_name}")
		print(f"  scopes={scopes}")
		print(f"  url={url}")
		print(f"  Authorization header: {headers['Authorization'][:20]}...")
		# print(f"  Sudo header: {headers['Sudo']}")
		print(f"  payload={payload}")

		try:
			resp = requests.get(
				url, 
				headers=headers, 
				json=payload, 
				timeout=10
			)
			
			print(f"  -> status={resp.status_code}")
			
			if resp.status_code in (200, 201):
				token_data = resp.json()
				print(f"  -> token created successfully")
				print(f"  -> token_id={token_data.get('id')}")
				print(f"  -> token_name={token_data.get('name')}")
				return {"success": True, "token": token_data}
			elif resp.status_code == 404:
				print(f"  -> error: User not found in Gitea")
				return {"success": False, "message": "User not found in Gitea"}
			elif resp.status_code == 422:
				print(f"  -> error: Token name already exists")
				return {"success": False, "message": "Token name already exists"}
			elif resp.status_code in (401, 403):
				print(f"  -> error: Admin authentication failed")
				print(f"  -> Response: {resp.text[:200]}")
				return {"success": False, "message": "Admin authentication failed"}
			else:
				print(f"  -> error: {resp.text[:200]}")
				return {"success": False, "message": f"Gitea API error: {resp.text}"}
		except requests.Timeout:
			print(f"  -> timeout error")
			return {"success": False, "status": 504, "message": "Gitea API timeout"}
		except requests.RequestException as e:
			print(f"  -> network error: {e}")
			return {"success": False, "status": 0, "message": f"Network error: {e}"}
		except Exception as e:
			print(f"  -> unexpected error: {e}")
			import traceback
			traceback.print_exc()
			return {"success": False, "status": 500, "message": f"Unexpected error: {e}"}

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

