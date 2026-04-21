import type { CheckoutCommitResult, HeadStateResult, ReturnToLatestResult } from '../types'

const electronAPI = {
    isElectron: (): boolean => {
        return typeof window !== 'undefined' && !!window.electronAPI
    },
    
    chooseFolder: (): Promise<string | null> => {
        if (!window.electronAPI) {
            console.warn('electronAPI not available')
            return Promise.resolve(null)
        }
        return window.electronAPI.chooseFolder()
    },

    hasGitFile: (folderPath: string): Promise<boolean> => {
        if(!window.electronAPI) {
            console.warn('electronAPI not avaliable')
            return Promise.resolve(false)
        }
        return window.electronAPI.hasGitFile(folderPath)
    },

    getAlsStruct: (alsPath: string): Promise<any> => {
        if(!window.electronAPI) {
            console.warn('electronAPI not avaliable')
            return Promise.resolve(null)
        }
        return window.electronAPI.getAlsStruct(alsPath)
    },

    findAls: (folderPath: string): Promise<string | null> => {
        if(!window.electronAPI) {
            console.warn('electronAPI not avaliable')
            return Promise.resolve(null)
        }
        return window.electronAPI.findAls(folderPath)
    },

    getAlsContent: (alsPath: string): Promise<any> => {
        if(!window.electronAPI) {
            console.warn('electronAPI not avaliable')
            return Promise.resolve(null)
        }
        return window.electronAPI.getAlsContent(alsPath)
    },

    getChanges: (alsPath: string): Promise<any> => {
        if(!window.electronAPI) {
            console.warn('electronAPI not available')
            return Promise.resolve(null)
        }
        return window.electronAPI.getChanges(alsPath)
    },

    getCommitHistory: (repoPath: string): Promise<any[]> => {
        if(!window.electronAPI) {
            console.warn('electronAPI not available')
            return Promise.resolve([])
        }
        return window.electronAPI.getCommitHistory(repoPath)
    },

    getCommitDiff: (repoPath: string, commitHash: string, alsPath: string): Promise<any> => {
        if(!window.electronAPI) {
            console.warn('electronAPI not available')
            return Promise.resolve(null)
        }
        return window.electronAPI.getCommitDiff(repoPath, commitHash, alsPath)
    },

    getHeadState: (repoPath: string): Promise<HeadStateResult> => {
        if (!window.electronAPI) {
            console.warn('electronAPI not available')
            return Promise.resolve({ ok: false, reason: 'electronAPI not available' })
        }
        return window.electronAPI.getHeadState(repoPath)
    },

    checkoutCommit: (repoPath: string, commitSha: string): Promise<CheckoutCommitResult> => {
        if (!window.electronAPI) {
            console.warn('electronAPI not available')
            return Promise.resolve({ ok: false, reason: 'electronAPI not available' })
        }
        return window.electronAPI.checkoutCommit(repoPath, commitSha)
    },

    returnToLatest: (repoPath: string, opts?: { applyStash?: boolean }): Promise<ReturnToLatestResult> => {
        if (!window.electronAPI) {
            console.warn('electronAPI not available')
            return Promise.resolve({ ok: false, reason: 'electronAPI not available' })
        }
        return window.electronAPI.returnToLatest(repoPath, opts)
    },

    checkIsCollaboration: (repoPath: string): Promise<{ ok: boolean; isCollaboration?: boolean; ownerName?: string; reason?: string }> => {
        if(!window.electronAPI) {
            console.warn('electronAPI not available')
            return Promise.resolve({ ok: false, reason: 'electronAPI not available' })
        }
        return window.electronAPI.checkIsCollaboration(repoPath)
    },

    logout: async (): Promise<{ success: boolean }> => {
        if (!window.patService) {
            console.warn('patService not available')
            return { success: false }
        }
        return window.patService.logout()
    }
}

export default electronAPI