export {}

declare global {
  interface Window {
    electronAPI?: {
      isElectron?: () => boolean
      chooseFolder: () => Promise<string | null>
      hasGitFile: (p: string) => Promise<boolean>
    }
  }
}
