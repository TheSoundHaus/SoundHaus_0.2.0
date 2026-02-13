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

    diffXml: (curAlsPath: string, oldAlsPath: string): Promise<any> => {
        if(!window.electronAPI) {
            console.warn('electronAPI not available')
            return Promise.resolve(null)
        }
        return window.electronAPI.diffXml(curAlsPath, oldAlsPath)
    },

    getRemoteHeadAls: (alsPath: string): Promise<any> => {
        if(!window.electronAPI) {
            console.warn('electronAPI not available')
            return Promise.resolve(null)
        }
        return window.electronAPI.getRemoteHeadAls(alsPath)
    }
}

export default electronAPI