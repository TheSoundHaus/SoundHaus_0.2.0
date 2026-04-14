import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useToast } from '../components/ToastProvider'
import { useElectronIPC } from './useElectronIPC'

export function useProjectActions() {
    const { showToast } = useToast()
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
     * Finish opening after path is known valid (OpenProjectDialog validates git before calling).
     */
    const completeOpenSoundHausProject = async (projectPath: string): Promise<boolean> => {
        try {
            const projectName = getProjectName(projectPath);
            await window.electron?.setLastProjectPath(projectPath);
            await trackRecentProject(projectPath, projectName);
            navigate('/project', { state: { projectPath } });
            return true;
        } catch (error) {
            showToast({
                type: 'error',
                title: "Couldn't open project",
                detail: error instanceof Error ? error.message : String(error),
            });
            return false;
        }
    }

    /**
     * Open from flows that do not pre-validate (e.g. chooseFolder-only); shows toast if not a project.
     */
    const openSoundHausProject = async (projectPath: string): Promise<boolean> => {
        const git = await hasGitFile(projectPath);
        if (!git) {
            showToast({
                type: 'error',
                title: 'Not a SoundHaus project',
                detail:
                    "This folder doesn't look like it's compatible with SoundHaus. Choose a folder that's already a SoundHaus project, or pick an Ableton Project.",
            });
            return false;
        }
        return completeOpenSoundHausProject(projectPath);
    }

    const runCloneAfterPicker = async (options?: {
        initialCloneUrl?: string;
    }): Promise<boolean> => {
        const cloneInfo = await showCloneUrl(
            options?.initialCloneUrl?.trim()
                ? { initialCloneUrl: options.initialCloneUrl.trim() }
                : {},
        );
        if (!cloneInfo) {
            return false;
        }

        try {
            const clonedRepoPath = await cloneRepo(cloneInfo.url, cloneInfo.path);
            const name = getProjectName(clonedRepoPath);
            showToast({
                type: 'success',
                title: 'Project downloaded',
                detail: `${name}\n${clonedRepoPath}`,
            });

            const git = await hasGitFile(clonedRepoPath);
            if (git) {
                const projectName = getProjectName(clonedRepoPath);
                await window.electron?.setLastProjectPath(clonedRepoPath);
                await trackRecentProject(clonedRepoPath, projectName);
                navigate('/project', { state: { projectPath: clonedRepoPath } });
                return true;
            }
            return false;
        } catch (error) {
            showToast({
                type: 'error',
                title: "Couldn't download project",
                detail: error instanceof Error ? error.message : String(error),
            });
            return false;
        }
    };

    const handleProjectClone = async () => {
        await runCloneAfterPicker();
    };

    const handleCloneOnlineRepo = async (initialCloneUrl: string): Promise<boolean> => {
        return runCloneAfterPicker({ initialCloneUrl });
    };

    const handleServerExplore = async () => {
        window.open("https://www.thesound.haus/", "_blank");
    }

    /**
     * Show the project setup modal and run initRepo for a pre-selected folder.
     * Returns true only when setup completed and navigation happened.
     */
    const runAbletonSetupOnFolder = async (folder: string): Promise<boolean> => {
        const projectInfo = await showProjectSetup();
        if (!projectInfo) {
            return false;
        }

        try {
            await initRepo(folder, projectInfo);
            showToast({
                type: 'success',
                title: 'Project created',
                detail: `${projectInfo.name} is ready on your computer.`,
            });

            // Only navigate on success
            const git = await hasGitFile(folder);
            if (git) {
                await window.electron?.setLastProjectPath(folder);
                await trackRecentProject(folder, projectInfo.name);
                navigate('/project', { state: { projectPath: folder } });
                return true;
            }
        } catch (error) {
            showToast({
                type: 'error',
                title: "Couldn't create project",
                detail: error instanceof Error ? error.message : String(error),
            });
        }
        return false;
    }

    const handleAbletonImport = async () => {
        const folder = await chooseFolder();
        if (folder) {
            await runAbletonSetupOnFolder(folder);
        }
    }

    const setupAbletonFolderAsSoundHaus = async (folder: string): Promise<boolean> => {
        return runAbletonSetupOnFolder(folder);
    }

    const handleOpenSoundHausProject = async () => {
        setIsOpenDialogVisible(true);
    }

    const handleSelectFromDialog = async (projectPath: string): Promise<boolean> => {
        return completeOpenSoundHausProject(projectPath);
    }

    const handleOpenFromFilepath = async (): Promise<boolean> => {
        const folder = await chooseFolder();
        if (folder) {
            return openSoundHausProject(folder);
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
        handleCloneOnlineRepo,
        handleServerExplore,
        handleAbletonImport,
        handleExistingProject,
        handleOpenSoundHausProject,
        handleSelectFromDialog,
        handleOpenFromFilepath,
        setupAbletonFolderAsSoundHaus,
        isOpenDialogVisible,
        setIsOpenDialogVisible,
    }
}

export default useProjectActions;
