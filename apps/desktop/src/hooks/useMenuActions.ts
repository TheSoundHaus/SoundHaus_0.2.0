import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjectActions } from './useProjectActions'

export function useMenuActions() {
    const { handleAbletonImport, handleExistingProject } = useProjectActions()
    const navigate = useNavigate()

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
            }
        };

        window.electron?.onMenuAction(handler);

        return () => {
            window.electron?.removeMenuActionListener();
        };
    }, [handleAbletonImport, handleExistingProject, navigate]);
}

export default useMenuActions;
