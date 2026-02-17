import type { Project } from '../types'

const RECENT_REPOS_KEY = 'soundhaus.recentRepos'
const REPO_VERSIONS_KEY = 'soundhaus.repoVersions'
const MAX_RECENT_REPOS = 8

/**
 * Service for localStorage operations
 * Manages recent projects and repository versions
 */
export const storageService = {
  /**
   * Get list of recent projects
   * @returns Array of projects, newest first
   */
  getRecentProjects(): Project[] {
    try {
      const stored = localStorage.getItem(RECENT_REPOS_KEY)
      if (!stored) return []

      const repos = JSON.parse(stored)
      return Array.isArray(repos) ? repos : []
    } catch (error) {
      console.error('Error loading recent projects:', error)
      return []
    }
  },

  /**
   * Add project to recent list
   * Adds to beginning and removes duplicates
   * @param project Project to add
   */
  addRecentProject(project: Project): void {
    try {
      const recent = this.getRecentProjects()

      // Remove existing entry if present
      const filtered = recent.filter(p => p.path !== project.path)

      // Add to beginning
      const updated = [project, ...filtered].slice(0, MAX_RECENT_REPOS)

      localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(updated))
    } catch (error) {
      console.error('Error saving recent project:', error)
    }
  },

  /**
   * Remove project from recent list
   * @param projectPath Path of project to remove
   */
  removeRecentProject(projectPath: string): void {
    try {
      const recent = this.getRecentProjects()
      const filtered = recent.filter(p => p.path !== projectPath)
      localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(filtered))
    } catch (error) {
      console.error('Error removing recent project:', error)
    }
  },

  /**
   * Clear all recent projects
   */
  clearRecentProjects(): void {
    try {
      localStorage.removeItem(RECENT_REPOS_KEY)
    } catch (error) {
      console.error('Error clearing recent projects:', error)
    }
  },

  /**
   * Get version for a repository
   * @param repoPath Repository path
   * @returns Version string or default '1.0'
   */
  getRepoVersion(repoPath: string): string {
    try {
      const stored = localStorage.getItem(REPO_VERSIONS_KEY)
      if (!stored) return '1.0'

      const versions = JSON.parse(stored)
      return versions[repoPath] || '1.0'
    } catch (error) {
      console.error('Error loading repo version:', error)
      return '1.0'
    }
  },

  /**
   * Set version for a repository
   * @param repoPath Repository path
   * @param version Version string
   */
  setRepoVersion(repoPath: string, version: string): void {
    try {
      const stored = localStorage.getItem(REPO_VERSIONS_KEY)
      const versions = stored ? JSON.parse(stored) : {}

      versions[repoPath] = version

      localStorage.setItem(REPO_VERSIONS_KEY, JSON.stringify(versions))
    } catch (error) {
      console.error('Error saving repo version:', error)
    }
  },

  /**
   * Get all available versions
   * @returns Array of version strings
   */
  getAvailableVersions(): string[] {
    return ['1.0', '1.1', '2.0']
  }
}

export default storageService
