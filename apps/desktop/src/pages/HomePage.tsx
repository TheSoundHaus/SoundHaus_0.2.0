import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Waves, FolderOpen, Download, Globe, Music } from 'lucide-react'
import { useProjectActions } from '../hooks/useProjectActions'
import OpenProjectDialog from '../components/OpenProjectDialog'

const HomePage = () => {
    console.log('[SoundHaus] HomePage: rendering')
    const location = useLocation()
    const navigate = useNavigate()
    const { 
        handleProjectClone, 
        handleServerExplore, 
        handleAbletonImport, 
        handleOpenSoundHausProject,
        handleSelectFromDialog,
        handleOpenFromFilepath,
        isOpenDialogVisible,
        setIsOpenDialogVisible,
    } = useProjectActions()

    // Open dialog if triggered from menu, then clear state to prevent re-opening on back
    useEffect(() => {
        if ((location.state as { openProjectDialog?: boolean })?.openProjectDialog) {
            setIsOpenDialogVisible(true)
            navigate(location.pathname, { replace: true, state: {} })
        }
    }, [location.state, navigate])

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
            label: 'Open Existing',
            description: 'Open a SoundHaus-tracked project folder',
            onClick: handleOpenSoundHausProject,
        },
    ]

    return (
        <div className="flex flex-col items-center justify-center w-full h-screen bg-bg-primary p-8 relative overflow-hidden">
            {/* Dual ambient radial glows */}
            <div className="absolute top-1/4 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px]
                            bg-accent/[0.05] rounded-full blur-[150px] pointer-events-none" />
            <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px]
                            bg-accent/[0.03] rounded-full blur-[120px] pointer-events-none" />
            <div className="w-full max-w-lg animate-fade-in relative z-10">
                {/* Header */}
                <div className="flex flex-col items-center mb-10">
                    <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-accent/10 mb-5
                                    shadow-[0_0_40px_rgba(167,199,231,0.1),0_0_80px_rgba(167,199,231,0.04)]">
                        <Waves className="w-7 h-7 text-accent" />
                    </div>
                    <h1 className="text-2xl font-bold text-text-primary mb-1.5 tracking-tight">Let&apos;s get started</h1>
                    <p className="text-sm text-text-secondary">Add a SoundHaus project to begin</p>
                </div>

                {/* Action cards */}
                <div className="grid grid-cols-2 gap-3.5">
                    {actions.map((action, index) => (
                        <button
                            key={action.label}
                            onClick={action.onClick}
                            className="group flex flex-col items-start gap-3.5 p-5 rounded-2xl
                                       glass-panel glass-hover-lift glass-accent-glow
                                       text-left cursor-pointer"
                            style={{ animationDelay: `${index * 80}ms` }}
                        >
                            <div className="flex items-center justify-center w-10 h-10 rounded-xl
                                            bg-accent/8 group-hover:bg-accent/15
                                            shadow-[0_0_0_1px_rgba(167,199,231,0.06)]
                                            transition-all duration-300">
                                <action.icon className="w-5 h-5 text-accent" />
                            </div>
                            <div>
                                <div className="text-sm font-semibold text-text-primary mb-1
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
                onOpenFromFilepath={handleOpenFromFilepath}
            />
        </div>
    )
}

export default HomePage;
