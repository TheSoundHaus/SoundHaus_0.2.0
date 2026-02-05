import os
import requests
import base64
from typing import Any, Dict, List, Optional
from services.gitea_service import GiteaAdminService
from sqlalchemy.orm import Session
from models.webhook_models import WebhookConfig

GITEA_URL = os.getenv("GITEA_URL", "").rstrip("/")
GITEA_ADMIN_TOKEN = os.getenv("GITEA_ADMIN_TOKEN") or os.getenv("GITEA_TOKEN")
WEBHOOK_BASE_URL = os.getenv("WEBHOOK_BASE_URL", "http://localhost:8000")
GITEA_WEBHOOK_SECRET = os.getenv("GITEA_WEBHOOK_SECRET", "")

class RepoService:
    def __init__(self, base_url: Optional[str] = None, admin_token: Optional[str] = None) -> None:
        self.base_url = (base_url or GITEA_URL).rstrip("/")
        self.token = admin_token or GITEA_ADMIN_TOKEN
        if not self.base_url:
            raise ValueError("GITEA_URL not configured")
        if not self.token:
            raise ValueError("GITEA_ADMIN_TOKEN (or GITEA_TOKEN) not configured")
        self.headers = {"Authorization": f"token {self.token}", "Content-Type": "application/json"}

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def list_user_repos(self, username: str) -> Dict[str, Any]:
        """List repositories for a specific user (includes private via admin token and repos where user is a collaborator)."""
        try:
            # Get owned repositories
            owned_resp = requests.get(self._url(f"/api/v1/users/{username}/repos"), headers=self.headers, timeout=15)
            print(f"[RepoService] list_user_repos (owned) GET {self._url(f'/api/v1/users/{username}/repos')} -> {owned_resp.status_code}")
            
            if owned_resp.status_code != 200:
                print(f"[RepoService] Failed to get owned repos: {self._extract_msg(owned_resp)}")
                return {"success": False, "status": owned_resp.status_code, "message": self._extract_msg(owned_resp)}
            
            owned_repos = owned_resp.json()
            print(f"[RepoService] Found {len(owned_repos)} owned repos")
            
            # Get all repositories where user is a collaborator
            # We need to search all repos and check collaboration status
            # Use the search endpoint with collaboration=true parameter
            collab_resp = requests.get(
                self._url(f"/api/v1/repos/search"),
                headers=self.headers,
                params={"uid": self._get_user_id(username), "collaboration": "true"},
                timeout=15
            )
            print(f"[RepoService] list_user_repos (collab) GET {self._url('/api/v1/repos/search')} -> {collab_resp.status_code}")
            
            collaborated_repos = []
            if collab_resp.status_code == 200:
                search_result = collab_resp.json()
                collaborated_repos = search_result.get("data", [])
                print(f"[RepoService] Found {len(collaborated_repos)} collaborated repos")
            else:
                print(f"[RepoService] Warning: Failed to get collaborated repos: {self._extract_msg(collab_resp)}")
            
            # Combine owned and collaborated repos, avoiding duplicates
            repo_ids = {repo["id"] for repo in owned_repos}
            all_repos = list(owned_repos)
            
            for repo in collaborated_repos:
                if repo["id"] not in repo_ids:
                    all_repos.append(repo)
                    repo_ids.add(repo["id"])
            
            print(f"[RepoService] Total repos (owned + collaborated): {len(all_repos)}")
            return {"success": True, "repos": all_repos}
            
        except requests.RequestException as e:
            print(f"[RepoService] Exception: {e}")
            return {"success": False, "status": 0, "message": f"Network error: {e}"}
    
    def _get_user_id(self, username: str) -> int:
        """Get the numeric user ID for a username."""
        try:
            resp = requests.get(self._url(f"/api/v1/users/{username}"), headers=self.headers, timeout=10)
            if resp.status_code == 200:
                user_data = resp.json()
                return user_data.get("id", 0)
            print(f"[RepoService] Failed to get user ID for {username}: {self._extract_msg(resp)}")
            return 0
        except requests.RequestException as e:
            print(f"[RepoService] Exception getting user ID: {e}")
            return 0

    def create_user_repo(self, username: str, name: str, db: Session, description: str = "", private: bool = True,) -> Dict[str, Any]:
        """Create a new repository owned by the specified user (admin operation)."""
        payload = {
            "name": name,
            "description": description,
            "private": private,
            "auto_init": True,
            "default_branch": "main",
        }
        try:
            resp = requests.post(self._url(f"/api/v1/admin/users/{username}/repos"), json=payload, headers=self.headers, timeout=20)
            if resp.status_code in (200, 201):
                repo_data = resp.json()
                # Initialize LFS with .gitattributes file
                self._init_lfs_for_repo(username, name)
                self._create_repo_webhook(username, name, db)
                return {"success": True, "repo": repo_data}
            return {"success": False, "status": resp.status_code, "message": self._extract_msg(resp)}
        except requests.RequestException as e:
            return {"success": False, "status": 0, "message": f"Network error: {e}"}
    def _create_repo_webhook(self, username: str, repo_name: str, db: Session):
            try:
                if not WEBHOOK_BASE_URL or not GITEA_WEBHOOK_SECRET:
                    print(f"[RepoService] skipping webhook creation")
                    return
                
            
                gitea_admin_service = GiteaAdminService(
                    base_url=self.base_url,
                    admin_token=self.token
                )

                webhook_url = f"{WEBHOOK_BASE_URL}/api/webhooks/gitea"
                webhook_result = gitea_admin_service.create_webhook(
                    owner=username, 
                    repo=repo_name, 
                    webhook_url=webhook_url,
                    secret=GITEA_WEBHOOK_SECRET,
                    events=["push", "create", "delete", "repository"]
                )
                
                if webhook_result.get("success"):
                    # Create webhook database entry
                    webhook_config = WebhookConfig(
                        repo_id=f"{username}/{repo_name}",
                        gitea_webhook_id=webhook_result.get("webhook_id"),
                        webhook_url=webhook_url,
                        webhook_secret=GITEA_WEBHOOK_SECRET,
                        is_active=True,
                        events=["push", "create", "delete", "repository"]
                    )
                    db.add(webhook_config)
                    db.commit()
                    print(f"[RepoService] Webhook saved to database for {username}/{repo_name}")
                else:
                    print(f"[RepoService] Webhook creation failed {webhook_result.get('message')}")

            except Exception as e:
                print(f"[RepoService] Failed to save webhook to database: {e}")
                db.rollback()

    def update_repo_settings(self, owner: str, repo_name: str, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Update repository settings (e.g., make public/private, change description)."""
        try:
            url_path = f"/api/v1/repos/{owner}/{repo_name}"
            resp = requests.patch(self._url(url_path), json=settings, headers=self.headers, timeout=20)
            
            print(f"[RepoService] update_repo_settings PATCH {self._url(url_path)} -> {resp.status_code}")
            
            if resp.status_code in (200, 204):
                return {"success": True, "repo": resp.json() if resp.status_code == 200 else {}}
            return {"success": False, "status": resp.status_code, "message": self._extract_msg(resp)}
        except requests.RequestException as e:
            print(f"[RepoService] Exception: {e}")
            return {"success": False, "status": 0, "message": f"Network error: {e}"}

    def _init_lfs_for_repo(self, username: str, repo_name: str) -> None:
        """Initialize Git LFS by creating .gitattributes file with common patterns."""
        print(f"[RepoService] Initializing LFS for {username}/{repo_name}")
        
        # Create .gitattributes with common LFS patterns for audio/media files
        lfs_config = """# Audio files (Ableton, samples, etc.)
*.mp3 filter=lfs diff=lfs merge=lfs -text
*.wav filter=lfs diff=lfs merge=lfs -text
*.flac filter=lfs diff=lfs merge=lfs -text
*.aac filter=lfs diff=lfs merge=lfs -text
*.ogg filter=lfs diff=lfs merge=lfs -text
*.m4a filter=lfs diff=lfs merge=lfs -text
*.aif filter=lfs diff=lfs merge=lfs -text
*.aiff filter=lfs diff=lfs merge=lfs -text

# Ableton Live Project files
*.als filter=lfs diff=lfs merge=lfs -text
*.alp filter=lfs diff=lfs merge=lfs -text

# Video files
*.mp4 filter=lfs diff=lfs merge=lfs -text
*.mov filter=lfs diff=lfs merge=lfs -text
*.avi filter=lfs diff=lfs merge=lfs -text

# Image files
*.psd filter=lfs diff=lfs merge=lfs -text
*.ai filter=lfs diff=lfs merge=lfs -text

# Archives
*.zip filter=lfs diff=lfs merge=lfs -text
*.rar filter=lfs diff=lfs merge=lfs -text
*.7z filter=lfs diff=lfs merge=lfs -text
"""
        
        try:
            import base64
            content_base64 = base64.b64encode(lfs_config.encode('utf-8')).decode('utf-8')
            
            payload = {
                "content": content_base64,
                "message": "Initialize Git LFS with .gitattributes",
                "branch": "main",
            }
            
            url = self._url(f"/api/v1/repos/{username}/{repo_name}/contents/.gitattributes")
            resp = requests.post(url, json=payload, headers=self.headers, timeout=20)
            
            if resp.status_code in (200, 201):
                print(f"[RepoService] LFS initialized successfully")
            else:
                print(f"[RepoService] LFS init failed: {self._extract_msg(resp)}")
        except Exception as e:
            print(f"[RepoService] LFS init exception: {e}")

    def _is_lfs_file(self, path: str) -> bool:
        """Return True if the given file path matches common LFS-managed extensions."""
        if not path:
            return False
        lfs_exts = {
            'mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'aif', 'aiff',
            'als', 'alp', 'mp4', 'mov', 'avi', 'psd', 'ai',
            'zip', 'rar', '7z'
        }
        ext = os.path.splitext(path)[1].lstrip('.').lower()
        return ext in lfs_exts

    def get_repo_contents(self, username: str, repo_name: str, path: str = "") -> Dict[str, Any]:
        """Get contents of a repository at a specific path."""
        try:
            # Gitea API endpoint for repository contents
            url_path = f"/api/v1/repos/{username}/{repo_name}/contents"
            if path:
                url_path = f"{url_path}/{path}"

            resp = requests.get(self._url(url_path), headers=self.headers, timeout=15)
            print(f"[RepoService] get_repo_contents GET {self._url(url_path)} -> {resp.status_code}")

            if resp.status_code == 200:
                contents = resp.json()
                # Annotate files that match LFS patterns with an `lfs` boolean so
                # the frontend can display an "LFS" badge.
                if isinstance(contents, list):
                    for item in contents:
                        try:
                            name_or_path = (item.get('name') or item.get('path') or '')
                            if item.get('type') == 'file' and self._is_lfs_file(name_or_path):
                                item['lfs'] = True
                            else:
                                item['lfs'] = False
                        except Exception:
                            item['lfs'] = False
                elif isinstance(contents, dict):
                    try:
                        name_or_path = (contents.get('name') or contents.get('path') or '')
                        if contents.get('type') == 'file' and self._is_lfs_file(name_or_path):
                            contents['lfs'] = True
                            # For LFS files, try to get the actual content from the raw URL
                            # instead of the LFS pointer
                            if contents.get('download_url'):
                                print(f"[RepoService] Detected LFS file, fetching actual content from download_url")
                                lfs_content = self._fetch_lfs_content(username, repo_name, path)
                                if lfs_content is not None:
                                    contents['content'] = lfs_content
                                    contents['lfs_resolved'] = True
                        else:
                            contents['lfs'] = False
                    except Exception as e:
                        print(f"[RepoService] Error handling LFS: {e}")
                        contents['lfs'] = False

                print(f"[RepoService] Found {len(contents) if isinstance(contents, list) else 1} items")
                return {"success": True, "contents": contents}
            print(f"[RepoService] Failed: {self._extract_msg(resp)}")
            return {"success": False, "status": resp.status_code, "message": self._extract_msg(resp)}
        except requests.RequestException as e:
            print(f"[RepoService] Exception: {e}")
            return {"success": False, "status": 0, "message": f"Network error: {e}"}

    def _fetch_lfs_content(self, username: str, repo_name: str, path: str) -> Optional[str]:
        """Fetch actual LFS content for a file, returning base64-encoded content."""
        try:
            import base64
            # Use the raw endpoint which should return the actual LFS content
            raw_url = f"/api/v1/repos/{username}/{repo_name}/raw/{path}"
            resp = requests.get(self._url(raw_url), headers=self.headers, timeout=30)
            print(f"[RepoService] _fetch_lfs_content GET {self._url(raw_url)} -> {resp.status_code}")

            if resp.status_code == 200:
                # Encode the binary content to base64
                content_base64 = base64.b64encode(resp.content).decode('utf-8')
                print(f"[RepoService] Successfully fetched LFS content, size: {len(resp.content)} bytes")
                return content_base64
            else:
                print(f"[RepoService] Failed to fetch LFS content: {resp.status_code}")
                return None
        except Exception as e:
            print(f"[RepoService] Exception fetching LFS content: {e}")
            return None

    def upload_file(self, username: str, repo_name: str, file_path: str, content: str, message: str, branch: str = "main") -> Dict[str, Any]:
        """Upload or update a file in a repository."""
        try:
            # Gitea API endpoint for creating/updating files
            url_path = f"/api/v1/repos/{username}/{repo_name}/contents/{file_path}"
            
            # First, check if the file exists to get its SHA (required for updates)
            check_resp = requests.get(self._url(url_path), headers=self.headers, timeout=10, params={"ref": branch})
            file_sha = None
            if check_resp.status_code == 200:
                # File exists, get its SHA for update
                existing_file = check_resp.json()
                file_sha = existing_file.get("sha")
                print(f"[RepoService] File exists, will update with SHA: {file_sha[:8]}..." if file_sha else "[RepoService] File exists but no SHA found")
            
            # Encode content to base64
            content_base64 = base64.b64encode(content.encode('utf-8')).decode('utf-8')
            
            payload = {
                "content": content_base64,
                "message": message,
                "branch": branch,
            }
            
            # Include SHA if file exists (for update)
            if file_sha:
                payload["sha"] = file_sha
            
            # Use PUT for updates (when SHA exists), POST for new files
            if file_sha:
                resp = requests.put(self._url(url_path), json=payload, headers=self.headers, timeout=20)
                print(f"[RepoService] upload_file PUT {self._url(url_path)} -> {resp.status_code}")
            else:
                resp = requests.post(self._url(url_path), json=payload, headers=self.headers, timeout=20)
                print(f"[RepoService] upload_file POST {self._url(url_path)} -> {resp.status_code}")
            
            if resp.status_code in (200, 201):
                return {"success": True, "file": resp.json()}
            print(f"[RepoService] Failed: {self._extract_msg(resp)}")
            return {"success": False, "status": resp.status_code, "message": self._extract_msg(resp)}
        except requests.RequestException as e:
            print(f"[RepoService] Exception: {e}")
            return {"success": False, "status": 0, "message": f"Network error: {e}"}

    def delete_file(self, username: str, repo_name: str, file_path: str, message: str = "", branch: str = "main") -> Dict[str, Any]:
        """Delete a file from a repository."""
        try:
            # Gitea API endpoint for deleting files
            url_path = f"/api/v1/repos/{username}/{repo_name}/contents/{file_path}"
            
            # Get the file SHA first (required for deletion)
            resp = requests.get(self._url(url_path), headers=self.headers, timeout=15)
            if resp.status_code != 200:
                return {"success": False, "status": resp.status_code, "message": "File not found or cannot be accessed"}
            
            file_data = resp.json()
            sha = file_data.get("sha")
            
            if not sha:
                return {"success": False, "message": "Could not get file SHA"}
            
            # Delete the file
            payload = {
                "sha": sha,
                "message": message or f"Delete {file_path}",
                "branch": branch,
            }
            
            resp = requests.delete(self._url(url_path), json=payload, headers=self.headers, timeout=20)
            print(f"[RepoService] delete_file DELETE {self._url(url_path)} -> {resp.status_code}")
            
            if resp.status_code in (200, 204):
                return {"success": True, "message": "File deleted successfully"}
            print(f"[RepoService] Failed: {self._extract_msg(resp)}")
            return {"success": False, "status": resp.status_code, "message": self._extract_msg(resp)}
        except requests.RequestException as e:
            print(f"[RepoService] Exception: {e}")
            return {"success": False, "status": 0, "message": f"Network error: {e}"}

    @staticmethod
    def _extract_msg(resp: requests.Response) -> str:
        try:
            data = resp.json()
            if isinstance(data, dict) and "message" in data:
                return data["message"]
            return f"HTTP {resp.status_code}: {resp.reason}"
        except Exception:
            return f"HTTP {resp.status_code}: {resp.reason}"

    def list_collaborators(self, username: str, repo_name: str) -> Dict[str, Any]:
        """List all collaborators for a repository."""
        try:
            url_path = f"/api/v1/repos/{username}/{repo_name}/collaborators"
            resp = requests.get(self._url(url_path), headers=self.headers, timeout=15)
            
            print(f"[RepoService] list_collaborators GET {self._url(url_path)} -> {resp.status_code}")
            
            if resp.status_code != 200:
                return {"success": False, "status": resp.status_code}
            
            collaborators = resp.json()
            return {"success": True, "collaborators": collaborators}
        except requests.RequestException as e:
            print(f"[RepoService] Exception: {e}")
            return {"success": False, "message": str(e)}

    def add_collaborator(self, owner: str, repo_name: str, username: str, permission: str = "write") -> Dict[str, Any]:
        """Add a collaborator to a repository."""
        try:
            url_path = f"/api/v1/repos/{owner}/{repo_name}/collaborators/{username}"
            payload = {"permission": permission}  # read, write, admin
            
            resp = requests.put(
                self._url(url_path),
                headers=self.headers,
                json=payload,
                timeout=15
            )
            
            print(f"[RepoService] add_collaborator PUT {self._url(url_path)} -> {resp.status_code}")
            
            if resp.status_code not in [200, 201, 204]:
                return {"success": False, "status": resp.status_code, "message": resp.text}
            
            return {"success": True}
        except requests.RequestException as e:
            print(f"[RepoService] Exception: {e}")
            return {"success": False, "message": str(e)}

    def remove_collaborator(self, owner: str, repo_name: str, username: str) -> Dict[str, Any]:
        """Remove a collaborator from a repository."""
        try:
            url_path = f"/api/v1/repos/{owner}/{repo_name}/collaborators/{username}"
            resp = requests.delete(self._url(url_path), headers=self.headers, timeout=15)
            
            print(f"[RepoService] remove_collaborator DELETE {self._url(url_path)} -> {resp.status_code}")
            
            if resp.status_code not in [200, 204]:
                return {"success": False, "status": resp.status_code}
            
            return {"success": True}
        except requests.RequestException as e:
            print(f"[RepoService] Exception: {e}")
            return {"success": False, "message": str(e)}
