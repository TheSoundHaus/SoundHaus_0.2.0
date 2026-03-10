import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useProjectActions } from './useProjectActions'
import { useProjectGitActions } from './useProjectGitActions'

export function useMenuActions() {
    const { handleAbletonImport, handleExistingProject } = useProjectActions()
    const { runPull, runCommit, runPush } = useProjectGitActions()
    const navigate = useNavigate()
    const location = useLocation()

    const requestProjectRefresh = (projectPath: string) => {
        window.dispatchEvent(
            new CustomEvent('soundhaus:project-refresh-request', {
                detail: { projectPath }
            })
        );
    }

    // Report current route to main process so it can enable/disable menu items.
    // Include location.key so same-path navigations with new state still re-sync.
    useEffect(() => {
        window.electron?.setCurrentRoute(location.pathname);
    }, [location.pathname, location.key]);

    useEffect(() => {
        const handler = (action: string, payload?: any) => {
            switch (action) {
                case 'import-ableton':
                    handleAbletonImport();
                    break;
                case 'import-soundhaus':
                    handleExistingProject();
                    break;
                case 'view-home':
                    navigate('/home');
                    break;
                case 'view-project':
                    if (payload?.projectPath && typeof payload.projectPath === 'string') {
                        navigate('/project', { state: { projectPath: payload.projectPath } });
                    }
                    break;
                case 'project-pull':
                    if (payload?.projectPath && typeof payload.projectPath === 'string') {
                        runPull(payload.projectPath)
                            .then(result => {
                                alert(`Pull complete:\n${result}`)
                                requestProjectRefresh(payload.projectPath)
                            })
                            .catch(error => alert(`Pull failed:\n${error}`));
                    }
                    break;
                case 'project-commit':
                    if (payload?.projectPath && typeof payload.projectPath === 'string') {
                        runCommit(payload.projectPath)
                            .then(result => {
                                alert(`Commit complete:\n${result}`)
                                requestProjectRefresh(payload.projectPath)
                            })
                            .catch(error => alert(`Commit failed:\n${error}`));
                    }
                    break;
                case 'project-push':
                    if (payload?.projectPath && typeof payload.projectPath === 'string') {
                        runPush(payload.projectPath)
                            .then(result => {
                                alert(`Push complete:\n${result}`)
                                requestProjectRefresh(payload.projectPath)
                            })
                            .catch(error => alert(`Push failed:\n${error}`));
                    }
                    break;
            }
        };

        window.electron?.onMenuAction(handler);

        return () => {
            window.electron?.removeMenuActionListener();
        };
    }, [handleAbletonImport, handleExistingProject, navigate, runPull, runCommit, runPush]);
}

export default useMenuActions;
