export interface ElectronAPI {
  chooseFolder: () => Promise<string | null>
  hasGitFile: (folderPath: string) => Promise<boolean>
  getAlsStruct: (alsPath: string) => Promise<any>
  findAls: (folderPath: string) => Promise<string | null>
  getAlsContent: (alsPath: string) => Promise<any>
  getChanges: (alsPath: string) => Promise<any>
}

export interface GitService {
  initRepo: (folderPath: string, projectInfo?: ProjectSetupData) => Promise<string>
  cloneRepo: (cloneUrl: string, destinationPath: string) => Promise<string>
  pullRepo: (repoPath: string) => Promise<string>
  commitChange: (repoPath: string) => Promise<string>
  pushRepo: (repoPath: string) => Promise<string>
}

export interface PatService {
  getSoundHausCredentials: () => Promise<string | null>
  setSoundHausCredentials: (token: string) => Promise<string>
  getGiteaCredentials: () => Promise<string | null>
  setGiteaCredentials: (token: string) => Promise<string>
  getAllowedCloneRemote: () => Promise<string | null>
  setAllowedCloneRemote: (remote: string) => Promise<string>
}

export interface GitFileChange {
  status: string
  file: string
}

export interface GitStatus {
  hasChanges: boolean
  changes: GitFileChange[]
}

export interface Project {
  path: string
  name: string
  lastOpened?: string
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

export interface ProjectSetupData {
  name: string
  description: string
  isPublic: boolean
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
    gitService?: GitService
    patService?: PatService
    electron?: {
      showProjectSetup: () => Promise<ProjectSetupData | null>
      submitProjectSetup: (data: ProjectSetupData) => void
      cancelProjectSetup: () => void
      showCloneUrl: () => Promise<{ url: string; path: string } | null>
      submitCloneUrl: (data: { url: string; path: string }) => void
      cancelCloneUrl: () => void
      onMenuAction: (callback: (action: string, payload?: any) => void) => void
      removeMenuActionListener: () => void
      setLastProjectPath: (projectPath: string | null) => Promise<void>
      setCurrentRoute: (route: string) => Promise<void>
      getSearchMenuEntries: () => Promise<Array<{ label: string; breadcrumb: string; action: string | null; payload?: Record<string, unknown>; enabled: boolean; accelerator?: string }>>
      openExternal: (url: string) => Promise<void>
    }
  }
}

