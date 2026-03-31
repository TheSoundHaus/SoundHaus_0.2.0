/**
 * Repository API Layer
 * Makes authenticated HTTP requests to FastAPI backend for repository operations
 */

import { authenticatedFetch } from "@/lib/utils/auth";
import type { ApiResponse, EnrichedRepo, GiteaRepo, SearchReposResponse } from "@/lib/types/api";

/**
 * Get all repositories for the authenticated user (enriched with SoundHaus data)
 * Backend endpoint: GET /repos/enriched
 */
export async function getEnrichedRepos(): Promise<ApiResponse<EnrichedRepo[]>> {
  try {
    const response = await authenticatedFetch('/repos/enriched');

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.detail || errorData.message || `Failed to fetch repositories: ${response.statusText}`,
      };
    }

    const data = await response.json();
    return { success: true, data: data.repos || [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Search public repositories
 * Backend endpoint: GET /repos/search
 */
export async function searchPublicRepos(
  query: string,
  sort: string = "stars",
  limit: number = 20,
  offset: number = 0,
): Promise<ApiResponse<SearchReposResponse>> {
  try {
    const params = new URLSearchParams({
      q: query,
      sort,
      limit: String(limit),
      offset: String(offset),
    });
    const response = await authenticatedFetch(`/repos/search?${params}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.detail || errorData.message || `Search failed: ${response.statusText}`,
      };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Create a new repository
 * Backend endpoint: POST /repos
 */
export async function createRepo(
  name: string,
  isPrivate: boolean,
  description: string
): Promise<ApiResponse<GiteaRepo>> {
  try {
    const response = await authenticatedFetch('/repos', {
      method: 'POST',
      body: JSON.stringify({
        name,
        private: isPrivate,
        description,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.detail || errorData.message || 'Failed to create repository',
      };
    }

    const data = await response.json();
    return { success: true, data: data.repo || data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Star a repository
 * Backend endpoint: POST /repos/{owner}/{repo}/star
 */
export async function starRepo(
  owner: string,
  repo: string
): Promise<ApiResponse<void>> {
  try {
    const response = await authenticatedFetch(`/repos/${owner}/${repo}/star`, {
      method: 'POST',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.detail || errorData.message || 'Failed to star repository',
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Unstar a repository
 * Backend endpoint: DELETE /repos/{owner}/{repo}/star
 */
export async function unstarRepo(
  owner: string,
  repo: string
): Promise<ApiResponse<void>> {
  try {
    const response = await authenticatedFetch(`/repos/${owner}/${repo}/star`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.detail || errorData.message || 'Failed to unstar repository',
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Delete a repository
 * Backend endpoint: DELETE /repos/{owner}/{repo}
 */
export async function deleteRepo(
  owner: string,
  repo: string
): Promise<ApiResponse<void>> {
  try {
    const response = await authenticatedFetch(`/repos/${owner}/${repo}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.detail || errorData.message || 'Failed to delete repository',
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Rename a repository
 * Backend endpoint: PATCH /repos/{owner}/{repo}
 */
export async function renameRepo(
  owner: string,
  repo: string,
  newName: string
): Promise<ApiResponse<void>> {
  try {
    const response = await authenticatedFetch(`/repos/${owner}/${repo}`, {
      method: 'PATCH',
      body: JSON.stringify({ new_name: newName }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.detail || errorData.message || 'Failed to rename repository',
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Update repository description
 * Backend endpoint: PATCH /repos/{owner}/{repo}
 */
export async function updateRepoDescription(
  owner: string,
  repo: string,
  description: string
): Promise<ApiResponse<void>> {
  try {
    const response = await authenticatedFetch(`/repos/${owner}/${repo}`, {
      method: 'PATCH',
      body: JSON.stringify({ description }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.detail || errorData.message || 'Failed to update repository description',
      };
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}
