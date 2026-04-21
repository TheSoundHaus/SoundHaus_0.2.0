import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import {
    ChevronDown, ChevronRight, RefreshCw, ArrowDownToLine, Save, ArrowUpFromLine,
    Music, AlertTriangle, CheckCircle, ExternalLink, History, GitCommit, Users,
    CornerUpLeft, Loader2,
} from 'lucide-react'
import { useAlsParser } from '../hooks/useAlsParser'
import useElectronIPC from '../hooks/useElectronIPC'
import WaveformSpinner from '../components/WaveformSpinner'
import { useProjectGitActions } from '../hooks/useProjectGitActions'
import type { CommitEntry, HeadStateOk, NoteDiff } from '../types'
import electronAPI from '../services/electronAPI';
import PianoRollCanvas from '../components/diff/PianoRollCanvas.tsx';
import { useToast } from '../components/ToastProvider'
import {
    notifyPullSuccess,
    notifyPullError,
    notifyCommitSuccess,
    notifyCommitError,
    notifyPushSuccess,
    notifyPushError,
} from '../utils/projectNotifications'

const ProjectPage = () => {
    console.log('[SoundHaus] ProjectPage: rendering')
    const location = useLocation();
    const selectedProject = (location.state as any)?.projectPath || null

    const [alsStruct, setAlsStruct] = useState<any | null>(null)
    const [showTrackInfo, setShowTrackInfo] = useState<boolean>(false)
    const [showChanges, setShowChanges] = useState<boolean>(true)
    const [showHistory, setShowHistory] = useState<boolean>(true)

    const [refreshing, setRefreshing] = useState(false)
    const [historyLoading, setHistoryLoading] = useState(false)
    const [history, setHistory] = useState<CommitEntry[]>([])
    const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
    const [selectedCommitSummary, setSelectedCommitSummary] = useState<string>('')
    const [selectedNoteDiff, setSelectedNoteDiff] = useState<NoteDiff | null>(null)
    const [openingAbleton, setOpeningAbleton] = useState(false)
    const [isCollaboration, setIsCollaboration] = useState(false)

    const [headState, setHeadState] = useState<HeadStateOk | null>(null)
    const [headStateLoading, setHeadStateLoading] = useState(false)
    const [loadVersionBusy, setLoadVersionBusy] = useState(false)
    const [returnLatestBusy, setReturnLatestBusy] = useState(false)
    const [showLoadConfirm, setShowLoadConfirm] = useState(false)

    const { findAndParse } = useAlsParser()
    const { findAls } = useElectronIPC()
    const { runPull, runCommit, runPush } = useProjectGitActions()
    const { showToast } = useToast()

    const commitDetailRef = useRef<HTMLDivElement>(null)

    const trackDiffs = selectedNoteDiff?.tracks ?? []
    const noteCounts = {
        added: trackDiffs.reduce((sum, track) => sum + track.added.length, 0),
        removed: trackDiffs.reduce((sum, track) => sum + track.removed.length, 0),
        adjusted: trackDiffs.reduce((sum, track) => sum + track.adjusted.length, 0),
    }
    const hasNoteChanges = (noteCounts.added + noteCounts.removed + noteCounts.adjusted) > 0

    const loadHeadState = useCallback(async () => {
        if (!selectedProject) {
            setHeadState(null)
            return
        }
        setHeadStateLoading(true)
        try {
            const result = await electronAPI.getHeadState(selectedProject)
            if (result.ok) {
                setHeadState({
                    headSha: result.headSha,
                    branchName: result.branchName,
                    detached: result.detached,
                    returnTarget: result.returnTarget,
                    timeTravelStashCount: result.timeTravelStashCount,
                })
            } else {
                setHeadState(null)
            }
        } catch {
            setHeadState(null)
        } finally {
            setHeadStateLoading(false)
        }
    }, [selectedProject])

    const handleLoadHistory = useCallback(async () => {
        if (!selectedProject) return
        setHistoryLoading(true)
        try {
            const commits = await electronAPI.getCommitHistory(selectedProject)
            setHistory(Array.isArray(commits) ? commits : [])
        } catch {
            setHistory([])
        } finally {
            setHistoryLoading(false)
        }
    }, [selectedProject])

    const handleSelectCommit = useCallback(async (hash: string) => {
        if (!selectedProject) return
        setSelectedCommit(hash)
        try {
            const alsPath = await findAls(selectedProject)
            if (!alsPath) {
                setSelectedCommitSummary('No ALS file found in this project.')
                setSelectedNoteDiff(null)
                return
            }
            const result = await electronAPI.getCommitDiff(selectedProject, hash, alsPath)
            if (!result?.ok) {
                setSelectedCommitSummary(result?.reason ?? 'Failed to load commit diff')
                setSelectedNoteDiff(null)
                return
            }
            setSelectedCommitSummary(result.summary ?? '')
            setSelectedNoteDiff(result.noteDiff ?? { tracks: [] })
        } catch (e) {
            setSelectedCommitSummary(e instanceof Error ? e.message : String(e))
            setSelectedNoteDiff(null)
        }
    }, [findAls, selectedProject])

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
            notifyPullSuccess(showToast, result)
            await handleRefreshChanges()
            await loadHeadState()
        } catch (error) {
            notifyPullError(showToast, error)
        }
    }

    const handleGitCommit = async () => {
        if (!selectedProject) return
        try {
            const result = await runCommit(selectedProject)
            notifyCommitSuccess(showToast, result)
            setAlsStruct((prev: any) => prev ? { ...prev, diffStatus: 'in-sync', summary: '' } : prev)
            await loadHeadState()
        } catch (error) {
            notifyCommitError(showToast, error)
        }
    }

    const handleGitPush = async () => {
        if (!selectedProject) return
        try {
            const result = await runPush(selectedProject)
            notifyPushSuccess(showToast, result)
            await handleRefreshChanges()
            await loadHeadState()
        } catch (error) {
            notifyPushError(showToast, error)
        }
    }

    const handleOpenLoadConfirm = () => {
        if (!selectedCommit || !selectedProject) return
        setShowLoadConfirm(true)
    }

    const handleConfirmLoadVersion = async () => {
        if (!selectedProject || !selectedCommit) return
        setLoadVersionBusy(true)
        try {
            const result = await electronAPI.checkoutCommit(selectedProject, selectedCommit)
            if (!result.ok) {
                showToast({
                    type: 'error',
                    title: 'Could not load version',
                    detail: result.reason,
                })
                return
            }
            setShowLoadConfirm(false)
            setHeadState(result.headState)
            if (result.stashMessage) {
                showToast({
                    type: 'success',
                    title: 'Stashed local changes',
                    detail: 'They will be restored when you return to latest.',
                })
            }
            showToast({
                type: 'success',
                title: 'Loaded version',
                detail: `Now at ${result.headState.headSha.slice(0, 7)} (detached HEAD)`,
            })
            await handleRefreshChanges()
            await handleLoadHistory()
        } catch (error) {
            showToast({
                type: 'error',
                title: 'Could not load version',
                detail: error instanceof Error ? error.message : String(error),
            })
        } finally {
            setLoadVersionBusy(false)
        }
    }

    const handleReturnToLatest = async () => {
        if (!selectedProject) return
        setReturnLatestBusy(true)
        try {
            const result = await electronAPI.returnToLatest(selectedProject)
            if (!result.ok) {
                showToast({
                    type: 'error',
                    title: 'Could not return to latest',
                    detail: result.reason,
                })
                if (result.stashPopFailed) {
                    showToast({
                        type: 'info',
                        title: 'Stash restore had a problem',
                        detail: result.stashPopReason ?? '',
                    })
                }
                return
            }
            setHeadState(result.headState)
            showToast({
                type: 'success',
                title: 'Returned to latest',
                detail: `On ${result.headState.branchName ?? 'branch'} @ ${result.headState.headSha.slice(0, 7)}`,
            })
            await handleRefreshChanges()
            await handleLoadHistory()
        } catch (error) {
            showToast({
                type: 'error',
                title: 'Could not return to latest',
                detail: error instanceof Error ? error.message : String(error),
            })
        } finally {
            setReturnLatestBusy(false)
        }
    }

    const handleOpenInAbleton = async () => {
        if (!selectedProject) return
        setOpeningAbleton(true)
        try {
            const result = await (window as any).electron.openAlsFile(selectedProject)
            if (!result.ok) {
                showToast({
                    type: 'error',
                    title: "Couldn't open in Ableton",
                    detail: result.error,
                })
            }
        } catch (error) {
            showToast({
                type: 'error',
                title: "Couldn't open file",
                detail: error instanceof Error ? error.message : String(error),
            })
        } finally {
            setOpeningAbleton(false)
        }
    }

    useEffect(() => {
        handleRefreshChanges()
    }, [handleRefreshChanges])

    useEffect(() => {
        handleLoadHistory()
    }, [handleLoadHistory])

    useEffect(() => {
        void loadHeadState()
    }, [loadHeadState])

    // Check if this project is a collaboration
    useEffect(() => {
        if (!selectedProject) return
        let cancelled = false
        electronAPI.checkIsCollaboration(selectedProject).then(result => {
            if (cancelled) return
            if (result?.ok) {
                setIsCollaboration(!!result.isCollaboration)
            }
        })
        return () => { cancelled = true }
    }, [selectedProject])

    // Scroll commit details into view when a commit is selected
    useEffect(() => {
        if (selectedCommit && commitDetailRef.current) {
            commitDetailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
    }, [selectedCommit])

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

    const atSelectedCommit =
        headState && selectedCommit ? headState.headSha === selectedCommit : false

    return (
        <div className="flex w-full h-full min-h-0 min-w-0 bg-bg-primary text-text-primary overflow-hidden animate-fade-in relative">
            {/* Main column: single vertical scroll for all content except Actions */}
            <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-5 space-y-3">
                {/* Project title */}
                <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10">
                        <Music className="w-4 h-4 text-accent" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg font-semibold text-text-primary truncate">{projectName}</h1>
                            {isCollaboration && (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-[11px] font-medium text-accent">
                                    <Users className="w-3 h-3" /> Collaboration
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-text-tertiary truncate max-w-xs">{selectedProject}</p>
                    </div>
                </div>

                {headState?.detached && headState.returnTarget && (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3">
                        <div className="min-w-0 space-y-1">
                            <p className="text-sm font-medium text-text-primary">
                                Viewing commit{' '}
                                <span className="font-mono">{headState.headSha.slice(0, 7)}</span>
                                <span className="text-text-tertiary font-normal"> (detached HEAD)</span>
                            </p>
                            <p className="text-xs text-text-tertiary">
                                Return point:{' '}
                                <span className="font-mono text-text-secondary">
                                    {headState.returnTarget.branch}
                                </span>{' '}
                                @{' '}
                                <span className="font-mono">{headState.returnTarget.sha.slice(0, 7)}</span>
                                {headState.timeTravelStashCount > 0 && (
                                    <span className="ml-2">
                                        · {headState.timeTravelStashCount} stash
                                        {headState.timeTravelStashCount === 1 ? '' : 'es'} will restore on return
                                    </span>
                                )}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void handleReturnToLatest()}
                            disabled={returnLatestBusy}
                            className="shrink-0 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                                       btn-brand disabled:opacity-50 disabled:cursor-not-allowed
                                       transition-all duration-200 cursor-pointer"
                        >
                            {returnLatestBusy ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <CornerUpLeft className="w-4 h-4" />
                            )}
                            Return to latest
                        </button>
                    </div>
                )}

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
                            title="Compare with last snapshot"
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
                                    {alsStruct.summary.split('\n').map((line: string, i: number) => {
                                        const trimmed = line.trimStart()
                                        const colorClass = trimmed.startsWith('+ ')
                                            ? 'text-diff-added'
                                            : trimmed.startsWith('- ')
                                            ? 'text-diff-removed'
                                            : trimmed.startsWith('~ ')
                                            ? 'text-diff-modified'
                                            : 'text-text-secondary'
                                        return (
                                            <div key={i} className={`text-sm py-0.5 font-mono ${colorClass}`}>{line}</div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <p className="text-sm text-text-tertiary">Press ↻ to compare with last snapshot</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Commit History */}
                <div className="rounded-xl border border-border-default overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-bg-elevated">
                        <button
                            onClick={() => setShowHistory(s => !s)}
                            aria-expanded={showHistory}
                            className="flex items-center gap-2 text-sm font-medium text-text-secondary
                                       hover:text-text-primary transition-colors duration-200 cursor-pointer"
                        >
                            {showHistory ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            <History className="w-3.5 h-3.5" />
                            Commit History
                        </button>
                        <button
                            onClick={handleLoadHistory}
                            disabled={historyLoading}
                            className="flex items-center justify-center w-7 h-7 rounded-lg
                                       text-text-tertiary hover:text-accent hover:bg-accent/10
                                       disabled:opacity-40 disabled:cursor-not-allowed
                                       transition-all duration-200 cursor-pointer"
                            title="Refresh commit history"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${historyLoading ? 'animate-spin-slow' : ''}`} />
                        </button>
                    </div>
                    {showHistory && (
                        <div className="bg-bg-secondary border-t border-border-subtle max-h-60 overflow-y-auto">
                            {historyLoading ? (
                                <div className="flex justify-center py-4">
                                    <WaveformSpinner size="sm" label="Loading commit history..." />
                                </div>
                            ) : history.length === 0 ? (
                                <p className="text-sm text-text-tertiary p-4">No commits found.</p>
                            ) : (
                                <div className="p-2 space-y-1">
                                    {history.map((entry) => (
                                        <button
                                            key={entry.hash}
                                            onClick={() => handleSelectCommit(entry.hash)}
                                            className={`w-full text-left px-3 py-2.5 rounded-lg border
                                                transition-all duration-200 cursor-pointer
                                                ${selectedCommit === entry.hash
                                                    ? 'bg-accent/10 border-accent/30 text-text-primary'
                                                    : 'bg-bg-primary/40 border-border-subtle hover:border-border-default hover:bg-bg-elevated'
                                                }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <GitCommit className={`w-3.5 h-3.5 shrink-0 ${selectedCommit === entry.hash ? 'text-accent' : 'text-text-tertiary'}`} />
                                                <span className="text-sm font-medium text-text-primary truncate">{entry.subject}</span>
                                            </div>
                                            <div className="text-xs text-text-tertiary mt-0.5 ml-5.5">
                                                {entry.shortHash} · {entry.author}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Selected Commit Details */}
                {selectedCommit && (
                    <div ref={commitDetailRef} className="rounded-xl border border-border-default overflow-hidden animate-slide-up">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 bg-bg-elevated border-b border-border-subtle">
                            <div className="flex items-center gap-2 min-w-0">
                                <h3 className="text-sm font-semibold text-text-primary">Selected Commit Details</h3>
                                {headStateLoading && (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-text-tertiary shrink-0" />
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 justify-end">
                                <span className="text-xs text-text-tertiary font-mono bg-bg-primary/60 border border-border-subtle px-2 py-1 rounded-full">
                                    {selectedCommit.slice(0, 7)}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleOpenLoadConfirm}
                                    disabled={
                                        loadVersionBusy ||
                                        !selectedProject ||
                                        atSelectedCommit
                                    }
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                                               bg-accent/15 border border-accent/30 text-accent
                                               hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed
                                               transition-colors cursor-pointer"
                                >
                                    {loadVersionBusy ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <History className="w-3.5 h-3.5" />
                                    )}
                                    Load this version
                                </button>
                                {headState?.detached && headState.returnTarget && (
                                    <button
                                        type="button"
                                        onClick={() => void handleReturnToLatest()}
                                        disabled={returnLatestBusy}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                                                   bg-bg-primary/60 border border-border-default text-text-secondary
                                                   hover:border-accent/30 hover:text-text-primary
                                                   disabled:opacity-40 disabled:cursor-not-allowed
                                                   transition-colors cursor-pointer"
                                    >
                                        {returnLatestBusy ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <CornerUpLeft className="w-3.5 h-3.5" />
                                        )}
                                        Return to latest
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="p-4 bg-bg-secondary space-y-4">
                            {/* Semantic Summary */}
                            <div className="rounded-lg border border-border-default overflow-hidden">
                                <div className="px-3 py-2 bg-bg-elevated border-b border-border-subtle">
                                    <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Semantic Summary</span>
                                </div>
                                <div className="p-3">
                                    {selectedCommitSummary ? (
                                        <div className="diff-panel rounded-lg p-3">
                                            {selectedCommitSummary.split('\n').map((line: string, i: number) => {
                                                const trimmed = line.trimStart()
                                                const colorClass = trimmed.startsWith('+ ')
                                                    ? 'text-diff-added'
                                                    : trimmed.startsWith('- ')
                                                    ? 'text-diff-removed'
                                                    : trimmed.startsWith('~ ')
                                                    ? 'text-diff-modified'
                                                    : 'text-text-secondary'
                                                return (
                                                    <div key={i} className={`text-sm py-0.5 font-mono ${colorClass}`}>{line}</div>
                                                )
                                            })}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-text-tertiary">No summary for this commit.</p>
                                    )}
                                </div>
                            </div>

                            {/* Note Stats */}
                            <div className="grid grid-cols-3 gap-3 min-w-0 [grid-template-columns:minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                                <div className="rounded-lg border border-border-default bg-bg-elevated p-3 flex flex-col gap-1">
                                    <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Added</span>
                                    <strong className="text-xl font-bold text-diff-added">{noteCounts.added}</strong>
                                </div>
                                <div className="rounded-lg border border-border-default bg-bg-elevated p-3 flex flex-col gap-1">
                                    <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Removed</span>
                                    <strong className="text-xl font-bold text-diff-removed">{noteCounts.removed}</strong>
                                </div>
                                <div className="rounded-lg border border-border-default bg-bg-elevated p-3 flex flex-col gap-1">
                                    <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">Adjusted</span>
                                    <strong className="text-xl font-bold text-diff-modified">{noteCounts.adjusted}</strong>
                                </div>
                            </div>

                            {/* Piano Roll */}
                            {hasNoteChanges ? (
                                <PianoRollCanvas noteDiff={selectedNoteDiff} />
                            ) : (
                                <div className="rounded-lg border border-border-subtle bg-bg-primary/40 p-3">
                                    <p className="text-sm text-text-tertiary">No MIDI note changes detected for this commit.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Right panel — git actions (fixed width; does not scroll with main column) */}
            <div className="w-56 shrink-0 self-stretch flex flex-col gap-2.5 p-5 border-l border-border-subtle bg-bg-secondary/50">
                <h2 className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-1">Actions</h2>
                <button
                    onClick={handleOpenInAbleton}
                    disabled={openingAbleton}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 rounded-xl text-sm font-medium
                               bg-bg-elevated border border-border-default text-text-primary
                               hover:border-accent/30 hover:bg-bg-tertiary/60
                               disabled:opacity-50 disabled:cursor-not-allowed
                               transition-all duration-200 cursor-pointer"
                >
                    <ExternalLink className="w-4 h-4 text-accent" />
                    {openingAbleton ? 'Opening…' : 'Open in Ableton'}
                </button>

                <div className="border-t border-border-subtle my-1" />

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

            {showLoadConfirm && selectedCommit && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="load-version-title"
                >
                    <div className="w-full max-w-md rounded-xl border border-border-default bg-bg-elevated shadow-xl p-6 space-y-4">
                        <h2 id="load-version-title" className="text-base font-semibold text-text-primary">
                            Load this version?
                        </h2>
                        <p className="text-sm text-text-secondary leading-relaxed">
                            Your project folder will switch to commit{' '}
                            <span className="font-mono text-text-primary">{selectedCommit.slice(0, 7)}</span>
                            {' '}using a <strong className="text-text-primary">detached HEAD</strong>. You can
                            return to your branch afterward with &quot;Return to latest&quot;.
                        </p>
                        <p className="text-sm text-text-tertiary leading-relaxed">
                            If you have uncommitted changes, SoundHaus will stash them first and try to restore
                            them when you return.
                        </p>
                        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
                            <button
                                type="button"
                                onClick={() => setShowLoadConfirm(false)}
                                disabled={loadVersionBusy}
                                className="px-4 py-2.5 rounded-xl text-sm font-medium border border-border-default
                                           bg-bg-secondary text-text-secondary hover:bg-bg-tertiary/60
                                           disabled:opacity-50 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleConfirmLoadVersion()}
                                disabled={loadVersionBusy}
                                className="px-4 py-2.5 rounded-xl text-sm font-medium btn-brand
                                           disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                            >
                                {loadVersionBusy ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : null}
                                Load version
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default ProjectPage;
