import { useState, useEffect } from 'react'
import electronAPI from '../services/electronAPI'

/**
 * Hook for Electron IPC operations
 * Provides easy access to all IPC functions
 */
export function useElectronIPC() {
  const [isElectron, setIsElectron] = useState(false)

  useEffect(() => {
    setIsElectron(electronAPI.isElectron())
  }, [])

  return {
    isElectron,
    chooseFolder: electronAPI.chooseFolder,
    chooseFile: electronAPI.chooseFile,
    cloneRepo: electronAPI.cloneRepo,
    getStatus: electronAPI.getStatus,
    pullRepo: electronAPI.pullRepo,
    pushRepo: electronAPI.pushRepo,
    getAlsContent: electronAPI.getAlsContent,
    findAls: electronAPI.findAls,
    openExternal: electronAPI.openExternal,
    onOpenProject: electronAPI.onOpenProject
  }
}

export default useElectronIPC
