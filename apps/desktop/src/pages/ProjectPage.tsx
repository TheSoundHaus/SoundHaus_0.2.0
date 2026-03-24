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

    // Determine sync status for the header indicator
    const getSyncStatus = () => {
        if (!alsStruct) return null
        if (alsStruct.ok === false) return 'error'
        if (alsStruct.baselineStatus === 'no-commits') return 'new'
        if (alsStruct.diffStatus === 'in-sync') return 'synced'
        if (alsStruct.diffStatus === 'has-changes') return 'changed'
        return null
    }

    const syncStatus = getSyncStatus()

    // Parse diff lines into structured format
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
        <div className="flex flex-col min-h-screen">
            {/* Header bar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 glass-heavy">
                <button
                    onClick={() => navigate('/home')}
                    className="p-1.5 rounded-btn hover:bg-white/5 transition-colors"
                    title="Back to home"
                >
                    <ArrowLeft className="w-4 h-4 text-muted" />
                </button>
                <div className="w-px h-4 bg-white/8" />
                <Music className="w-4 h-4 text-glass-blue flex-shrink-0" />
                <span className="text-sm font-medium text-soft-white truncate flex-1">
                    {projectName}
                </span>
                {/* Sync indicator */}
                {syncStatus && (
                    <div className="flex items-center gap-1.5">
                        <div className={`status-dot ${
                            syncStatus === 'synced' ? 'status-synced' :
                            syncStatus === 'changed' ? 'status-changed' :
                            syncStatus === 'error' ? 'status-error' :
                            'bg-glass-blue'
                        }`} />
                        <span className="text-xs text-muted">
                            {syncStatus === 'synced' ? 'In sync' :
                             syncStatus === 'changed' ? 'Changes detected' :
                             syncStatus === 'new' ? 'New project' :
                             syncStatus === 'error' ? 'Error' : ''}
                        </span>
                    </div>
                )}
            </div>

            {/* Main content */}
            <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-3 scrollbar-thin">
                {/* Track Information disclosure */}
                <div className="disclosure">
                    <button
                        className="disclosure-button"
                        onClick={() => setShowTrackInfo(s => !s)}
                        aria-expanded={showTrackInfo}
                    >
                        <div className="flex items-center gap-2">
                            {showTrackInfo
                                ? <ChevronDown className="w-4 h-4 text-muted" />
                                : <ChevronRight className="w-4 h-4 text-muted" />
                            }
                            <AudioLines className="w-3.5 h-3.5 text-glass-blue" />
                            <span>Track Information</span>
                        </div>
                        {alsStruct?.project?.Tracks && (
                            <span className="text-xs text-muted">
                                {alsStruct.project.Tracks.length} tracks
                            </span>
                        )}
                    </button>
                    {showTrackInfo && (
                        <div className="disclosure-panel">
                            {alsStruct == null ? (
                                <div className="flex items-center gap-2 text-sm text-muted py-2">
                                    <FileQuestion className="w-4 h-4" />
                                    No ALS loaded
                                </div>
                            ) : alsStruct.ok === false ? (
                                <div className="flex items-center gap-2 text-sm text-error py-2">
                                    <AlertCircle className="w-4 h-4" />
                                    {alsStruct.reason ?? 'An error occurred'}
                                </div>
                            ) : alsStruct.project?.Tracks ? (
                                <div className="flex flex-col gap-2">
                                    {alsStruct.project.Tracks.map((track: any, i: number) => (
                                        <div key={i} className="track-card">
                                            <div className="w-8 h-8 rounded bg-glass-blue/8 flex items-center justify-center flex-shrink-0">
                                                <AudioLines className="w-3.5 h-3.5 text-glass-blue" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-medium text-soft-white truncate">
                                                    {track.EffectiveName || 'Unnamed Track'}
                                                </div>
                                                <div className="text-xs text-muted truncate">
                                                    {track.Type}
                                                    {track.UserName && ` / ${track.UserName}`}
                                                    <span className="ml-2 font-mono text-glass-cyan-500 opacity-60">#{track.Id}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-sm text-muted py-2">
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
                                ? <ChevronDown className="w-4 h-4 text-muted" />
                                : <ChevronRight className="w-4 h-4 text-muted" />
                            }
                            <RefreshCw className="w-3.5 h-3.5 text-glass-blue" />
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
                            className="p-1.5 rounded-btn hover:bg-white/5 transition-colors"
                            disabled={refreshing}
                            title="Compare with remote HEAD"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 text-muted transition-transform ${refreshing ? 'animate-spin' : ''}`} />
                        </button>
                    </button>
                    {showChanges && (
                        <div className="disclosure-panel">
                            {alsStruct == null ? (
                                <div className="flex items-center gap-2 text-sm text-muted py-2">
                                    <FileQuestion className="w-4 h-4" />
                                    No ALS loaded
                                </div>
                            ) : alsStruct.ok === false ? (
                                <div className="flex items-center gap-2 text-sm text-error py-2">
                                    <AlertCircle className="w-4 h-4" />
                                    {alsStruct.reason ?? 'An error occurred'}
                                </div>
                            ) : alsStruct.baselineStatus === 'no-commits' ? (
                                <div className="flex items-center gap-2 text-sm text-muted py-2">
                                    <Music className="w-4 h-4 text-glass-blue" />
                                    No snapshots yet. This will be the initial snapshot.
                                </div>
                            ) : alsStruct.diffStatus === 'in-sync' ? (
                                <div className="flex items-center gap-2 text-sm py-2">
                                    <CheckCircle2 className="w-4 h-4 text-success" />
                                    <span className="text-success">In sync with last snapshot</span>
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
                                <div className="flex items-center gap-2 text-sm text-muted py-2">
                                    <RefreshCw className="w-4 h-4" />
                                    Press refresh to compare with last snapshot
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Fixed footer action bar */}
            <div className="fixed bottom-0 left-0 right-0 glass-heavy border-t border-white/5 p-3 flex justify-center z-50">
                <div className="flex gap-2.5 w-full max-w-lg">
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

export default ProjectPage;