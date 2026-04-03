import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronDown, ChevronRight, RefreshCw, ArrowDownToLine, Save, ArrowUpFromLine, Music, AlertTriangle, CheckCircle, ExternalLink } from 'lucide-react'
import { useAlsParser } from '../hooks/useAlsParser'
import useElectronIPC from '../hooks/useElectronIPC'
import { useProjectGitActions } from '../hooks/useProjectGitActions'
import type { GitError } from '../hooks/useProjectGitActions'
import type { CommitEntry, NoteDiff } from '../types'
import electronAPI from '../services/electronAPI';
import PianoRollCanvas from '../components/diff/PianoRollCanvas.tsx';
import styles from './ProjectPage.module.css';

const ProjectPage = () => {
    console.log('[SoundHaus] ProjectPage: rendering')
    const location = useLocation();
    const selectedProject = (location.state as any)?.projectPath || null

    const [alsStruct, setAlsStruct] = useState<any | null>(null)
    const [showTrackInfo, setShowTrackInfo] = useState<boolean>(true)
    const [showChanges, setShowChanges] = useState<boolean>(true)
    const [refreshing, setRefreshing] = useState(false)
    const [historyLoading, setHistoryLoading] = useState(false)
    const [history, setHistory] = useState<CommitEntry[]>([])
    const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
    const [selectedCommitSummary, setSelectedCommitSummary] = useState<string>('')
    const [selectedNoteDiff, setSelectedNoteDiff] = useState<NoteDiff | null>(null)
    const [openingAbleton, setOpeningAbleton] = useState(false)

    const { findAndParse } = useAlsParser()
    const { findAls } = useElectronIPC()
    const { runPull, runCommit, runPush } = useProjectGitActions()

    const commitDetailRef = useRef<HTMLElement>(null)

    const trackDiffs = selectedNoteDiff?.tracks ?? []
    const noteCounts = {
        added: trackDiffs.reduce((sum, track) => sum + track.added.length, 0),
        removed: trackDiffs.reduce((sum, track) => sum + track.removed.length, 0),
        adjusted: trackDiffs.reduce((sum, track) => sum + track.adjusted.length, 0),
    }
    const hasNoteChanges = (noteCounts.added + noteCounts.removed + noteCounts.adjusted) > 0

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
            alert(`Download complete!\n${result}`)
            await handleRefreshChanges()
        } catch(error) {
            const gitError = error as GitError
            if (gitError?.type === 'conflict') {
                alert(`Unable to download changes.\n\nYour work has conflicts with recent changes from your collaborators. Please contact your team to resolve this.`)
            } else if (gitError?.type === 'network') {
                alert(`Unable to connect.\n\nPlease check your internet connection and try again.`)
            } else {
                alert(`Download failed:\n${gitError?.message ?? error}`)
            }
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
    const handleOpenInAbleton = async () => {
        if(!selectedProject) return
        setOpeningAbleton(true)
        try {
            const result = await (window as any).electron.openAlsFile(selectedProject)
            if (!result.ok) {
                alert(`Failed to open project in Ableton:\n${result.error}`)
            }
        } catch(error) {
            alert(`Error opening file:\n${error}`)
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

    return (
        <div className="flex w-full h-screen bg-bg-primary text-text-primary overflow-hidden animate-fade-in">
            {/* Main content — top/bottom split */}
            <div className="flex-1 flex flex-col min-h-0">
                {/* Top: Browse (track info, changes, commit history) */}
                <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
                {/* Project title */}
                <div className="flex items-center gap-3 mb-2 shrink-0">
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
                        <div className="p-4 bg-bg-secondary border-t border-border-subtle max-h-60 overflow-y-auto">
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
                        <div className="p-4 bg-bg-secondary border-t border-border-subtle max-h-60 overflow-y-auto">
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
                <div className="rounded-xl border border-white/[0.08] overflow-hidden bg-[rgba(20,20,20,0.82)] backdrop-blur-2xl shrink-0">
                    <div className="flex justify-between items-center w-full px-3 py-2 bg-white/[0.025] border-b border-white/[0.06]">
                        <span className="text-sm font-medium text-[#F0F0F0]">Commit History</span>
                        <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                                e.stopPropagation()
                                handleLoadHistory()
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    handleLoadHistory()
                                }
                            }}
                            aria-disabled={historyLoading}
                            className={`px-2 py-1 text-xs rounded bg-accent/[0.08] border border-accent/20 text-accent select-none transition-colors duration-200 ${historyLoading ? 'cursor-wait opacity-60' : 'cursor-pointer hover:bg-accent/[0.14]'}`}
                            title="Refresh commit history"
                        >
                            {historyLoading ? '⟳' : '↻'}
                        </span>
                    </div>
                    <div className="p-3 max-h-60 overflow-y-auto">
                        {historyLoading ? (
                            <p className="text-sm text-white/40">Loading commit history...</p>
                        ) : history.length === 0 ? (
                            <p className="text-sm text-white/40">No commits found.</p>
                        ) : (
                            <div className="grid gap-2">
                                {history.map((entry) => (
                                    <button
                                        key={entry.hash}
                                        onClick={() => handleSelectCommit(entry.hash)}
                                        className={`text-left rounded-md p-2 transition-all duration-200 cursor-pointer ${
                                            selectedCommit === entry.hash
                                                ? 'border border-accent/35 bg-accent/[0.09]'
                                                : 'border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'
                                        }`}
                                    >
                                        <div className="font-semibold text-sm text-[#F0F0F0]">{entry.subject}</div>
                                        <div className="text-xs text-white/40">{entry.shortHash} • {entry.author}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                </div>

                {/* Divider */}
                <div className="shrink-0 border-t border-white/[0.06]" />

                {/* Bottom: Commit Details */}
                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
                <section ref={commitDetailRef} className={styles.commitDiffSection}>
                    <div className={styles.commitDiffHeader}>
                        <h3 className={styles.commitDiffTitle}>Selected Commit Details</h3>
                        {selectedCommit && (
                            <span className={styles.commitPill}>{selectedCommit.slice(0, 7)}</span>
                        )}
                    </div>

                    <div className={styles.commitDiffBody}>
                        {!selectedCommit ? (
                            <p className="text-sm text-white/40">Pick a commit above to view both semantic and MIDI note differences.</p>
                        ) : (
                            <>
                                <div className="rounded-lg border border-white/[0.08] overflow-hidden bg-[rgba(20,20,20,0.82)] backdrop-blur-2xl">
                                    <div className="px-3 py-2 bg-white/[0.025] border-b border-white/[0.06] font-semibold text-sm text-[#F0F0F0]">
                                        Semantic Summary
                                    </div>
                                    <div className="p-3 max-h-48 overflow-y-auto">
                                        {selectedCommitSummary ? (
                                            <div className="p-2 bg-white/[0.03] rounded border border-white/[0.04]">
                                                {selectedCommitSummary.split('\n').map((line: string, i: number) => {
                                                    const trimmed = line.trimStart()
                                                    const colorClass = trimmed.startsWith('+ ')
                                                        ? 'text-diff-added'
                                                        : trimmed.startsWith('- ')
                                                        ? 'text-diff-removed'
                                                        : trimmed.startsWith('~ ')
                                                        ? 'text-diff-modified'
                                                        : 'text-[#F0F0F0]'
                                                    return (
                                                        <div key={i} className={`mb-1 whitespace-pre-wrap text-sm font-mono ${colorClass}`}>{line}</div>
                                                    )
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-white/40">No summary for this commit.</p>
                                        )}
                                    </div>
                                </div>

                                <div className={styles.noteStatsRow}>
                                    <div className={styles.noteStatCard}>
                                        <span className={styles.noteStatLabel}>Added</span>
                                        <strong className={styles.noteAdded}>{noteCounts.added}</strong>
                                    </div>
                                    <div className={styles.noteStatCard}>
                                        <span className={styles.noteStatLabel}>Removed</span>
                                        <strong className={styles.noteRemoved}>{noteCounts.removed}</strong>
                                    </div>
                                    <div className={styles.noteStatCard}>
                                        <span className={styles.noteStatLabel}>Adjusted</span>
                                        <strong className={styles.noteAdjusted}>{noteCounts.adjusted}</strong>
                                    </div>
                                </div>

                                <div className="mt-1">
                                    {hasNoteChanges ? (
                                        <PianoRollCanvas noteDiff={selectedNoteDiff} />
                                    ) : (
                                        <div className="rounded-lg border border-white/[0.08] p-3 bg-[rgba(20,20,20,0.82)] backdrop-blur-2xl">
                                            <p className="text-sm text-white/40 m-0">No MIDI note changes detected for this commit.</p>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </section>
                </div>
            </div>

            {/* Right panel — git actions */}
            <div className="w-56 shrink-0 flex flex-col gap-2.5 p-5 border-l border-border-subtle bg-bg-secondary/50 overflow-y-auto min-h-0">
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
                <button
                    onClick={handleOpenInAbleton}
                    disabled={openingAbleton}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 rounded-xl text-sm font-medium
                               bg-bg-elevated border border-border-default text-text-primary
                               hover:border-accent/30 hover:bg-bg-tertiary/60
                               disabled:opacity-40 disabled:cursor-not-allowed
                               transition-all duration-200 cursor-pointer"
                >
                    <ExternalLink className="w-4 h-4 text-accent" />
                    {openingAbleton ? 'Opening...' : 'Open in Ableton'}
                </button>
            </div>
        </div>
    )
}

export default ProjectPage;
