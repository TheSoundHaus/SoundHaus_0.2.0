import electronAPI from '../services/electronAPI'
import gitService from '../services/gitService';

export function useElectronIPC() {
    return {
        chooseFolder: electronAPI.chooseFolder,
        hasGitFile: electronAPI.hasGitFile,
        getAlsContent: electronAPI.getAlsContent,
        findAls: electronAPI.findAls,
        getAlsStruct: electronAPI.getAlsStruct,
        initRepo: gitService.initRepo,
        pullRepo: gitService.pullRepo,
        pushRepo: gitService.pushRepo
    }
}

export default useElectronIPC;