// Project/Repository types
export interface Project {
  name: string
  path: string
  lastOpened?: Date
}

export interface RepoVersion {
  repoPath: string
  version: string
}

// ALS (Ableton Live Set) types
export interface AlsMetadata {
  version?: string
  creator?: string
  tempo?: number
  tracks?: {
    midi: number
    audio: number
    return: number
  }
  samples?: Array<{
    path: string
    count: number
  }>
}

// Git types
export interface GitStatus {
  raw: string
  modified: string[]
  added: string[]
  deleted: string[]
  untracked: string[]
  hasChanges: boolean
}

// Electron API types
export interface ElectronAPI {
  chooseFolder: () => Promise<string | null>
  chooseFile: () => Promise<string | null>
  cloneRepo: (url: string, path: string) => void
  getStatus: (path: string) => Promise<string>
  pullRepo: (path: string) => Promise<string>
  pushRepo: (path: string) => Promise<string>
  getAlsContent: (path: string) => Promise<AlsMetadata | null>
  findAls: (path: string) => Promise<string | null>
  openExternal: (url: string) => void
  onOpenProject: (callback: (projectPath: string) => void) => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
