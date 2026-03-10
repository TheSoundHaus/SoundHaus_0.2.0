import type { GitStatus } from '../types'

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
    
    async pullRepo(repoPath: string): Promise<string> {
        if(!window.gitService) {
            console.warn('gitService not avaliable')
            return Promise.resolve('')
        }
        return window.gitService.pullRepo(repoPath)
    },

    async commitChange(repoPath: string): Promise<string> {
        if(!window.gitService) {
            console.warn('gitService not avaliable')
            return Promise.resolve('')
        }
        return window.gitService.commitChange(repoPath)
    },

    async pushRepo(repoPath: string): Promise<string> {
        if(!window.gitService) {
            console.warn('gitService not avaliable')
            return Promise.resolve('')
        }
        return window.gitService.pushRepo(repoPath)
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