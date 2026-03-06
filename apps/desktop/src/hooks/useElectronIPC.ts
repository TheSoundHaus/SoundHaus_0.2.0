import electronAPI from '../services/electronAPI'
import gitService from '../services/gitService';

export function useElectronIPC() {
    const showProjectSetup = async () => {
        return await window.electron?.showProjectSetup();
    };

    const showCloneUrl = async () => {
        return await window.electron?.showCloneUrl();
    };

    return {
        chooseFolder: electronAPI.chooseFolder,
        hasGitFile: electronAPI.hasGitFile,
        getAlsContent: electronAPI.getAlsContent,
        findAls: electronAPI.findAls,
        getAlsStruct: electronAPI.getAlsStruct,
        initRepo: gitService.initRepo,
        cloneRepo: gitService.cloneRepo,
        pullRepo: gitService.pullRepo,
        commitChange: gitService.commitChange,
        pushRepo: gitService.pushRepo,
        showProjectSetup,
        showCloneUrl
    }
}

export default useElectronIPC;