export interface ElectronAPI {
  chooseFolder: () => Promise<string | null>
  hasGitFile: (folderPath: string) => Promise<boolean>
  getAlsStruct: (alsPath: string) => Promise<any>
  findAls: (folderPath: string) => Promise<string | null>
  getAlsContent: (alsPath: string) => Promise<any>
  getChanges: (alsPath: string) => Promise<any>
  getCommitHistory: (repoPath: string) => Promise<any[]>
  getCommitDiff: (repoPath: string, commitHash: string, alsPath: string) => Promise<any>
}

/** Sample reference flagged by the missing-media heuristic (main process). */
export type MissingSampleIssueDTO = {
  relativePath: string
  reason: 'outside_project' | 'file_not_found'
}

/** Ableton Core Library / pack reference — informational, does not block sync. */
export type LibrarySampleAdvisoryDTO = {
  relativePath: string
}

/** One conflicting track from native three-way ALS merge (JSON from Rust). */
export type AlsMergeConflictEntryDTO = {
  track_id: string
  track_name?: string
  conflict_kind: string
  summary: string
}

/** Main-process payload written to `.soundhaus/als-merge-pending.json`. */
export type AlsMergePendingFileDTO = {
  openedAt: string
  repoPath: string
  sessionName: string
  basePath: string
  localPath: string
  remotePath: string
  conflictJson: string
  outputPath?: string
  rebaseResume?: boolean
  dirtyBackupMerge?: { baseCommit: string; alsRelPath: string }
}

export type PullPushResult =
  | { ok: true; message: string }
  | { ok: false; code: 'MISSING_SAMPLES'; issues: MissingSampleIssueDTO[]; message: string }
  | {
      ok: false
      code: 'ALS_MERGE_CONFLICT'
      conflictJson: string
      pendingPath: string
      message: string
    }
  | { ok: false; code: 'PUSH_BEHIND_REMOTE'; message: string }

export type ProjectReadinessDTO = {
  sync: {
    state: 'no_upstream' | 'unknown' | 'up_to_date' | 'ahead' | 'behind' | 'diverged'
    ahead?: number
    behind?: number
  }
  samples: {
    state: 'ok' | 'action_needed'
    issueCount: number
    issues: MissingSampleIssueDTO[]
    libraryAdvisoryCount: number
    libraryAdvisories: LibrarySampleAdvisoryDTO[]
  }
  /** `.soundhaus/als-merge-pending.json` exists — pull stopped for per-track resolution. */
  alsMergeConflictPendingPath: string | null
  /** `.soundhaus/merge-pending.json` — user chose Duplicate; finish in Ableton then clear. */
  mergeCompletePending: boolean
}

export interface GitService {
  initRepo: (folderPath: string, projectInfo?: ProjectSetupData) => Promise<string>
  cloneRepo: (cloneUrl: string, destinationPath: string) => Promise<string>
  pullRepo: (
    repoPath: string,
    opts?: { skipMissingSampleCheck?: boolean },
  ) => Promise<PullPushResult>
  commitChange: (repoPath: string) => Promise<string>
  pushRepo: (
    repoPath: string,
    opts?: { skipMissingSampleCheck?: boolean },
  ) => Promise<PullPushResult>
  getProjectReadiness: (repoPath: string) => Promise<ProjectReadinessDTO>
  checkMissingSamples: (
    repoPath: string,
  ) => Promise<{
    hasIssues: boolean
    issues: MissingSampleIssueDTO[]
    libraryAdvisories: LibrarySampleAdvisoryDTO[]
  }>
  completeAlsMerge: (
    pendingPath: string,
    resolutions: Record<string, string>,
  ) => Promise<{ hadDuplicate: boolean }>
  clearMergePendingFlag: (repoPath: string) => Promise<void>
  getAlsMergePending: (pendingPath: string) => Promise<AlsMergePendingFileDTO | null>
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

