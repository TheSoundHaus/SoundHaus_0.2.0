import { useNavigate } from 'react-router-dom'
import { useElectronIPC } from '../hooks/useElectronIPC'
import { Download, Globe, FolderOpen, Music, Plus, LogOut } from 'lucide-react'

/** Subtle waveform SVG decoration for background */
const WaveDecoration = () => (
    <div className="absolute bottom-0 left-0 right-0 h-32 overflow-hidden opacity-[0.04] pointer-events-none">
        <svg className="w-[200%] h-full" viewBox="0 0 1200 100" preserveAspectRatio="none"
            style={{ animation: 'waveform 12s linear infinite' }}>
            <path d="M0,50 C50,20 100,80 150,50 C200,20 250,80 300,50 C350,20 400,80 450,50 C500,20 550,80 600,50 C650,20 700,80 750,50 C800,20 850,80 900,50 C950,20 1000,80 1050,50 C1100,20 1150,80 1200,50"
                fill="none" stroke="#A7C7E7" strokeWidth="2" />
        </svg>
    </div>
);

/** Small equalizer animation for the header logo */
const MiniEqualizer = () => (
    <div className="flex items-end gap-[2px] h-3">
        {[0, 0.2, 0.1].map((delay, i) => (
            <div key={i} className="w-[2px] rounded-full bg-accent/50 origin-bottom animate-eq-bar"
                style={{ animationDelay: `${delay}s`, height: '100%' }} />
        ))}
    </div>
);

const HomePage = () => {
    const { chooseFolder, hasGitFile, initRepo, showProjectSetup, cloneRepo, showCloneUrl } = useElectronIPC()
    const navigate = useNavigate()

    const handleProjectClone = async () => {
        try {
            // Step 1: Show clone URL + path dialog
            const cloneData = await showCloneUrl();
            if (!cloneData) {
                // User cancelled the dialog
                return;
            }

            const cloneUrl = cloneData.url;
            const folder = cloneData.path;
            
            if (!cloneUrl.trim() || !folder.trim()) {
                alert('Please enter both repository URL and local path');
                return;
            }

            // Step 2: Perform the clone
            try {
                console.log('Cloning from:', cloneUrl);
                console.log('Cloning to:', folder);
                const clonedPath = await cloneRepo(cloneUrl, folder);
                alert(`Clone complete:\n${clonedPath}`);

                // Step 3: Verify .git folder was created in the cloned repo
                const git = await hasGitFile(clonedPath);
                if (git) {
                    // Step 4: Navigate to project page
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

    const handleLogout = async () => {
        try {
            await window.patService?.setSoundHausCredentials('');
            await window.patService?.setGiteaCredentials('');
            navigate('/');
        } catch (err) {
            console.error('Logout error:', err);
            navigate('/');
        }
    }

    const actions = [
        {
            icon: Download,
            label: 'Clone Project',
            description: 'Clone an Ableton project from the server',
            onClick: handleProjectClone,
            accent: true,
        },
        {
            icon: Globe,
            label: 'Explore Server',
            description: 'Browse projects available on the server',
            onClick: handleServerExplore,
        },
        {
            icon: Plus,
            label: 'Import Project',
            description: 'Import an existing Ableton project folder',
            onClick: handleAbletonImport,
        },
        {
            icon: FolderOpen,
            label: 'Open Existing',
            description: 'Open a SoundHaus project on your machine',
            onClick: handleExistingProject,
        },
    ]

    return (
        <div className="flex flex-col w-full h-screen bg-bg-primary overflow-hidden relative">
            {/* Background decorations */}
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-accent/[0.04] blur-3xl pointer-events-none" />
            <WaveDecoration />

            {/* Top bar with subtle drag region */}
            <div className="flex items-center justify-between px-5 pt-5 pb-2 drag-region relative z-10">
                <div className="flex items-center gap-2.5 no-drag">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10 shadow-inner-glow">
                        <Music className="w-4 h-4 text-accent" />
                    </div>
                    <span className="text-sm font-medium text-text-secondary">SoundHaus</span>
                    <MiniEqualizer />
                </div>
                <button
                    onClick={handleLogout}
                    className="no-drag flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-tertiary
                               hover:text-text-secondary hover:bg-bg-tertiary/40
                               transition-all duration-200 cursor-pointer"
                >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                </button>
            </div>

            {/* Main content area */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8 relative z-10">
                {/* Hero text */}
                <div className="text-center mb-8 animate-fade-in">
                    <h1 className="text-3xl font-semibold tracking-tight text-gradient mb-2">
                        Let's get started
                    </h1>
                    <p className="text-sm text-text-tertiary">
                        Add a SoundHaus project to begin collaborating
                    </p>
                </div>

                {/* Action cards grid */}
                <div className="grid grid-cols-2 gap-3 w-full max-w-md">
                    {actions.map((action, i) => (
                        <button
                            key={action.label}
                            onClick={action.onClick}
                            className={`group relative flex flex-col items-start gap-3 p-4 rounded-2xl
                                       border transition-all duration-250 cursor-pointer text-left
                                       animate-slide-up
                                       ${action.accent
                                           ? 'glass-panel-heavy border-accent/20 hover:border-accent/40 hover:shadow-glow'
                                           : 'glass-panel hover:border-border-default/80 hover:bg-bg-glass-heavy'
                                       }
                                       active:scale-[0.97]`}
                            style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'both' }}
                        >
                            <div className={`flex items-center justify-center w-10 h-10 rounded-xl
                                            transition-colors duration-200
                                            ${action.accent
                                                ? 'bg-accent/15 text-accent group-hover:bg-accent/25'
                                                : 'bg-bg-elevated text-text-secondary group-hover:text-text-primary'
                                            }`}
                            >
                                <action.icon className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="text-sm font-medium text-text-primary">
                                    {action.label}
                                </div>
                                <div className="text-xs text-text-tertiary mt-0.5 leading-relaxed">
                                    {action.description}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default HomePage;