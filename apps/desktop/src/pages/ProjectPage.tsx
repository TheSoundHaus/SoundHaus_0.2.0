import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronDown, ChevronRight, RefreshCw, ArrowDownToLine, Save, ArrowUpFromLine, Music, AlertTriangle, CheckCircle } from 'lucide-react'
import { useAlsParser } from '../hooks/useAlsParser'
import useElectronIPC from '../hooks/useElectronIPC'
import { useProjectGitActions } from '../hooks/useProjectGitActions'
import electronAPI from '../services/electronAPI';

const ProjectPage = () => {
    const location = useLocation();
    const selectedProject = (location.state as any)?.projectPath || null

    const [alsStruct, setAlsStruct] = useState<any | null>(null)
    const [showTrackInfo, setShowTrackInfo] = useState<boolean>(false)
    const [showChanges, setShowChanges] = useState<boolean>(true)
    const [refreshing, setRefreshing] = useState(false)

    const { findAndParse } = useAlsParser()
    const { findAls } = useElectronIPC()
    const { runPull, runCommit, runPush } = useProjectGitActions()

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
        try {
            const result = await runPull(selectedProject)
            alert(`Pull complete:\n${result}`)
            await handleRefreshChanges()
        } catch (error) {
            alert(`Pull failed:\n${error}`)
        }
    }

    const handleGitCommit = async () => {
        if (!selectedProject) return
        try {
            const result = await runCommit(selectedProject)
            alert(`Commit complete:\n${result}`)
            setAlsStruct((prev: any) => prev ? { ...prev, diffStatus: 'in-sync', summary: '' } : prev)
        } catch (error) {
            alert(`Commit failed:\n${error}`)
        }
    }

    const handleGitPush = async () => {
        if (!selectedProject) return
        try {
            const result = await runPush(selectedProject)
            alert(`Push complete:\n${result}`)
            await handleRefreshChanges()
        } catch (error) {
            alert(`Push failed:\n${error}`)
        }
    }

    useEffect(() => {
        handleRefreshChanges()
    }, [handleRefreshChanges])

    useEffect(() => {
        const onRefreshRequest = (event: Event) => {
            const customEvent = event as CustomEvent<{ projectPath?: string }>
            if (!selectedProject) return
            if (customEvent.detail?.projectPath !== selectedProject) return
            void handleRefreshChanges()
        }

        window.addEventListener('soundhaus:project-refresh-request', onRefreshRequest)
        return () => window.removeEventListener('soundhaus:project-refresh-request', onRefreshRequest)
    }, [handleRefreshChanges, selectedProject])

    const projectName = selectedProject?.split(/[\\/]/).pop() || 'Project'

    return (
        <div className="flex w-full h-screen bg-bg-primary text-text-primary overflow-hidden animate-fade-in">
            {/* Left panel — track info + changes */}
            <div className="flex-1 flex flex-col overflow-y-auto p-5 space-y-3">
                {/* Project title */}
                <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10">
                        <Music className="w-4 h-4 text-accent" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold text-text-primary truncate">{projectName}</h1>
                        <p className="text-xs text-text-tertiary truncate max-w-xs">{selectedProject}</p>
                    </div>
                </div>

                {/* Track Information */}
                <div className="rounded-xl border border-border-default overflow-hidden">
                    <button
                        onClick={() => setShowTrackInfo(s => !s)}
                        aria-expanded={showTrackInfo}
                        className="w-full flex items-center justify-between px-4 py-3 bg-bg-elevated
                                   text-sm font-medium text-text-secondary hover:bg-bg-tertiary/60
                                   transition-colors duration-200 cursor-pointer"
                    >
                        <span className="flex items-center gap-2">
                            {showTrackInfo ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            Track Information
                        </span>
                    </button>
                    {showTrackInfo && (
                        <div className="p-4 bg-bg-secondary border-t border-border-subtle">
                            {alsStruct == null ? (
                                <p className="text-sm text-text-tertiary">No ALS loaded</p>
                            ) : alsStruct.ok === false ? (
                                <div className="flex items-center gap-2 text-sm text-error">
                                    <AlertTriangle className="w-4 h-4 shrink-0" />
                                    <span>{alsStruct.reason ?? 'An error occurred'}</span>
                                </div>
                            ) : alsStruct.project?.Tracks ? (
                                <div className="space-y-2">
                                    {alsStruct.project.Tracks.map((track: any, i: number) => (
                                        <div key={i} className="px-3 py-2.5 rounded-lg bg-bg-primary/60 border border-border-subtle">
                                            <div className="text-sm font-medium text-text-primary">
                                                {track.EffectiveName || 'Unnamed Track'}
                                            </div>
                                            <div className="text-xs text-text-tertiary mt-0.5">
                                                {track.Type} · ID {track.Id}
                                                {track.UserName && ` · ${track.UserName}`}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-text-tertiary">No tracks found</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Changes */}
                <div className="rounded-xl border border-border-default overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-bg-elevated">
                        <button
                            onClick={() => setShowChanges(s => !s)}
                            aria-expanded={showChanges}
                            className="flex items-center gap-2 text-sm font-medium text-text-secondary
                                       hover:text-text-primary transition-colors duration-200 cursor-pointer"
                        >
                            {showChanges ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            Changes
                        </button>
                        <button
                            onClick={handleRefreshChanges}
                            disabled={refreshing}
                            className="flex items-center justify-center w-7 h-7 rounded-lg
                                       text-text-tertiary hover:text-accent hover:bg-accent/10
                                       disabled:opacity-40 disabled:cursor-not-allowed
                                       transition-all duration-200 cursor-pointer"
                            title="Compare with remote HEAD"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin-slow' : ''}`} />
                        </button>
                    </div>
                    {showChanges && (
                        <div className="p-4 bg-bg-secondary border-t border-border-subtle">
                            {alsStruct == null ? (
                                <p className="text-sm text-text-tertiary">No ALS loaded</p>
                            ) : alsStruct.ok === false ? (
                                <div className="flex items-center gap-2 text-sm text-error">
                                    <AlertTriangle className="w-4 h-4 shrink-0" />
                                    <span>{alsStruct.reason ?? 'An error occurred'}</span>
                                </div>
                            ) : alsStruct.baselineStatus === 'no-commits' ? (
                                <p className="text-sm text-text-tertiary">No snapshots yet — this will be the initial snapshot.</p>
                            ) : alsStruct.diffStatus === 'in-sync' ? (
                                <div className="flex items-center gap-2 text-sm text-success">
                                    <CheckCircle className="w-4 h-4" />
                                    <span>In sync with last snapshot</span>
                                </div>
                            ) : alsStruct.diffStatus === 'has-changes' ? (
                                <div className="diff-panel rounded-lg p-3">
                                    {alsStruct.summary.split('\n').map((line: string, i: number) => (
                                        <div key={i} className="text-sm text-text-secondary py-0.5 font-mono">{line}</div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-text-tertiary">Press ↻ to compare with last snapshot</p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Right panel — git actions */}
            <div className="w-56 shrink-0 flex flex-col gap-2.5 p-5 border-l border-border-subtle bg-bg-secondary/50">
                <h2 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1">Actions</h2>
                <button
                    onClick={handleGitPull}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 rounded-xl text-sm font-medium
                               bg-bg-elevated border border-border-default text-text-primary
                               hover:border-accent/30 hover:bg-bg-tertiary/60
                               transition-all duration-200 cursor-pointer"
                >
                    <ArrowDownToLine className="w-4 h-4 text-accent" />
                    Pull Changes
                </button>
                <button
                    onClick={handleGitCommit}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 rounded-xl text-sm font-medium
                               btn-brand transition-all duration-200 cursor-pointer"
                >
                    <Save className="w-4 h-4" />
                    Save Snapshot
                </button>
                <button
                    onClick={handleGitPush}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 rounded-xl text-sm font-medium
                               bg-bg-elevated border border-border-default text-text-primary
                               hover:border-accent/30 hover:bg-bg-tertiary/60
                               transition-all duration-200 cursor-pointer"
                >
                    <ArrowUpFromLine className="w-4 h-4 text-accent" />
                    Push Changes
                </button>
            </div>
        </div>
    )
}

export default ProjectPage;
