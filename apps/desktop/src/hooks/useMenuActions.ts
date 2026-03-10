import { useEffect } from 'react'
import { useProjectActions } from './useProjectActions'

export function useMenuActions() {
    const { handleAbletonImport, handleExistingProject } = useProjectActions()

    useEffect(() => {
        const handler = (action: string) => {
            switch (action) {
                case 'import-ableton':
                    handleAbletonImport();
                    break;
                case 'import-soundhaus':
                    handleExistingProject();
                    break;
            }
        };

        window.electron?.onMenuAction(handler);

        return () => {
            window.electron?.removeMenuActionListener();
        };
    }, [handleAbletonImport, handleExistingProject]);
}

export default useMenuActions;
