import electronAPI from '../services/electronAPI'

export function useElectronIPC() {
    return {
        chooseFolder: electronAPI.chooseFolder,
        hasGitFile: electronAPI.hasGitFile,
        getAlsContent: electronAPI.getAlsContent,
        findAls: electronAPI.findAls,
        getAlsStruct: electronAPI.getAlsStruct
    }
}

export default useElectronIPC;