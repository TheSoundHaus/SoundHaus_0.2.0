"use server"

/**
 * Gitea Service - API integration for Gitea credentials and git operations
 * Server actions for Gitea operations
 */

import { authenticatedFetch } from "@/lib/utils/authUtil"

export interface GiteaCredentials {
  success: boolean
  gitea_url: string
  username: string
  token: string
  clone_url_format: string
}

export interface GiteaError {
  success: false
  error: string
}

/**
 * Server Action: Fetch Gitea credentials
 * This runs on the server and can access httpOnly cookies
 * Calls the /api/desktop/credentials endpoint which works for both web and desktop
 *
 * @returns Promise with Gitea credentials or error
 */
export async function getGiteaCredentials(): Promise<GiteaCredentials | GiteaError> {
  try {
    const response = await authenticatedFetch('/api/desktop/credentials')

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: errorData.detail || `HTTP ${response.status}: ${response.statusText}`
      }
    }

    const data = await response.json()
    return data as GiteaCredentials
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error fetching Gitea credentials'
    }
  }
}

/**
 * NOTE: Utility functions for formatting clone URLs have been moved to:
 * @/lib/utils/giteaUtil
 *
 * Use these functions from giteaUtil instead:
 * - formatAuthenticatedCloneURL()
 * - formatPublicCloneURL()
 * - formatRepoWebURL()
 * - maskToken()
 * - parseCloneURL()
 * - isValidGiteaToken()
 * - copyToClipboard()
 * - generateCloneCommand()
 */
