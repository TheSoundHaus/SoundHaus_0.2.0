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
    }
    gitService?: {
      initRepo: (folderPath: string, projectInfo?: ProjectSetupData) => Promise<string>
      pullRepo: (repoPath: string) => Promise<string>
      pushRepo: (repoPath: string) => Promise<string>
      getSoundHausCredentials: () => Promise<string | null>
      setSoundHausCredentials: (token: string) => Promise<string>
    }
    electron?: {
      showProjectSetup: () => Promise<ProjectSetupData | null>
      submitProjectSetup: (data: ProjectSetupData) => void
      cancelProjectSetup: () => void
    }
  }
}
