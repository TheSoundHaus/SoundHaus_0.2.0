// ============================================================================
// GENRE MODELS
// ============================================================================

/**
 * Genre from the master genre list (genre_list table)
 * Matches backend GenreList model
 */
export interface Genre {
  genre_id: number
  genre_name: string
}

// ============================================================================
// LEGACY/SIMPLE REPO TYPE (used by RepoList/RepoCard components)
// ============================================================================

/**
 * Audio snippet for individual repo view
 */
export interface AudioSnippet {
  id: string
  title: string
  src: string
}

/**
 * Simple repo type for UI components
 * Used by RepoList and RepoCard for basic display
 */
export interface Repo {
  id: string                    // Unique identifier (gitea_id)
  name: string                  // Display name
  description?: string | null   // Optional description
  owner?: string                // Owner username
  genres?: Genre[]              // Optional genres for detail view
  snippets?: AudioSnippet[]     // Optional audio snippets for detail view
}


// ============================================================================
// REPOSITORY MODELS
// ============================================================================

/**
 * Repository data from PostgreSQL (repo_data table)
 * This is what's stored in YOUR database, not Gitea
 */
export interface RepoData {
  gitea_id: string              // Primary key: "owner/repo-name"
  audio_snippet: string | null  // DigitalOcean Spaces URL
  clone_count: number           // Total unique cloners
  genres: Genre[]               // Assigned genres (from many-to-many)
}

/**
 * Repository from Gitea API
 * This is what Gitea returns when you query repos
 */
export interface GiteaRepo {
  id: number
  name: string
  full_name: string             // "owner/repo-name"
  description: string | null
  clone_url: string
  owner: {
    username: string
  }
  private: boolean
}

/**
 * Public repository for Explore page
 * Combines RepoData + parsed info for display
 */
export interface PublicRepo {
  gitea_id: string              // "owner/repo-name"
  owner: string                 // Parsed from gitea_id
  name: string                  // Parsed from gitea_id
  description?: string          // Optional (fetch from Gitea or store separately)
  audio_snippet: string         // Required for public repos
  clone_count: number
  genres: Genre[]
  clone_url: string             // For cloning
}

export interface MyRepoView {
  // From Gitea
  gitea_id: string
  name: string
  description: string | null
  clone_url: string
  created_at: string
  
  // From repo_data (may be null if not published)
  published: boolean
  audio_snippet?: string
  clone_count?: number
  genres?: Genre[]
}

// ============================================================================
// CLONE EVENT MODELS
// ============================================================================

/**
 * Clone event from database (clone_events table)
 * Tracks individual clone actions
 */
export interface CloneEvent {
  id: number
  repo_id: string               // Foreign key to repo_data.gitea_id
  user_id: string               // Supabase user UUID
  cloned_at: string             // ISO timestamp
}

/**
 * Response from POST /repos/{owner}/{repo}/clone endpoint
 */
export interface CloneResponse {
  success: boolean
  first_time_clone: boolean     // True if this is user's first clone of this repo
  clone_url: string             // Git URL to clone from
  message?: string              // Optional error/info message
}

/**
 * Repository statistics (from GET /repos/{owner}/{repo}/stats)
 */
export interface RepoStats {
  gitea_id: string
  clone_count: number
  audio_snippet: string | null
  genres: Genre[]
  recent_clones: CloneEvent[]   // Last 10 clones
}