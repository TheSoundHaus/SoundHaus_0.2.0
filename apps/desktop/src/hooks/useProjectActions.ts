import { useNavigate } from 'react-router-dom'
import { useElectronIPC } from './useElectronIPC'
import { useState } from 'react'

export function useProjectActions() {
    const { chooseFolder, hasGitFile, initRepo, cloneRepo, showProjectSetup, showCloneUrl } = useElectronIPC()
    const navigate = useNavigate()
    const [isOpenDialogVisible, setIsOpenDialogVisible] = useState(false)

    /**
     * Extract project name from path (uses folder name as fallback)
     */
    const getProjectName = (folderPath: string): string => {
        // Extract folder name from path (handles both / and \ separators)
        return folderPath.split(/[\\/]/).filter(Boolean).pop() || 'Untitled';
    }

    /**
     * Track a project in recent projects
     */
    const trackRecentProject = async (projectPath: string, projectName: string): Promise<void> => {
        try {
            await window.electron?.addRecentProject(projectPath, projectName);
        } catch (error) {
            console.warn('Failed to track recent project:', error);
            // Non-critical - don't throw
        }
    }

    /**
     * Open a SoundHaus project directly (assumed to be already git-enabled)
     */
    const openSoundHausProject = async (projectPath: string): Promise<boolean> => {
        try {
            const git = await hasGitFile(projectPath);
            if (!git) {
                alert(`This is not a valid SoundHaus project (no git repository found):\n${projectPath}`);
                return false;
            }

            const projectName = getProjectName(projectPath);
            await window.electron?.setLastProjectPath(projectPath);
            await trackRecentProject(projectPath, projectName);
            navigate('/project', { state: { projectPath } });
            return true;
        } catch (error) {
            alert(`Failed to open project:\n${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

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
                const projectName = getProjectName(clonedRepoPath);
                await window.electron?.setLastProjectPath(clonedRepoPath);
                await trackRecentProject(clonedRepoPath, projectName);
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

                // Only navigate on success
                const git = await hasGitFile(folder);
                if(git) {
                    await window.electron?.setLastProjectPath(folder);
                    await trackRecentProject(folder, projectInfo.name);
                    navigate('/project', {state: {projectPath: folder}});
                }
            } catch(error) {
                alert(`Failed to create repository:\n${error instanceof Error ? error.message : String(error)}`)
            }
        }
    }

    const handleOpenSoundHausProject = async () => {
        setIsOpenDialogVisible(true);
    }

    const handleSelectFromDialog = async (projectPath: string): Promise<boolean> => {
        return await openSoundHausProject(projectPath);
    }

    const handleOpenFromFilepath = async (): Promise<boolean> => {
        const folder = await chooseFolder();
        if (folder) {
            return await openSoundHausProject(folder);
        }
        return false;
    }

    const handleExistingProject = async () => {
        const folder = await chooseFolder();
        if(folder) {
            const git = await hasGitFile(folder);
            if(git) {
                const projectName = getProjectName(folder);
                await window.electron?.setLastProjectPath(folder);
                await trackRecentProject(folder, projectName);
                navigate('/project', {state: {projectPath: folder}});
            }
        }
    }

    return {
        handleProjectClone,
        handleServerExplore,
        handleAbletonImport,
        handleExistingProject,
        handleOpenSoundHausProject,
        handleSelectFromDialog,
        handleOpenFromFilepath,
        isOpenDialogVisible,
        setIsOpenDialogVisible,
    }
}

export default useProjectActions;
