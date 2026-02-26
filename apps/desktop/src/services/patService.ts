const patService = {
    async getSoundHausCredentials(): Promise<string | null> {
        if(!window.patService) {
            console.warn('patService not avaliable')
            return Promise.resolve('')
        }
        return window.patService.getSoundHausCredentials()
    },

    async setSoundHausCredentials(token: string): Promise<string> {
        if(!window.patService) {
            console.warn('patService not avaliable')
            return Promise.resolve('')
        }
        return window.patService.setSoundHausCredentials(token)
    },

    async getGiteaCredentials(): Promise<string | null> {
        if(!window.patService) {
            console.warn('patService not avaliable')
            return Promise.resolve('')
        }
        return window.patService.getGiteaCredentials()
    },

    async setGiteaCredentials(token: string): Promise<string> {
        if(!window.patService) {
            console.warn('patService not avaliable')
            return Promise.resolve('')
        }
        return window.patService.setGiteaCredentials(token)
    },

    async getAllowedCloneRemote(): Promise<string | null> {
        if(!window.patService) {
            console.warn('patService not avaliable')
            return Promise.resolve('')
        }
        return window.patService.getAllowedCloneRemote()
    },

    async setAllowedCloneRemote(remote: string): Promise<string> {
        if(!window.patService) {
            console.warn('patService not avaliable')
            return Promise.resolve('')
        }
        return window.patService.setAllowedCloneRemote(remote)
    }
}

export default patService