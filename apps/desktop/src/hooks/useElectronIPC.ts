import electronAPI from '../services/electronAPI'
import gitService from '../services/gitService';

export function useElectronIPC() {
    const showProjectSetup = async () => {
        return await window.electron?.showProjectSetup();
    };

    return {
        chooseFolder: electronAPI.chooseFolder,
        hasGitFile: electronAPI.hasGitFile,
        getAlsContent: electronAPI.getAlsContent,
        findAls: electronAPI.findAls,
        getAlsStruct: electronAPI.getAlsStruct,
        initRepo: gitService.initRepo,
        pullRepo: gitService.pullRepo,
        commitChange: gitService.commitChange,
        pushRepo: gitService.pushRepo,
        showProjectSetup
    }
}

export default useElectronIPC;