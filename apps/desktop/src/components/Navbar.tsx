import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Home, FolderOpen, Plus, X } from 'lucide-react'
import OpenProjectDialog from './OpenProjectDialog'
import { useProjectActions } from '../hooks/useProjectActions'

interface ProjectTab {
    path: string
    name: string
}

const Navbar = () => {
    const { setupAbletonFolderAsSoundHaus } = useProjectActions()
    const location = useLocation()
    const navigate = useNavigate()
    const [tabs, setTabs] = useState<ProjectTab[]>([])
    const [activeTabPath, setActiveTabPath] = useState<string | null>(null)
    const [isDialogOpen, setIsDialogOpen] = useState(false)

    // Auto-add tab when navigating to /project with a projectPath
    useEffect(() => {
        if (location.pathname === '/project') {
            const projectPath = (location.state as any)?.projectPath || null
            if (projectPath) {
                setActiveTabPath(projectPath)
                setTabs(prev => {
                    if (prev.some(t => t.path === projectPath)) return prev
                    const name = projectPath.split(/[\\/]/).filter(Boolean).pop() || 'Project'
                    return [...prev, { path: projectPath, name }]
                })
            }
        }
    }, [location.pathname, location.state])

    // Hide on login and modal dialog windows (same shell as main app)
    const DIALOG_ROUTES = new Set(['/', '/project-setup', '/clone-url', '/about'])
    if (DIALOG_ROUTES.has(location.pathname)) return null

    const isHome = location.pathname === '/home'

    const switchToTab = (tab: ProjectTab) => {
        setActiveTabPath(tab.path)
        navigate('/project', { state: { projectPath: tab.path } })
    }

    const closeTab = (e: React.MouseEvent, tab: ProjectTab) => {
        e.stopPropagation()
        setTabs(prev => {
            const remaining = prev.filter(t => t.path !== tab.path)
            // If closing the active tab, navigate somewhere
            if (tab.path === activeTabPath) {
                if (remaining.length > 0) {
                    const next = remaining[remaining.length - 1]
                    setActiveTabPath(next.path)
                    navigate('/project', { state: { projectPath: next.path } })
                } else {
                    setActiveTabPath(null)
                    navigate('/home')
                }
            }
            return remaining
        })
    }

    /** Assumes `projectPath` was already validated as a SoundHaus project (see OpenProjectDialog). */
    const openProject = async (projectPath: string): Promise<boolean> => {
        const name = projectPath.split(/[\\/]/).filter(Boolean).pop() || 'Project'
        await window.electron?.setLastProjectPath(projectPath)
        await window.electron?.addRecentProject(projectPath, name)
        navigate('/project', { state: { projectPath } })
        return true
    }

    return (
        <nav className="relative flex items-end gap-1 px-4 h-10 bg-bg-secondary border-b border-border-default shrink-0">
            <button
                onClick={() => navigate('/home')}
                className={`no-drag flex items-center gap-1.5 px-3 mb-[-1px] pb-2 pt-1.5 text-sm cursor-pointer transition-colors duration-150 ${
                    isHome
                        ? 'text-accent border-b border-accent'
                        : 'text-text-secondary hover:text-text-primary border-b border-transparent'
                }`}
            >
                <Home size={15} />
                <span>Home</span>
            </button>

            {tabs.length > 0 && (
                <div className="w-px h-5 bg-border-default mx-1 self-center shrink-0" />
            )}

            {tabs.map(tab => {
                const isActive = location.pathname === '/project' && tab.path === activeTabPath
                return (
                    <button
                        key={tab.path}
                        onClick={() => switchToTab(tab)}
                        className={`no-drag group flex items-center gap-1.5 px-3 mb-[-1px] pb-2 pt-1.5 text-sm cursor-pointer transition-colors duration-150 ${
                            isActive
                                ? 'text-accent border border-accent/30 border-b-bg-primary rounded-t-md bg-bg-primary shadow-[2px_0_8px_-2px_rgba(167,199,231,0.15)]'
                                : 'text-text-secondary hover:text-text-primary border border-transparent'
                        }`}
                    >
                        <FolderOpen size={14} />
                        <span className="max-w-32 truncate">{tab.name}</span>
                        <span
                            onClick={(e) => closeTab(e, tab)}
                            className="ml-1 opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-text-primary transition-opacity duration-150"
                        >
                            <X size={12} />
                        </span>
                    </button>
                )
            })}

            <button
                onClick={() => setIsDialogOpen(true)}
                className="no-drag flex items-center justify-center w-7 h-7 self-center rounded-md text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary cursor-pointer transition-colors duration-150"
                title="Open project"
            >
                <Plus size={16} />
            </button>

            <OpenProjectDialog
                isOpen={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                onSelectProject={openProject}
                onSetupAbletonFolderAsSoundHaus={setupAbletonFolderAsSoundHaus}
            />
        </nav>
    )
}

export default Navbar
