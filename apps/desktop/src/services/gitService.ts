import type {
    AlsMergePendingFileDTO,
    GitStatus,
    PullPushResult,
    ProjectReadinessDTO,
} from '../types'

const gitService = {
    async initRepo(folderPath: string, projectInfo?: any): Promise<string> {
        if(!window.gitService) {
            console.warn('gitService not avaliable')
            return Promise.resolve('')
        }
        return window.gitService.initRepo(folderPath, projectInfo)
    },

    async cloneRepo(cloneUrl: string, destinationPath: string): Promise<string> {
        if(!window.gitService) {
            console.warn('gitService not avaliable')
            return Promise.resolve('')
        }
        return window.gitService.cloneRepo(cloneUrl, destinationPath)
    },
    
    async pullRepo(
        repoPath: string,
        opts?: { skipMissingSampleCheck?: boolean },
    ): Promise<PullPushResult> {
        if (!window.gitService) {
            console.warn('gitService not avaliable')
            return Promise.resolve({ ok: true, message: '' })
        }
        return window.gitService.pullRepo(repoPath, opts)
    },

    async commitChange(repoPath: string): Promise<string> {
        if(!window.gitService) {
            console.warn('gitService not avaliable')
            return Promise.resolve('')
        }
        return window.gitService.commitChange(repoPath)
    },

    async pushRepo(
        repoPath: string,
        opts?: { skipMissingSampleCheck?: boolean },
    ): Promise<PullPushResult> {
        if (!window.gitService) {
            console.warn('gitService not avaliable')
            return Promise.resolve({ ok: true, message: '' })
        }
        return window.gitService.pushRepo(repoPath, opts)
    },

    async getProjectReadiness(repoPath: string): Promise<ProjectReadinessDTO | null> {
        if (!window.gitService) {
            return null
        }
        return window.gitService.getProjectReadiness(repoPath)
    },

    async completeAlsMerge(
        pendingPath: string,
        resolutions: Record<string, string>,
    ): Promise<{ hadDuplicate: boolean }> {
        if (!window.gitService?.completeAlsMerge) {
            throw new Error('completeAlsMerge is not available')
        }
        return window.gitService.completeAlsMerge(pendingPath, resolutions)
    },

    async clearMergePendingFlag(repoPath: string): Promise<void> {
        if (!window.gitService?.clearMergePendingFlag) {
            return
        }
        await window.gitService.clearMergePendingFlag(repoPath)
    },

    async getAlsMergePending(pendingPath: string): Promise<AlsMergePendingFileDTO | null> {
        if (!window.gitService?.getAlsMergePending) {
            return null
        }
        return window.gitService.getAlsMergePending(pendingPath)
    },

    async getStatus(_repoPath: string): Promise<GitStatus> {
        return Promise.resolve({ hasChanges: false, changes: [] })
    },

    formatStatus(status: GitStatus): string {
        if (!status.hasChanges || status.changes.length === 0) {
            return 'Working tree clean'
        }
        return `${status.changes.length} file(s) changed`
    }
}

export default gitService