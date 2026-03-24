import { useState, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAlsParser } from '../hooks/useAlsParser'
import useElectronIPC from '../hooks/useElectronIPC'
import gitService from '../services/gitService'
import electronAPI from '../services/electronAPI'
import {
    ChevronDown,
    ChevronRight,
    RefreshCw,
    Download,
    Save,
    Upload,
    Music,
    ArrowLeft,
    AudioLines,
    CheckCircle2,
    AlertCircle,
    FileQuestion,
} from 'lucide-react'

const ProjectPage = () => {
    const location = useLocation()
    const navigate = useNavigate()
    const initialPath = (location.state as any)?.projectPath || null

    const [alsStruct, setAlsStruct] = useState<any | null>(null)
    const [selectedProject] = useState<string | null>(initialPath)
    const [showTrackInfo, setShowTrackInfo] = useState<boolean>(false)
    const [showChanges, setShowChanges] = useState<boolean>(true)

    const [, setPulling] = useState(false)
    const [, setPushing] = useState(false)
    const [, setComitting] = useState(false)
    const [refreshing, setRefreshing] = useState(false)

    const { findAndParse } = useAlsParser()
    const { findAls } = useElectronIPC()

    const projectName = selectedProject?.split('/').pop() || 'Project'

    const handleRefreshChanges = useCallback(async () => {
        if (!selectedProject) return

        setRefreshing(true)
        if (typeof findAls !== 'function') {
            console.warn('findAls is not available from useElectronIPC')
            setAlsStruct(null)
            return
        }

        findAndParse(selectedProject)

        try {
            const alsPath = await findAls(selectedProject)
            if (!alsPath) {
                setAlsStruct({ ok: false, reason: 'No ALS file found' })
                return
            }

            const result = await electronAPI.getChanges(alsPath)
            setAlsStruct(result)
        } catch (e) {
            setAlsStruct({ ok: false, reason: e instanceof Error ? e.message : String(e) })
        } finally {
            setRefreshing(false)
        }
    }, [findAls, findAndParse, selectedProject])

    const handleGitPull = async () => {
        if (!selectedProject) return
        setPulling(true)
        try {
            const result = await gitService.pullRepo(selectedProject)
            alert(`Pull complete:\n${result}`)
            await handleRefreshChanges()
        } catch (error) {
            alert(`Pull failed:\n${error}`)
        } finally {
            setPulling(false)
        }
    }

    const handleGitCommit = async () => {
        if (!selectedProject) return
        setComitting(true)
        try {
            const result = await gitService.commitChange(selectedProject)
            alert(`Commit complete:\n${result}`)
            setAlsStruct((prev: any) => prev ? { ...prev, diffStatus: 'in-sync', summary: '' } : prev)
        } catch (error) {
            alert(`Commit failed:\n${error}`)
        } finally {
            setComitting(false)
        }
    }

    const handleGitPush = async () => {
        if (!selectedProject) return
        setPushing(true)
        try {
            const result = await gitService.pushRepo(selectedProject)
            alert(`Push complete:\n${result}`)
            await handleRefreshChanges()
        } catch (error) {
            alert(`Push failed:\n${error}`)
        } finally {
            setPushing(false)
        }
    }

    useEffect(() => {
        handleRefreshChanges()
    }, [handleRefreshChanges])

    // Determine sync status
    const getSyncStatus = () => {
        if (!alsStruct) return null
        if (alsStruct.ok === false) return 'error'
        if (alsStruct.baselineStatus === 'no-commits') return 'new'
        if (alsStruct.diffStatus === 'in-sync') return 'synced'
        if (alsStruct.diffStatus === 'has-changes') return 'changed'
        return null
    }

    const syncStatus = getSyncStatus()

    // Parse diff lines
    const parseDiffLines = (summary: string) => {
        if (!summary) return []
        return summary.split('\n').filter(Boolean).map((line: string) => {
            const isAdded = line.startsWith('+ ') || line.trimStart().startsWith('added:')
            const isRemoved = line.startsWith('- ') || line.trimStart().startsWith('removed:')
            const isChild = line.startsWith('  ')
            return { text: line, isAdded, isRemoved, isChild }
        })
    }

    return (
        <div className="page-full">
            {/* Toolbar */}
            <div className="toolbar">
                <button
                    onClick={() => navigate('/home')}
                    className="icon-btn"
                    title="Back to home"
                >
                    <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="w-px h-5" style={{ background: 'var(--border)' }} />
                <Music className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                <span
                    className="text-sm font-medium truncate flex-1"
                    style={{ color: 'var(--text-primary)' }}
                >
                    {projectName}
                </span>
                {syncStatus && (
                    <div className="flex items-center gap-1.5">
                        <div className={`status-dot ${
                            syncStatus === 'synced' ? 'status-synced' :
                            syncStatus === 'changed' ? 'status-changed' :
                            syncStatus === 'error' ? 'status-error' :
                            ''
                        }`}
                            style={syncStatus === 'new' ? { background: 'var(--accent)' } : undefined}
                        />
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {syncStatus === 'synced' ? 'In sync' :
                             syncStatus === 'changed' ? 'Changes detected' :
                             syncStatus === 'new' ? 'New project' :
                             syncStatus === 'error' ? 'Error' : ''}
                        </span>
                    </div>
                )}
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
                {/* Track Information disclosure */}
                <div className="disclosure">
                    <button
                        className="disclosure-button"
                        onClick={() => setShowTrackInfo(s => !s)}
                        aria-expanded={showTrackInfo}
                    >
                        <div className="flex items-center gap-2">
                            {showTrackInfo
                                ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                                : <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                            }
                            <AudioLines className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                            <span>Track Information</span>
                        </div>
                        {alsStruct?.project?.Tracks && (
                            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                {alsStruct.project.Tracks.length} tracks
                            </span>
                        )}
                    </button>
                    {showTrackInfo && (
                        <div className="disclosure-panel">
                            {alsStruct == null ? (
                                <div className="flex items-center gap-2 text-sm py-2" style={{ color: 'var(--text-tertiary)' }}>
                                    <FileQuestion className="w-4 h-4" />
                                    No ALS loaded
                                </div>
                            ) : alsStruct.ok === false ? (
                                <div className="flex items-center gap-2 text-sm py-2" style={{ color: 'var(--color-error)' }}>
                                    <AlertCircle className="w-4 h-4" />
                                    {alsStruct.reason ?? 'An error occurred'}
                                </div>
                            ) : alsStruct.project?.Tracks ? (
                                <div className="flex flex-col gap-2">
                                    {alsStruct.project.Tracks.map((track: any, i: number) => (
                                        <div key={i} className="track-card">
                                            <div
                                                className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
                                                style={{ background: 'var(--accent-bg)' }}
                                            >
                                                <AudioLines className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                                    {track.EffectiveName || 'Unnamed Track'}
                                                </div>
                                                <div className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                                                    {track.Type}
                                                    {track.UserName && ` / ${track.UserName}`}
                                                    <span className="ml-2 font-mono opacity-60" style={{ color: 'var(--accent)' }}>
                                                        #{track.Id}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-sm py-2" style={{ color: 'var(--text-tertiary)' }}>
                                    <FileQuestion className="w-4 h-4" />
                                    No tracks found
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Changes disclosure */}
                <div className="disclosure">
                    <button
                        className="disclosure-button"
                        onClick={() => setShowChanges(s => !s)}
                        aria-expanded={showChanges}
                    >
                        <div className="flex items-center gap-2">
                            {showChanges
                                ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                                : <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                            }
                            <RefreshCw className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                            <span>Changes</span>
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                handleRefreshChanges()
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    handleRefreshChanges()
                                }
                            }}
                            className="icon-btn"
                            disabled={refreshing}
                            title="Compare with remote HEAD"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 transition-transform ${refreshing ? 'animate-spin' : ''}`} />
                        </button>
                    </button>
                    {showChanges && (
                        <div className="disclosure-panel">
                            {alsStruct == null ? (
                                <div className="flex items-center gap-2 text-sm py-2" style={{ color: 'var(--text-tertiary)' }}>
                                    <FileQuestion className="w-4 h-4" />
                                    No ALS loaded
                                </div>
                            ) : alsStruct.ok === false ? (
                                <div className="flex items-center gap-2 text-sm py-2" style={{ color: 'var(--color-error)' }}>
                                    <AlertCircle className="w-4 h-4" />
                                    {alsStruct.reason ?? 'An error occurred'}
                                </div>
                            ) : alsStruct.baselineStatus === 'no-commits' ? (
                                <div className="flex items-center gap-2 text-sm py-2" style={{ color: 'var(--text-secondary)' }}>
                                    <Music className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                                    No snapshots yet. This will be the initial snapshot.
                                </div>
                            ) : alsStruct.diffStatus === 'in-sync' ? (
                                <div className="flex items-center gap-2 text-sm py-2" style={{ color: 'var(--color-success)' }}>
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span>In sync with last snapshot</span>
                                </div>
                            ) : alsStruct.diffStatus === 'has-changes' ? (
                                <div className="flex flex-col gap-1">
                                    {parseDiffLines(alsStruct.summary).map((line: any, i: number) => (
                                        <div
                                            key={i}
                                            className={`diff-line ${
                                                line.isAdded ? 'diff-added' :
                                                line.isRemoved ? 'diff-removed' :
                                                'diff-modified'
                                            } ${line.isChild ? 'ml-4' : ''}`}
                                        >
                                            {line.text}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-sm py-2" style={{ color: 'var(--text-tertiary)' }}>
                                    <RefreshCw className="w-4 h-4" />
                                    Press refresh to compare with last snapshot
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Footer action bar (not fixed -- flex layout keeps it at bottom) */}
            <div className="footer-bar">
                <div className="flex gap-2.5 w-full max-w-md">
                    <button onClick={handleGitPull} className="btn btn-ghost flex-1 text-xs">
                        <Download className="w-4 h-4" />
                        Pull
                    </button>
                    <button onClick={handleGitCommit} className="btn btn-primary flex-1 text-xs">
                        <Save className="w-4 h-4" />
                        Snapshot
                    </button>
                    <button onClick={handleGitPush} className="btn btn-ghost flex-1 text-xs">
                        <Upload className="w-4 h-4" />
                        Push
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ProjectPage
