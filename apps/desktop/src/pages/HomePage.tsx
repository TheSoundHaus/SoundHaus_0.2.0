import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Waves, FolderOpen, Download, Globe, Music } from 'lucide-react'
import { useProjectActions } from '../hooks/useProjectActions'
import OpenProjectDialog from '../components/OpenProjectDialog'

const HomePage = () => {
    const location = useLocation()
    const navigate = useNavigate()
    const {
        handleProjectClone,
        handleServerExplore,
        handleAbletonImport,
        handleOpenSoundHausProject,
        handleSelectFromDialog,
        setupAbletonFolderAsSoundHaus,
        isOpenDialogVisible,
        setIsOpenDialogVisible,
    } = useProjectActions()
    // Open dialog if triggered from menu, then clear state to prevent re-opening on back
    useEffect(() => {
        if ((location.state as { openProjectDialog?: boolean })?.openProjectDialog) {
            setIsOpenDialogVisible(true)
            navigate(location.pathname, { replace: true, state: {} })
        }
    }, [location.state, navigate, setIsOpenDialogVisible])

    const actions = [
        {
            icon: Download,
            label: 'Clone Project',
            description: 'Clone an Ableton project from the server',
            onClick: handleProjectClone,
        },
        {
            icon: Globe,
            label: 'Explore',
            description: 'Browse public projects from the community',
            onClick: handleServerExplore,
        },
        {
            icon: Music,
            label: 'Import Ableton Project',
            description: 'Track an existing Ableton project with SoundHaus',
            onClick: handleAbletonImport,
        },
        {
            icon: FolderOpen,
            label: 'Open Project',
            description: 'Open a recent project or browse for one on your machine',
            onClick: handleOpenSoundHausProject,
        },
    ]

    return (
        <div className="flex flex-col items-center w-full h-screen bg-bg-primary p-8 overflow-y-auto">
            <div className="w-full max-w-lg my-auto animate-fade-in">
                {/* Header */}
                <div className="flex flex-col items-center mb-10">
                    <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-accent/10 mb-4
                                    shadow-[0_0_24px_rgba(167,199,231,0.08)]">
                        <Waves className="w-6 h-6 text-accent" />
                    </div>
                    <h1 className="text-2xl font-bold text-text-primary mb-1">Let&apos;s get started</h1>
                    <p className="text-sm text-text-secondary">Add a SoundHaus project to begin</p>
                </div>

                {/* Action cards — 2×2 grid */}
                <div className="grid grid-cols-2 gap-3">
                    {actions.map((action) => (
                        <button
                            key={action.label}
                            onClick={action.onClick}
                            className="group flex flex-col items-start gap-3 p-5 rounded-xl
                                       bg-bg-elevated border border-border-subtle
                                       hover:border-accent/30 hover:bg-bg-tertiary/60
                                       hover:shadow-[0_0_20px_rgba(167,199,231,0.06)]
                                       transition-all duration-300 text-left cursor-pointer"
                        >
                            <div className="flex items-center justify-center w-9 h-9 rounded-lg
                                            bg-accent/8 group-hover:bg-accent/15 transition-colors duration-300">
                                <action.icon className="w-4.5 h-4.5 text-accent" />
                            </div>
                            <div>
                                <div className="text-sm font-semibold text-text-primary mb-0.5
                                                group-hover:text-accent transition-colors duration-300">
                                    {action.label}
                                </div>
                                <div className="text-xs text-text-tertiary leading-relaxed">
                                    {action.description}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <OpenProjectDialog
                isOpen={isOpenDialogVisible}
                onClose={() => setIsOpenDialogVisible(false)}
                onSelectProject={handleSelectFromDialog}
                onSetupAbletonFolderAsSoundHaus={setupAbletonFolderAsSoundHaus}
            />
        </div>
    )
}

export default HomePage
