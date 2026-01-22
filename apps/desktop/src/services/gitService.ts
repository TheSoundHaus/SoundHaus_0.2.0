const gitService = {
    async initRepo(folderPath: string, projectInfo?: any): Promise<string> {
        if(!window.gitService) {
            console.warn('gitService not avaliable')
            return Promise.resolve('')
        }
        return window.gitService.initRepo(folderPath, projectInfo)
    },
    
    async pullRepo(repoPath: string): Promise<string> {
        if(!window.gitService) {
            console.warn('gitService not avaliable')
            return Promise.resolve('')
        }
        return window.gitService.pullRepo(repoPath)
    },

    async pushRepo(repoPath: string): Promise<string> {
        if(!window.gitService) {
            console.warn('gitService not avaliable')
            return Promise.resolve('')
        }
        return window.gitService.pushRepo(repoPath)
    },

    async getSoundHausCredentials(): Promise<string | null> {
        if(!window.gitService) {
            console.warn('gitService not avaliable')
            return Promise.resolve('')
        }
        return window.gitService.getSoundHausCredentials()
    },

    async setSoundHausCredentials(token: string): Promise<string> {
        if(!window.gitService) {
            console.warn('gitService not avaliable')
            return Promise.resolve('')
        }
        return window.gitService.setSoundHausCredentials(token)
    }
}

export default gitService