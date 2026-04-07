export interface ProjectSetupData {
  name: string;
  description: string;
  isPublic: boolean;
}

declare global {
  interface Window {
    electronAPI?: {
      isElectron?: () => boolean
      chooseFolder: () => Promise<string | null>
      hasGitFile: (p: string) => Promise<boolean>
      getAlsContent: (alsPath: string) => Promise<string | null>
      getAlsStruct: (alsPath: string) => Promise<any>
      findAls: (folderPath: string) => Promise<string | null>
      getChanges: (alsPath: string) => Promise<any>
      getCommitHistory: (repoPath: string) => Promise<any[]>
      getCommitDiff: (repoPath: string, commitHash: string, alsPath: string) => Promise<any>
      getPendingInvitations: () => Promise<{ ok: boolean; invitations?: any[]; reason?: string }>
      acceptInvitation: (invitationId: string) => Promise<{ ok: boolean; reason?: string }>
      declineInvitation: (invitationId: string) => Promise<{ ok: boolean; reason?: string }>
      checkIsCollaboration: (repoPath: string) => Promise<{ ok: boolean; isCollaboration?: boolean; ownerName?: string; reason?: string }>
    }
    gitService?: {
      initRepo: (folderPath: string, projectInfo?: ProjectSetupData) => Promise<string>
      cloneRepo: (cloneUrl: string, destinationPath: string) => Promise<string>
      pullRepo: (repoPath: string) => Promise<string>
      commitChange: (repoPath: string) => Promise<string>
      pushRepo: (repoPath: string) => Promise<string>
    }
    patService?: {
      getSoundHausCredentials: () => Promise<string | null>
      setSoundHausCredentials: (token: string) => Promise<string>
      getGiteaCredentials: () => Promise<string | null>
      setGiteaCredentials: (token: string) => Promise<string>
      getAllowedCloneRemote: () => Promise<string | null>
      setAllowedCloneRemote: (remote: string) => Promise<string>
      autoLogin: () => Promise<{ success: boolean; reason?: string; status?: number; body?: string; error?: string }>
      manualLogin: (email: string, password: string) => Promise<{ success: boolean; reason?: string; status?: number; body?: string; error?: string }>
    }
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
