import type { AlsMetadata } from '../types'

/**
 * Type-safe wrapper for Electron IPC calls
 * Falls back to safe defaults when running outside Electron (for testing)
 */
export const electronAPI = {
  /**
   * Check if running in Electron environment
   */
  isElectron: (): boolean => {
    return typeof window !== 'undefined' && !!window.electronAPI
  },

  /**
   * Open native folder picker dialog
   * @returns Selected folder path or null if cancelled
   */
  chooseFolder: (): Promise<string | null> => {
    if (!window.electronAPI) {
      console.warn('electronAPI not available')
      return Promise.resolve(null)
    }
    return window.electronAPI.chooseFolder()
  },

  /**
   * Open native file picker dialog
   * @returns Selected file path or null if cancelled
   */
  chooseFile: (): Promise<string | null> => {
    if (!window.electronAPI) {
      console.warn('electronAPI not available')
      return Promise.resolve(null)
    }
    return window.electronAPI.chooseFile()
  },

  /**
   * Clone a git repository
   * @param url Repository URL
   * @param path Local destination path
   */
  cloneRepo: (url: string, path: string): void => {
    if (!window.electronAPI) {
      console.warn('electronAPI not available')
      return
    }
    window.electronAPI.cloneRepo(url, path)
  },

  /**
   * Get git status for a repository
   * @param repoPath Path to the repository
   * @returns Git status output (porcelain format)
   */
  getStatus: (repoPath: string): Promise<string> => {
    if (!window.electronAPI) {
      console.warn('electronAPI not available')
      return Promise.resolve('')
    }
    return window.electronAPI.getStatus(repoPath)
  },

  /**
   * Pull changes from remote repository
   * @param repoPath Path to the repository
   * @returns Git pull output
   */
  pullRepo: (repoPath: string): Promise<string> => {
    if (!window.electronAPI) {
      console.warn('electronAPI not available')
      return Promise.resolve('')
    }
    return window.electronAPI.pullRepo(repoPath)
  },

  /**
   * Push changes to remote repository
   * Auto-commits with generic message before pushing
   * @param repoPath Path to the repository
   * @returns Git push output
   */
  pushRepo: (repoPath: string): Promise<string> => {
    if (!window.electronAPI) {
      console.warn('electronAPI not available')
      return Promise.resolve('')
    }
    return window.electronAPI.pushRepo(repoPath)
  },

  /**
   * Parse Ableton Live Set (.als) file
   * @param alsPath Path to .als file
   * @returns Parsed metadata or null if parsing failed
   */
  getAlsContent: (alsPath: string): Promise<AlsMetadata | null> => {
    if (!window.electronAPI) {
      console.warn('electronAPI not available')
      return Promise.resolve(null)
    }
    return window.electronAPI.getAlsContent(alsPath)
  },

  /**
   * Find .als file in a folder
   * @param folderPath Path to search
   * @returns Path to .als file or null if not found
   */
  findAls: (folderPath: string): Promise<string | null> => {
    if (!window.electronAPI) {
      console.warn('electronAPI not available')
      return Promise.resolve(null)
    }
    return window.electronAPI.findAls(folderPath)
  },

  /**
   * Open URL in system default browser
   * @param url URL to open
   */
  openExternal: (url: string): void => {
    if (!window.electronAPI) {
      console.warn('electronAPI not available')
      // Fallback to window.open in browser
      if (typeof window !== 'undefined') {
        window.open(url, '_blank')
      }
      return
    }
    window.electronAPI.openExternal(url)
  },

  /**
   * Listen for open-project events from popup windows
   * @param callback Function to call when project is opened
   */
  onOpenProject: (callback: (projectPath: string) => void): void => {
    if (!window.electronAPI) {
      console.warn('electronAPI not available')
      return
    }
    window.electronAPI.onOpenProject(callback)
  }
}

export default electronAPI
