/** Git HEAD / time-travel state from main process (`get-head-state`). */
export type HeadStateOk = {
  headSha: string
  branchName: string | null
  detached: boolean
  returnTarget: { branch: string; sha: string } | null
  timeTravelStashCount: number
}

export type HeadStateResult = ({ ok: true } & HeadStateOk) | { ok: false; reason: string }

export type CheckoutCommitResult =
  | { ok: true; headState: HeadStateOk; stashMessage: string | null }
  | { ok: false; reason: string }

export type ReturnToLatestResult =
  | { ok: true; headState: HeadStateOk }
  | {
      ok: false
      reason: string
      stashPopFailed?: boolean
      stashPopReason?: string
      headState?: HeadStateOk
    }

export interface ElectronAPI {
  chooseFolder: () => Promise<string | null>
  hasGitFile: (folderPath: string) => Promise<boolean>
  getAlsStruct: (alsPath: string) => Promise<any>
  findAls: (folderPath: string) => Promise<string | null>
  getAlsContent: (alsPath: string) => Promise<any>
  getChanges: (alsPath: string) => Promise<any>
  getCommitHistory: (repoPath: string) => Promise<any[]>
  getCommitDiff: (repoPath: string, commitHash: string, alsPath: string) => Promise<any>
  getHeadState: (repoPath: string) => Promise<HeadStateResult>
  checkoutCommit: (repoPath: string, commitSha: string) => Promise<CheckoutCommitResult>
  returnToLatest: (repoPath: string, opts?: { applyStash?: boolean }) => Promise<ReturnToLatestResult>
  checkIsCollaboration: (repoPath: string) => Promise<{
    ok: boolean
    isCollaboration?: boolean
    ownerName?: string
    reason?: string
  }>
}

export interface GitService {
  initRepo: (folderPath: string, projectInfo?: ProjectSetupData) => Promise<string>
  cloneRepo: (cloneUrl: string, destinationPath: string) => Promise<string>
  pullRepo: (repoPath: string) => Promise<string>
  commitChange: (repoPath: string) => Promise<string>
  pushRepo: (repoPath: string) => Promise<string>
}

export interface LoginResult {
  success: boolean
  reason?: string
  status?: number
  body?: string
  error?: string
}

export interface PatService {
  getSoundHausCredentials: () => Promise<string | null>
  setSoundHausCredentials: (token: string) => Promise<string>
  getGiteaCredentials: () => Promise<string | null>
  setGiteaCredentials: (token: string) => Promise<string>
  getAllowedCloneRemote: () => Promise<string | null>
  setAllowedCloneRemote: (remote: string) => Promise<string>
  autoLogin: () => Promise<LoginResult>
  manualLogin: (email: string, password: string) => Promise<LoginResult>
  logout: () => Promise<{ success: boolean }>
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

export interface RecentProject {
  path: string
  name: string
  lastOpened: string
}

// MIDI Diff types (used in ProjectPage and PianoRollCanvas)
export type SnapshotNote = {
  pitch: number
  start_beat: number
  duration_beats: number
  velocity: number
  note_id?: string | null
}

export type TrackNoteDiff = {
  trackId: string
  trackName: string
  added: SnapshotNote[]
  removed: SnapshotNote[]
  adjusted: Array<{ from: SnapshotNote; to: SnapshotNote }>
  unchanged?: SnapshotNote[]
}

export type NoteDiff = {
  tracks: TrackNoteDiff[]
}

export type CommitEntry = {
  hash: string
  shortHash: string
  subject: string
  author: string
  timestamp: string
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
      addRecentProject: (projectPath: string, projectName: string) => Promise<void>
      getRecentProjects: () => Promise<RecentProject[]>
      removeRecentProject: (projectPath: string) => Promise<void>
      getSearchMenuEntries: () => Promise<Array<{ label: string; breadcrumb: string; action: string | null; payload?: Record<string, unknown>; enabled: boolean; accelerator?: string }>>
      openExternal: (url: string) => Promise<void>
    }
  }
}

