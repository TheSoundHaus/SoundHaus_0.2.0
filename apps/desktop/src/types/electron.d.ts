export {}

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
    electron?: {
      showProjectSetup: () => Promise<ProjectSetupData | null>
      submitProjectSetup: (data: ProjectSetupData) => void
      cancelProjectSetup: () => void
    }
  }
}
