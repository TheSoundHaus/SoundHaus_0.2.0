import { useNavigate } from 'react-router-dom'
import { useElectronIPC } from './useElectronIPC'

export function useProjectActions() {
    const { chooseFolder, hasGitFile, initRepo, cloneRepo, showProjectSetup, showCloneUrl } = useElectronIPC()
    const navigate = useNavigate()

    const handleProjectClone = async () => {
        const cloneInfo = await showCloneUrl();
        if (!cloneInfo) {
            return;
        }

        try {
            const clonedRepoPath = await cloneRepo(cloneInfo.url, cloneInfo.path);
            alert(`Clone complete:\n${clonedRepoPath}`)

            const git = await hasGitFile(clonedRepoPath);
            if (git) {
                navigate('/project', {state: {projectPath: clonedRepoPath}});
            }
        } catch(error) {
            alert(`Clone failed:\n${error}`)
        }
    }

    const handleServerExplore = async () => {
        window.open("http://www.rickleinecker.com/", "_blank");
    }

    const handleAbletonImport = async () => {
        const folder = await chooseFolder();
        if(folder) {
            // Show project setup dialog
            const projectInfo = await showProjectSetup();
            
            if (!projectInfo) {
                // User cancelled the dialog
                return;
            }

            try {
                const result = await initRepo(folder, projectInfo);
                alert(`Init complete:\n${result}`)
            } catch(error) {
                alert(`Init failed:\n${error}`)
            }

            // Backup check
            const git = await hasGitFile(folder);
            if(git) {
                navigate('/project', {state: {projectPath: folder}});
            }
        }
    }

    const handleExistingProject = async () => {
        const folder = await chooseFolder();
        if(folder) {
            const git = await hasGitFile(folder);
            if(git) {
                navigate('/project', {state: {projectPath: folder}});
            }
        }
    }

    return {
        handleProjectClone,
        handleServerExplore,
        handleAbletonImport,
        handleExistingProject,
    }
}

export default useProjectActions;
