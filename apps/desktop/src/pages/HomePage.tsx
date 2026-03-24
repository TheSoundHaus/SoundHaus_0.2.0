import { useNavigate } from 'react-router-dom'
import { useElectronIPC } from '../hooks/useElectronIPC'
import { Download, Compass, Upload, FolderOpen, Music } from 'lucide-react'

const HomePage = () => {
    const { chooseFolder, hasGitFile, initRepo, showProjectSetup, cloneRepo, showCloneUrl } = useElectronIPC()
    const navigate = useNavigate()

    const handleProjectClone = async () => {
        try {
            const cloneData = await showCloneUrl();
            if (!cloneData) return;

            const cloneUrl = cloneData.url;
            const folder = cloneData.path;

            if (!cloneUrl.trim() || !folder.trim()) {
                alert('Please enter both repository URL and local path');
                return;
            }

            try {
                console.log('Cloning from:', cloneUrl);
                console.log('Cloning to:', folder);
                const clonedPath = await cloneRepo(cloneUrl, folder);
                alert(`Clone complete:\n${clonedPath}`);

                const git = await hasGitFile(clonedPath);
                if (git) {
                    navigate('/project', { state: { projectPath: clonedPath } });
                } else {
                    alert('Warning: .git folder not found. The clone may have failed.');
                }
            } catch (error) {
                alert(`Clone failed:\n${error}`);
            }
        } catch (error) {
            console.error('Error in handleProjectClone:', error);
            alert(`An error occurred:\n${error}`);
        }
    }

    const handleServerExplore = async () => {
        window.open("http://www.rickleinecker.com/", "_blank");
    }

    const handleAbletonImport = async () => {
        const folder = await chooseFolder();
        if (folder) {
            const projectInfo = await showProjectSetup();
            if (!projectInfo) return;

            try {
                const result = await initRepo(folder, projectInfo);
                alert(`Init complete:\n${result}`)
            } catch (error) {
                alert(`Init failed:\n${error}`)
            }

            const git = await hasGitFile(folder);
            if (git) {
                navigate('/project', { state: { projectPath: folder } });
            }
        }
    }

    const handleExistingProject = async () => {
        const folder = await chooseFolder();
        if (folder) {
            const git = await hasGitFile(folder);
            if (git) {
                navigate('/project', { state: { projectPath: folder } });
            }
        }
    }

    const actions = [
        {
            icon: Download,
            title: 'Clone Project',
            description: 'Download an existing SoundHaus project from the server',
            onClick: handleProjectClone,
        },
        {
            icon: Compass,
            title: 'Explore Projects',
            description: 'Browse public projects and discover collaborators',
            onClick: handleServerExplore,
        },
        {
            icon: Upload,
            title: 'Import Project',
            description: 'Import a local Ableton project into SoundHaus',
            onClick: handleAbletonImport,
        },
        {
            icon: FolderOpen,
            title: 'Open Project',
            description: 'Open an existing local SoundHaus project',
            onClick: handleExistingProject,
        },
    ]

    return (
        <div className="min-h-screen flex flex-col p-6 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
                <div className="w-8 h-8 rounded-lg bg-glass-blue/10 flex items-center justify-center">
                    <Music className="w-4 h-4 text-glass-blue" />
                </div>
                <div>
                    <h1 className="text-lg font-bold text-soft-white leading-tight">SoundHaus</h1>
                    <p className="text-xs text-muted">Choose an action to get started</p>
                </div>
            </div>

            {/* Action Grid */}
            <div className="grid grid-cols-2 gap-3 flex-1">
                {actions.map((action) => (
                    <button
                        key={action.title}
                        onClick={action.onClick}
                        className="card-interactive text-left group flex flex-col"
                    >
                        <div className="w-10 h-10 rounded-lg bg-glass-blue/8 flex items-center justify-center mb-3 transition-colors duration-300 group-hover:bg-glass-blue/15">
                            <action.icon className="w-5 h-5 text-glass-blue transition-colors duration-300" />
                        </div>
                        <h3 className="text-sm font-semibold text-soft-white mb-1 transition-colors duration-300 group-hover:text-glass-blue">
                            {action.title}
                        </h3>
                        <p className="text-xs text-muted leading-relaxed">
                            {action.description}
                        </p>
                    </button>
                ))}
            </div>
        </div>
    )
}

export default HomePage;