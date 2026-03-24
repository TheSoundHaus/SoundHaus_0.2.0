import { useNavigate } from 'react-router-dom';
import { Download, Upload, FolderOpen, Globe, Music } from 'lucide-react';

const HomePage = () => {
    const navigate = useNavigate();

    const handleClone = () => {
        window.electron?.openCloneDialog();
    };

    const handleImport = async () => {
        const result = await window.electron?.openProjectSetup();
        if (result?.projectPath) {
            navigate('/project', { state: { projectPath: result.projectPath } });
        }
    };

    const handleOpen = async () => {
        const projectPath = await window.electron?.selectProjectFolder();
        if (projectPath) {
            navigate('/project', { state: { projectPath } });
        }
    };

    const handleExplore = () => {
        window.electron?.openExternal('http://localhost:3000');
    };

    const actions = [
        {
            icon: Download,
            title: 'Clone Project',
            description: 'Download a project from the server',
            onClick: handleClone,
        },
        {
            icon: Globe,
            title: 'Explore',
            description: 'Browse public projects online',
            onClick: handleExplore,
        },
        {
            icon: Upload,
            title: 'Import Project',
            description: 'Import a local Ableton project',
            onClick: handleImport,
        },
        {
            icon: FolderOpen,
            title: 'Open Project',
            description: 'Open an existing local project',
            onClick: handleOpen,
        },
    ];

    return (
        <div className="page-full">
            {/* Toolbar */}
            <div className="toolbar">
                <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: 'var(--accent-bg)' }}
                >
                    <Music className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                </div>
                <span
                    className="text-sm font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                >
                    Sound<span className="text-brand">Haus</span>
                </span>
            </div>

            {/* Centered content */}
            <div className="flex-1 flex flex-col items-center justify-center p-6">
                <div className="w-full max-w-lg animate-fade-in">
                    <div className="mb-6">
                        <h2
                            className="text-xl font-semibold mb-1"
                            style={{ color: 'var(--text-primary)' }}
                        >
                            Welcome back
                        </h2>
                        <p
                            className="text-sm"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            Choose an action to get started
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {actions.map((action) => (
                            <button
                                key={action.title}
                                onClick={action.onClick}
                                className="card-interactive text-left"
                            >
                                <div
                                    className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
                                    style={{ background: 'var(--accent-bg)' }}
                                >
                                    <action.icon
                                        className="w-5 h-5"
                                        style={{ color: 'var(--accent)' }}
                                    />
                                </div>
                                <h3
                                    className="text-sm font-semibold mb-1"
                                    style={{ color: 'var(--text-primary)' }}
                                >
                                    {action.title}
                                </h3>
                                <p
                                    className="text-xs leading-relaxed"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    {action.description}
                                </p>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HomePage;
