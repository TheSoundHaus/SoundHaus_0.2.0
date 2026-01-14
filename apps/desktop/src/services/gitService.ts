import electronAPI from './electronAPI'
import type { GitStatus } from '../types'

/**
 * Service for git operations
 * Wraps electron IPC calls with business logic
 */
export const gitService = {
  /**
   * Get formatted git status
   * @param repoPath Path to repository
   * @returns Parsed git status object
   */
  async getStatus(repoPath: string): Promise<GitStatus> {
    const raw = await electronAPI.getStatus(repoPath)

    const modified: string[] = []
    const added: string[] = []
    const deleted: string[] = []
    const untracked: string[] = []

    // Parse porcelain format
    // Format: XY filename
    // X = index status, Y = working tree status
    const lines = raw.split('\n').filter(line => line.trim())

    for (const line of lines) {
      if (line.length < 3) continue

      const status = line.substring(0, 2)
      const filename = line.substring(3)

      // Index status (first char)
      if (status[0] === 'M') {
        modified.push(filename)
      } else if (status[0] === 'A') {
        added.push(filename)
      } else if (status[0] === 'D') {
        deleted.push(filename)
      }

      // Working tree status (second char)
      if (status[1] === 'M' && !modified.includes(filename)) {
        modified.push(filename)
      } else if (status[1] === 'D' && !deleted.includes(filename)) {
        deleted.push(filename)
      }

      // Untracked files
      if (status === '??') {
        untracked.push(filename)
      }
    }

    const hasChanges = modified.length > 0 ||
                       added.length > 0 ||
                       deleted.length > 0 ||
                       untracked.length > 0

    return {
      raw,
      modified,
      added,
      deleted,
      untracked,
      hasChanges
    }
  },

  /**
   * Pull changes from remote
   * @param repoPath Path to repository
   * @returns Pull output message
   */
  async pull(repoPath: string): Promise<string> {
    return await electronAPI.pullRepo(repoPath)
  },

  /**
   * Push changes to remote (auto-commits first)
   * @param repoPath Path to repository
   * @returns Push output message
   */
  async push(repoPath: string): Promise<string> {
    return await electronAPI.pushRepo(repoPath)
  },

  /**
   * Clone a repository
   * @param url Repository URL
   * @param localPath Local destination path
   */
  clone(url: string, localPath: string): void {
    electronAPI.cloneRepo(url, localPath)
  },

  /**
   * Format git status for display
   * @param status Git status object
   * @returns Formatted string
   */
  formatStatus(status: GitStatus): string {
    const parts: string[] = []

    if (status.modified.length > 0) {
      parts.push(`Modified: ${status.modified.length}`)
    }
    if (status.added.length > 0) {
      parts.push(`Added: ${status.added.length}`)
    }
    if (status.deleted.length > 0) {
      parts.push(`Deleted: ${status.deleted.length}`)
    }
    if (status.untracked.length > 0) {
      parts.push(`Untracked: ${status.untracked.length}`)
    }

    return parts.length > 0 ? parts.join(' • ') : 'No changes'
  }
}

export default gitService
