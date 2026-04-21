// ─────────────────────────────────────────────────────────────────────────────
// BASE API WRAPPER
// Used as the return type of every function in lib/api/
// ─────────────────────────────────────────────────────────────────────────────

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─────────────────────────────────────────────────────────────────────────────
// GENRES
// Matches GET /genres → { success, genres: Genre[] }
// ─────────────────────────────────────────────────────────────────────────────

export interface Genre {
  genre_id: number;
  genre_name: string;
  genre_color: string | null;   // hex color, e.g. "#FF5733"
  genre_icon: string | null;    // icon identifier string
}

// ─────────────────────────────────────────────────────────────────────────────
// SNIPPET
// Matches GET /repos/{owner}/{repo}/snippet/metadata → { success, repo_id, snippet }
// Matches POST /repos/{owner}/{repo}/snippet → { success, url, metadata }
// ─────────────────────────────────────────────────────────────────────────────

export interface SnippetMetadata {
  duration: number | null;       // seconds
  file_size: number | null;      // bytes
  format: string | null;         // e.g. "mp3", "wav"
  sample_rate: number | null;    // e.g. 44100
  channels: number | null;       // 1 = mono, 2 = stereo
}

export interface Snippet extends SnippetMetadata {
  url: string;                   // CDN URL to play the audio
}

// ─────────────────────────────────────────────────────────────────────────────
// REPOS
// Two shapes exist:
//   GiteaRepo   — raw Gitea object, returned by GET /repos (my repos)
//   PublicRepo  — SoundHaus-enriched object, returned by GET /repos/public
// ─────────────────────────────────────────────────────────────────────────────

// Raw Gitea repo object (from GET /repos)
// Gitea's full API object — only the fields we actually use
export interface GiteaRepo {
  id: number;
  name: string;                  // repo name only, e.g. "my-beats"
  full_name: string;             // "owner/repo-name"
  description: string;
  private: boolean;
  empty: boolean;
  owner: {
    login: string;
    avatar_url: string;
  };
  html_url: string;              // Gitea web URL
  clone_url: string;             // HTTPS clone URL
  ssh_url: string;
  default_branch: string;
  created_at: string;            // ISO timestamp
  updated_at: string;            // ISO timestamp
  stars_count: number;
  forks_count: number;
  watchers_count: number;
}

// SoundHaus-enriched public repo (from GET /repos/public)
export interface PublicRepo {
  gitea_id: string;              // "owner/repo-name"
  owner: string;                 // Supabase UUID (used in API routes)
  owner_username?: string;       // Human-readable SoundHaus username
  repo_name: string;
  is_public: boolean;
  clone_count: number;
  clone_url: string;
  audio_snippet: string | null;  // CDN URL to audio file, null if no snippet
  snippet_metadata: SnippetMetadata | null;
  genres: string[];              // array of genre name strings
  thumbnail_url: string | null;
  thumbnail_type: "image" | "youtube" | null;
  // Optionally populated from Gitea (may be missing if Gitea unreachable)
  description?: string;
  stars?: number;
  updated_at?: string;
}

// Minimal genre ref used in repo stats
export interface GenreRef {
  genre_id: number;
  genre_name: string;
}

// Recent clone entry used in repo stats
export interface RecentClone {
  user_id: string;
  /** Resolved SoundHaus username when available (never a raw UUID for display). */
  username?: string | null;
  cloned_at: string;             // ISO timestamp string
}

// GET /repos/{owner}/{repo}/stats
export interface RepoStats {
  success: boolean;
  gitea_id: string;              // "owner/repo-name"
  owner_id?: string;             // Supabase UUID of the repo owner
  owner_username?: string;       // Human-readable SoundHaus username
  description: string;           // Gitea repo description
  private: boolean;              // Gitea repo visibility
  clone_url: string;
  clone_count: number;
  audio_snippet: string | null;
  thumbnail_url: string | null;
  thumbnail_type: "image" | "youtube" | null;
  forked_from: string | null;    // Source repo gitea_id if this is a fork
  open_to_collab: boolean;        // Whether repo accepts collaboration requests
  /** Present when stats were loaded with auth; user has Gitea clone access */
  viewer_can_clone?: boolean;
  /** User has a pending private-repo invite (not yet accepted) */
  viewer_pending_invite?: boolean;
  genres: GenreRef[];
  recent_clones: RecentClone[];
  fork_parent?: { owner: string; repo: string } | null;
}

// GET /repos/enriched – single-call aggregate of Gitea + SoundHaus metadata
export interface EnrichedRepo {
  id: number;
  name: string;                  // e.g. "my-beats"
  full_name: string;             // "owner/repo-name"
  description: string;
  private: boolean;
  owner_id: string;              // Gitea login (= Supabase UUID)
  owner_username: string;        // SoundHaus username (human-readable)
  created_at: string;            // ISO timestamp
  updated_at: string;            // ISO timestamp
  total_commits: number;
  stars_count: number;
  clone_count: number;
  clone_url: string;
  audio_snippet: string | null;  // CDN URL to audio file
  snippet_metadata: SnippetMetadata | null;
  genres: string[];              // array of genre name strings
  thumbnail_url: string | null;
  thumbnail_type: "image" | "youtube" | null;
  is_starred: boolean;
  role: "owner" | "collaborator"; // whether user owns or collaborates on the repo
}

// ─────────────────────────────────────────────────────────────────────────────
// INVITATIONS
// Matches GET /invitations/pending, POST /invitations/{id}/accept|decline
// ─────────────────────────────────────────────────────────────────────────────

export interface Invitation {
  id: string;
  repo_name: string;
  owner_username: string;
  owner_email: string;
  permission: string;
  created_at: string;            // ISO timestamp
  expires_at: string;            // ISO timestamp
}

// Owner-view invitation (from GET /repos/{repo_name}/invitations or GET /invitations/sent)
export interface SentInvitation {
  id: string;
  repo_name?: string;            // present in /invitations/sent
  invitee_email: string;
  permission: string;
  status: "pending" | "accepted" | "declined" | "expired";
  created_at: string;
  expires_at: string;
  responded_at: string | null;
}

// Enriched collaborator (from GET /repos/{owner}/{repo_name}/collaborators)
export interface Collaborator {
  login: string;       // Gitea login (Supabase UUID) — used for remove operations
  username: string;    // SoundHaus username (falls back to UUID if no profile)
  email: string;
  avatar_url: string;
  bio: string | null;
  permission: "admin" | "write" | "read";  // role on the project
}

// User search result (from GET /users/search)
export interface UserSearchResult {
  username: string;
  email: string;
  avatar_url: string;
  invite_email?: string;
}

// POST /repos/{owner}/{repo}/clone
export interface CloneResult {
  message: string;
  repo_id: string;
  total_clones: number;
  clone_url: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOKS / ACTIVITY
// Matches GET /api/webhooks/repo/{owner}/{repo}/activity
// Matches GET /api/webhooks/repo/{owner}/{repo}/events
// ─────────────────────────────────────────────────────────────────────────────

// A single push event (from /activity)
export interface PushActivity {
  id: number;
  ref: string;                   // branch ref, e.g. "refs/heads/main"
  before_sha: string | null;     // first 8 chars of previous commit SHA
  after_sha: string | null;      // first 8 chars of new commit SHA
  commit_count: number;
  commit_message?: string | null; // latest commit message from push
  pusher: string;                // Gitea username
  pusher_avatar?: string | null; // avatar URL from profile
  pushed_at: string | null;      // ISO timestamp string
}

// GET /api/webhooks/repo/{owner}/{repo}/activity response
export interface RepoActivity {
  repo: string;                  // "owner/repo-name"
  count: number;
  activity: PushActivity[];
}

// A single repository lifecycle event (from /events)
export interface RepoEvent {
  id: number | string;
  event_type: string;           // e.g. "branch_created", "tag_deleted", "collaborator_joined", "snippet_updated"
  actor: string;                // Gitea username of the actor
  actor_avatar?: string | null;  // avatar URL from profile
  detail?: string | null;       // extra context (invitation info, snippet version, etc.)
  occurred_at: string | null;   // ISO timestamp string
}

// GET /api/webhooks/repo/{owner}/{repo}/events response
export interface RepoEvents {
  repo: string;
  count: number;
  events: RepoEvent[];
}

// ─────────────────────────────────────────────────────────────────────────────
// STEMS
// Matches the stem separation pipeline (Demucs)
// ─────────────────────────────────────────────────────────────────────────────

export type StemJobStatus = "queued" | "processing" | "succeeded" | "failed";
export type StemType = "vocals" | "drums" | "bass" | "other";

/** Individual stem file returned by the API */
export interface StemFile {
  id: number;
  stem_type: StemType;
  public_url: string;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  format: string;
  created_at: string;
}

/** A single stem-generation run (SnippetVersion) */
export interface SnippetVersion {
  id: number;
  repo_gitea_id: string;
  source_upload_url: string;
  commit_sha: string | null;
  status: StemJobStatus;
  error_message: string | null;
  is_confirmed: boolean;
  created_at: string;
  demucs_model_version: string;
  stem_files: StemFile[];
}

/** POST /repos/{owner}/{repo}/stems/jobs — create job */
export interface StemJobStatusResponse {
  job_id: number;
  status: StemJobStatus;
  error_message: string | null;
  progress_percent: number | null;
}

/** GET /repos/{owner}/{repo}/stems/latest */
export interface StemsLatestResponse {
  snippet_version: SnippetVersion | null;
  has_stems: boolean;
}

