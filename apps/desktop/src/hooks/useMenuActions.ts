import { useCallback, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useToast } from '../components/ToastProvider'
import {
    notifyPullSuccess,
    notifyPullError,
    notifyCommitSuccess,
    notifyCommitError,
    notifyPushSuccess,
    notifyPushError,
} from '../utils/projectNotifications'
import { useProjectActions } from './useProjectActions'
import { useProjectGitActions } from './useProjectGitActions'

export function useMenuActions() {
    const { showToast } = useToast()
    const { handleAbletonImport } = useProjectActions()
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

    // Shared action handler used by both menu-action IPC and search palette events
    const executeAction = useCallback((action: string, payload?: any) => {
        switch (action) {
            case 'open-search-palette':
                window.dispatchEvent(new CustomEvent('soundhaus:open-search-palette'));
                break;
            case 'browse-public':
            case 'view-on-soundhaus':
                if (payload?.url && typeof payload.url === 'string') {
                    window.electron?.openExternal(payload.url);
                }
                break;
            case 'import-ableton':
                handleAbletonImport();
                break;
            case 'import-soundhaus':
                navigate('/home', { state: { openProjectDialog: true } });
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
                            notifyPullSuccess(showToast, result)
                            requestProjectRefresh(payload.projectPath)
                        })
                        .catch(error => notifyPullError(showToast, error));
                }
                break;
            case 'project-commit':
                if (payload?.projectPath && typeof payload.projectPath === 'string') {
                    runCommit(payload.projectPath)
                        .then(result => {
                            notifyCommitSuccess(showToast, result)
                            requestProjectRefresh(payload.projectPath)
                        })
                        .catch(error => notifyCommitError(showToast, error));
                }
                break;
            case 'project-push':
                if (payload?.projectPath && typeof payload.projectPath === 'string') {
                    runPush(payload.projectPath)
                        .then(result => {
                            notifyPushSuccess(showToast, result)
                            requestProjectRefresh(payload.projectPath)
                        })
                        .catch(error => notifyPushError(showToast, error));
                }
                break;
        }
    }, [handleAbletonImport, navigate, runPull, runCommit, runPush, showToast]);

    // Report current route to main process so it can enable/disable menu items.
    // Include location.key so same-path navigations with new state still re-sync.
    useEffect(() => {
        window.electron?.setCurrentRoute(location.pathname);
    }, [location.pathname, location.key]);

    // Listen for menu-action IPC from main process (menu bar clicks)
    useEffect(() => {
        window.electron?.onMenuAction(executeAction);
        return () => {
            window.electron?.removeMenuActionListener();
        };
    }, [executeAction]);

    // Listen for actions dispatched from the search palette
    useEffect(() => {
        const handler = (e: Event) => {
            const { action, payload } = (e as CustomEvent).detail;
            executeAction(action, payload);
        };
        window.addEventListener('soundhaus:execute-search-action', handler);
        return () => window.removeEventListener('soundhaus:execute-search-action', handler);
    }, [executeAction]);
}

export default useMenuActions;
