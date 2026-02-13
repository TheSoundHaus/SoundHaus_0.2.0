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
      diffXml: (curAlsPath, oldAlsPath) => Promise<any>
      getRemoteHeadAls: (alsPath: string) => Promise<any>
    }
    gitService?: {
      initRepo: (folderPath: string, projectInfo?: ProjectSetupData) => Promise<string>
      pullRepo: (repoPath: string) => Promise<string>
      commitChange: (repoPath: string) => Promise<string>
      pushRepo: (repoPath: string) => Promise<string>
    }
    patService?: {
      getSoundHausCredentials: () => Promise<string | null>
      setSoundHausCredentials: (token: string) => Promise<string>
      getGiteaCredentials: () => Promise<string | null>
      setGiteaCredentials: (token: string) => Promise<string>
    }
    electron?: {
      showProjectSetup: () => Promise<ProjectSetupData | null>
      submitProjectSetup: (data: ProjectSetupData) => void
      cancelProjectSetup: () => void
    }
  }
}
