"""
Gitea Admin Service
Provides admin-level operations against a Gitea server, such as creating users.

Requirements:
- Environment variables:
  - GITEA_URL: Base URL to the Gitea instance, e.g. http://gitea:3000 or http://localhost:3000
  - GITEA_ADMIN_TOKEN (preferred) or GITEA_TOKEN: Personal access token with admin permissions
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

import requests

class GiteaAdminService:
	"""Service wrapper for Gitea admin endpoints."""

	def __init__(self, base_url: Optional[str] = None, admin_token: Optional[str] = None) -> None:
		self.base_url = (base_url or os.getenv("GITEA_URL", "")).rstrip("/")
		self.token = admin_token or os.getenv("GITEA_ADMIN_TOKEN")

		# Debug (non-sensitive)
		print("[GiteaAdminService] Init:")
		print(f"  base_url = {self.base_url or '<unset>'}")
		print(f"  admin_token_present = {bool(self.token)}")

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
		send_notify: bool = False,
		must_change_password: bool = False,
		restricted: Optional[bool] = None,
		visibility: Optional[str] = None,
	) -> Dict[str, Any]:
		
		payload: Dict[str, Any] = {
			"username": username,
			"email": email,
			"password": password,
			"send_notify": send_notify,
			"must_change_password": must_change_password,
		}

		if restricted is not None:
			payload["restricted"] = restricted
		if visibility:
			payload["visibility"] = visibility

		print("[GiteaAdminService] create_user: POST /api/v1/admin/users")
		print(f"  username={payload.get('username')} email={payload.get('email')} full_name={payload.get('full_name')}")
		print(f"  send_notify={send_notify} must_change_password={must_change_password}")
		try:
			resp = requests.post(self._url("/api/v1/admin/users"), json=payload, headers=self.headers, timeout=15)
			if resp.status_code in (200, 201):
				print(f"  -> status={resp.status_code} (created)")
				return {
					"success": True,
					"status": resp.status_code,
					"data": resp.json(),
					"message": "User created successfully",
				}

			# Common error handling
			msg = "Failed to create user"
			try:
				detail = resp.json()
				if isinstance(detail, dict):
					msg = detail.get("message") or detail.get("error") or msg
			except Exception:
				# response may not be JSON
				pass
			print(f"  -> status={resp.status_code} msg={msg}")

			return {
				"success": False,
				"status": resp.status_code,
				"data": None,
				"message": msg,
			}
		except requests.RequestException as e:
			print(f"  -> network error: {e}")
			return {
				"success": False,
				"status": 0,
				"data": None,
				"message": f"Network error creating user: {e}",
			}

	def get_user(self, username: str) -> Dict[str, Any]:
		"""Fetch a user's details via the admin API.

		GET /api/v1/admin/users/{username}
		"""
		print(f"[GiteaAdminService] get_user: GET /api/v1/admin/users/{username}")
		try:
			resp = requests.get(self._url(f"/api/v1/admin/users/{username}"), headers=self.headers, timeout=10)
			if resp.status_code == 200:
				print("  -> status=200 (ok)")
				return {"success": True, "status": 200, "data": resp.json()}

			msg = "Failed to get user"
			try:
				detail = resp.json()
				if isinstance(detail, dict):
					msg = detail.get("message") or detail.get("error") or msg
			except Exception:
				pass
			print(f"  -> status={resp.status_code} msg={msg}")

			return {"success": False, "status": resp.status_code, "data": None, "message": msg}
		except requests.RequestException as e:
			print(f"  -> network error: {e}")
			return {"success": False, "status": 0, "data": None, "message": f"Network error: {e}"}
