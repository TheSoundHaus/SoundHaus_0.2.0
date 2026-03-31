/**
 * Gitea Utility Functions
 * Pure utility functions for Gitea-related operations
 * No API calls - those belong in gitea.service.ts
 */

// Types are used in function comments but not in runtime code
// import { GiteaCredentials } from '../services/gitea.service'

/**
 * Formats a clone URL with embedded credentials
 * Used for git clone operations that need authentication
 *
 * @param repoName - Name of the repository
 * @param gitea_url - Base Gitea URL (e.g., https://gitea.soundhaus.com)
 * @param username - Gitea username
 * @param token - Gitea access token
 * @returns Authenticated clone URL (e.g., https://user:token@gitea.com/user/repo.git)
 */
export function formatAuthenticatedCloneURL(
  repoName: string,
  gitea_url: string,
  username: string,
  token: string
): string {
  try {
    const url = new URL(gitea_url)
    url.username = username
    url.password = token
    url.pathname = `/${username}/${repoName}.git`
    return url.toString()
  } catch (error) {
    console.error('Invalid Gitea URL:', gitea_url)
    // Fallback to manual construction
    return `https://${username}:${token}@${gitea_url.replace(/^https?:\/\//, '')}/${username}/${repoName}.git`
  }
}

/**
 * Formats a public clone URL (without credentials)
 * Safe to display in UI
 *
 * @param repoName - Name of the repository
 * @param gitea_url - Base Gitea URL
 * @param username - Gitea username
 * @returns Public clone URL (e.g., https://gitea.com/user/repo.git)
 */
export function formatPublicCloneURL(
  repoName: string,
  gitea_url: string,
  username: string
): string {
  const cleanUrl = gitea_url.replace(/\/$/, '') // Remove trailing slash
  return `${cleanUrl}/${username}/${repoName}.git`
}

/**
 * Formats a repository web URL (for viewing in browser)
 *
 * @param repoName - Name of the repository
 * @param gitea_url - Base Gitea URL
 * @param username - Gitea username
 * @returns Web URL (e.g., https://gitea.com/user/repo)
 */
export function formatRepoWebURL(
  repoName: string,
  gitea_url: string,
  username: string
): string {
  const cleanUrl = gitea_url.replace(/\/$/, '')
  return `${cleanUrl}/${username}/${repoName}`
}

/**
 * Masks a Gitea token for safe display
 * Shows first 8 and last 4 characters
 *
 * @param token - Full Gitea token
 * @returns Masked token (e.g., "gt_abc12...xyz9")
 */
export function maskToken(token: string): string {
  if (!token || token.length < 16) return '***'
  const start = token.slice(0, 8)
  const end = token.slice(-4)
  return `${start}...${end}`
}

/**
 * Parses a git clone URL to extract repository information
 *
 * @param cloneUrl - Git clone URL (e.g., https://gitea.com/user/repo.git)
 * @returns Object with username and repoName, or null if invalid
 */
export function parseCloneURL(cloneUrl: string): { username: string; repoName: string } | null {
  try {
    const url = new URL(cloneUrl)
    const pathParts = url.pathname.split('/').filter(Boolean)

    if (pathParts.length >= 2 && pathParts[0] && pathParts[1]) {
      const username = pathParts[0]
      const repoName = pathParts[1].replace(/\.git$/, '')
      return { username, repoName }
    }

    return null
  } catch (error) {
    return null
  }
}

/**
 * Validates if a string looks like a valid Gitea token
 *
 * @param token - Token to validate
 * @returns true if token format is valid
 */
export function isValidGiteaToken(token: string): boolean {
  // Gitea tokens are typically 40+ characters
  // They may start with prefixes like "gt_" or be raw SHA1 hashes
  if (!token || token.length < 40) return false

  // Check for valid characters (alphanumeric and underscore)
  const validPattern = /^[a-zA-Z0-9_-]+$/
  return validPattern.test(token)
}

/**
 * Copies text to clipboard (useful for clone URLs and tokens)
 *
 * @param text - Text to copy
 * @returns Promise that resolves when copy succeeds
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch (error) {
    // Fallback for older browsers
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.opacity = '0'
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
  }
}

/**
 * Generates git clone command string for copying
 *
 * @param cloneUrl - Authenticated or public clone URL
 * @returns Full git clone command
 */
export function generateCloneCommand(cloneUrl: string): string {
  return `git clone ${cloneUrl}`
}
