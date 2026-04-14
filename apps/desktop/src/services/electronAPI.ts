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

    getPendingInvitations: (): Promise<any> => {
        if(!window.electronAPI) {
            console.warn('electronAPI not available')
            return Promise.resolve({ ok: false, reason: 'electronAPI not available' })
        }
        return window.electronAPI.getPendingInvitations()
    },

    acceptInvitation: (invitationId: string): Promise<any> => {
        if(!window.electronAPI) {
            console.warn('electronAPI not available')
            return Promise.resolve({ ok: false, reason: 'electronAPI not available' })
        }
        return window.electronAPI.acceptInvitation(invitationId)
    },

    declineInvitation: (invitationId: string): Promise<any> => {
        if(!window.electronAPI) {
            console.warn('electronAPI not available')
            return Promise.resolve({ ok: false, reason: 'electronAPI not available' })
        }
        return window.electronAPI.declineInvitation(invitationId)
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