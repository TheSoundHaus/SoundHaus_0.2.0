"use server"

import { authenticatedFetch } from "@/lib/utils/authUtil"

/**
 * Server Action: Fetch Gitea credentials
 * This runs on the server and can access httpOnly cookies
 */
export async function fetchGiteaCredentials() {
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
    return data
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error fetching Gitea credentials'
    }
  }
}
