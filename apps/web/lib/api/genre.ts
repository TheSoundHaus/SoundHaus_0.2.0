/**
 * Genre API Layer
 * Makes authenticated HTTP requests to FastAPI backend for genre operations
 */

import { authenticatedFetch } from "@/lib/utils/auth";
import type { ApiResponse, Genre } from "@/lib/types/api";

/**
 * Get all available genres
 * Backend endpoint: GET /genres
 */
export async function getAllGenres(): Promise<ApiResponse<Genre[]>> {
  try {
    const response = await authenticatedFetch('/genres');

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.detail || errorData.message || `Failed to fetch genres: ${response.statusText}`,
      };
    }

    const data = await response.json();
    return { success: true, data: data.genres || [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Set genre associations for a repository
 * Replaces all existing genre assignments with the provided genre_ids
 * Backend endpoint: POST /repos/{owner}/{repo}/genres
 */
export async function setRepoGenre(
  owner: string,
  repo: string,
  genreIds: string[]
): Promise<ApiResponse<void>> {
  try {
    const response = await authenticatedFetch(`/repos/${owner}/${repo}/genres`, {
      method: 'POST',
      body: JSON.stringify({ genre_ids: genreIds }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.detail || errorData.message || 'Failed to set repository genres',
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
