import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Home, FolderOpen, Plus, X, Bell, CheckCircle, XCircle, Users, LogOut } from 'lucide-react'
import electronAPI from '../services/electronAPI'
import OpenProjectDialog from './OpenProjectDialog'
import { useProjectActions } from '../hooks/useProjectActions'

interface ProjectTab {
    path: string
    name: string
    isCollab?: boolean
}

interface PendingInvitation {
    id: string
    repo_name: string
    owner_username: string
    permission: string
    created_at: string
}

const Navbar = () => {
    const { setupAbletonFolderAsSoundHaus } = useProjectActions()
    const location = useLocation()
    const navigate = useNavigate()
    const [tabs, setTabs] = useState<ProjectTab[]>([])
    const [activeTabPath, setActiveTabPath] = useState<string | null>(null)
    const [isDialogOpen, setIsDialogOpen] = useState(false)

    // Notification bell state
    const [invitations, setInvitations] = useState<PendingInvitation[]>([])
    const [bellOpen, setBellOpen] = useState(false)
    const [respondingId, setRespondingId] = useState<string | null>(null)
    const bellRef = useRef<HTMLDivElement>(null)

    const fetchInvitations = useCallback(async () => {
        const result = await electronAPI.getPendingInvitations()
        if (result?.ok && Array.isArray(result.invitations)) {
            setInvitations(result.invitations)
        }
    }, [])

    // Poll invitations every 60s
    useEffect(() => {
        fetchInvitations()
        const interval = setInterval(fetchInvitations, 60_000)
        return () => clearInterval(interval)
    }, [fetchInvitations])

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
                setBellOpen(false)
            }
        }
        if (bellOpen) {
            document.addEventListener('mousedown', handleClickOutside)
        }
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [bellOpen])

    const handleAccept = async (id: string) => {
        setRespondingId(id)
        const result = await electronAPI.acceptInvitation(id)
        if (result?.ok) {
            await fetchInvitations()
        } else {
            alert(`Failed to accept invitation: ${result?.reason ?? 'Unknown error'}`)
        }
        setRespondingId(null)
    }

    const handleDecline = async (id: string) => {
        setRespondingId(id)
        const result = await electronAPI.declineInvitation(id)
        if (result?.ok) {
            await fetchInvitations()
        } else {
            alert(`Failed to decline invitation: ${result?.reason ?? 'Unknown error'}`)
        }
        setRespondingId(null)
    }

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
                // Check collaboration status for this tab
                electronAPI.checkIsCollaboration(projectPath).then(result => {
                    if (result?.ok && result.isCollaboration) {
                        setTabs(prev => prev.map(t =>
                            t.path === projectPath ? { ...t, isCollab: true } : t
                        ))
                    }
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
                        {tab.isCollab && (
                            <Users size={12} className="text-accent shrink-0" title="Collaboration" />
                        )}
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

            {/* Notification bell — pushed to right side */}
            <div className="ml-auto" />
            <div className="relative self-center" ref={bellRef}>
                <button
                    onClick={() => setBellOpen(prev => !prev)}
                    className="no-drag relative flex items-center justify-center w-7 h-7 rounded-md text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary cursor-pointer transition-colors duration-150"
                    title="Invitations"
                >
                    <Bell size={16} />
                    {invitations.length > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold min-w-[14px] h-3.5 rounded-full flex items-center justify-center px-0.5">
                            {invitations.length}
                        </span>
                    )}
                </button>

                {bellOpen && (
                    <div className="absolute right-0 top-full mt-1.5 w-72 z-50 rounded-xl border border-border-default bg-bg-elevated shadow-xl overflow-hidden">
                        <div className="px-3 py-2 border-b border-border-subtle flex items-center justify-between">
                            <span className="text-xs font-semibold text-text-secondary">Invitations</span>
                            <span className="text-[10px] text-text-tertiary">{invitations.length} pending</span>
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                            {invitations.length === 0 ? (
                                <div className="px-3 py-6 text-center">
                                    <Bell size={20} className="mx-auto mb-1.5 text-text-tertiary" />
                                    <p className="text-xs text-text-tertiary">No pending invitations</p>
                                </div>
                            ) : (
                                <div className="p-2 space-y-1.5">
                                    {invitations.map(inv => (
                                        <div key={inv.id} className="rounded-lg bg-bg-primary/60 border border-border-subtle p-2.5">
                                            <p className="text-xs text-text-primary leading-snug">
                                                <span className="font-medium text-accent">{inv.owner_username}</span>
                                                {' invited you to '}
                                                <span className="font-medium text-text-primary">{inv.repo_name}</span>
                                            </p>
                                            <span className="inline-block mt-1 text-[10px] text-text-tertiary uppercase tracking-wide">
                                                {inv.permission} access
                                            </span>
                                            <div className="mt-2 flex items-center gap-1.5">
                                                <button
                                                    onClick={() => handleAccept(inv.id)}
                                                    disabled={respondingId === inv.id}
                                                    className="flex items-center gap-1 rounded-md bg-green-600/20 border border-green-500/30 px-2.5 py-1 text-[11px] font-medium text-green-400 hover:bg-green-600/30 disabled:opacity-50 transition-colors cursor-pointer"
                                                >
                                                    <CheckCircle size={11} /> Accept
                                                </button>
                                                <button
                                                    onClick={() => handleDecline(inv.id)}
                                                    disabled={respondingId === inv.id}
                                                    className="flex items-center gap-1 rounded-md bg-red-600/20 border border-red-500/30 px-2.5 py-1 text-[11px] font-medium text-red-400 hover:bg-red-600/30 disabled:opacity-50 transition-colors cursor-pointer"
                                                >
                                                    <XCircle size={11} /> Decline
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Logout button */}
            <button
                onClick={async () => {
                    const result = await electronAPI.logout()
                    if (result.success) navigate('/')
                }}
                className="no-drag flex items-center justify-center w-7 h-7 self-center rounded-md text-text-tertiary hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors duration-150"
                title="Sign out"
            >
                <LogOut size={15} />
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
