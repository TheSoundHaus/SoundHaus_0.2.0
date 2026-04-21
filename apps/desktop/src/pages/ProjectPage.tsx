import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import {
    ChevronDown, ChevronRight, RefreshCw, ArrowDownToLine, Save, ArrowUpFromLine,
    Music, AlertTriangle, CheckCircle, ExternalLink, History, GitCommit, GitBranch, FolderOpen, Users
} from 'lucide-react'
import { useAlsParser } from '../hooks/useAlsParser'
import useElectronIPC from '../hooks/useElectronIPC'
import WaveformSpinner from '../components/WaveformSpinner'
import { useProjectGitActions } from '../hooks/useProjectGitActions'
import type {
    AlsMergeConflictEntryDTO,
    CommitEntry,
    LibrarySampleAdvisoryDTO,
    NoteDiff,
    ProjectReadinessDTO,
} from '../types'
import electronAPI from '../services/electronAPI';
import gitService from '../services/gitService';
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
    const [readiness, setReadiness] = useState<ProjectReadinessDTO | null>(null)
    const [mediaBypass, setMediaBypass] = useState(false)
    const [sampleGate, setSampleGate] = useState<{
        action: 'pull' | 'push'
        message: string
        issues: { relativePath: string; reason: string }[]
    } | null>(null)
    const [alsMergeModal, setAlsMergeModal] = useState<{
        pendingPath: string
        conflicts: AlsMergeConflictEntryDTO[]
        choices: Record<string, string>
    } | null>(null)
    const [readinessSamplesRefreshing, setReadinessSamplesRefreshing] = useState(false)

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

    const loadReadiness = useCallback(async () => {
        if (!selectedProject) return
        const r = await gitService.getProjectReadiness(selectedProject)
        setReadiness(r ?? null)
        if (r?.samples.state === 'ok') {
            setMediaBypass(false)
        }
    }, [selectedProject])

    const handleRefreshSampleReadiness = useCallback(async () => {
        if (!selectedProject) return
        setReadinessSamplesRefreshing(true)
        try {
            await loadReadiness()
        } finally {
            setReadinessSamplesRefreshing(false)
        }
    }, [loadReadiness, selectedProject])

    const openAlsMergeFromConflictJson = useCallback((pendingPath: string, conflictJson: string) => {
        type Report = { conflicts?: AlsMergeConflictEntryDTO[] }
        let report: Report
        try {
            report = JSON.parse(conflictJson) as Report
        } catch {
            showToast({
                type: 'error',
                title: 'Could not read merge conflict data',
                detail: 'The conflict report from the merge engine was invalid.',
            })
            return
        }
        const conflicts = Array.isArray(report.conflicts) ? report.conflicts : []
        if (conflicts.length === 0) {
            showToast({
                type: 'error',
                title: 'No merge conflicts listed',
                detail: 'Try pulling again or contact support if this keeps happening.',
            })
            return
        }
        const choices: Record<string, string> = {}
        for (const c of conflicts) {
            if (c.track_id) {
                choices[c.track_id] = 'remote'
            }
        }
        setAlsMergeModal({ pendingPath, conflicts, choices })
    }, [showToast])

    const resumeAlsMergeFromDisk = useCallback(async () => {
        const p = readiness?.alsMergeConflictPendingPath
        if (!p) return
        const file = await gitService.getAlsMergePending(p)
        if (!file?.conflictJson) {
            showToast({
                type: 'info',
                title: 'Merge pending file missing',
                detail: 'Refreshing project status…',
            })
            await loadReadiness()
            return
        }
        openAlsMergeFromConflictJson(p, file.conflictJson)
    }, [loadReadiness, openAlsMergeFromConflictJson, readiness?.alsMergeConflictPendingPath, showToast])

    const handleRefreshChanges = useCallback(async () => {
        if (!selectedProject) return

        setRefreshing(true)
        try {
            if (typeof findAls !== 'function') {
                console.warn('findAls is not available from useElectronIPC')
                setAlsStruct(null)
                return
            }

            findAndParse(selectedProject)

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

    const submitAlsMergeResolutions = useCallback(async () => {
        if (!alsMergeModal) return
        try {
            const { hadDuplicate } = await gitService.completeAlsMerge(
                alsMergeModal.pendingPath,
                alsMergeModal.choices,
            )
            setAlsMergeModal(null)
            showToast({
                type: 'success',
                title: 'ALS merge applied',
                detail: hadDuplicate
                    ? 'You duplicated at least one track — tidy clips in Ableton, save, then use Complete merge below.'
                    : 'Your session file was updated from the merge.',
            })
            await handleRefreshChanges()
            await loadReadiness()
        } catch (e) {
            showToast({
                type: 'error',
                title: 'Could not finish ALS merge',
                detail: e instanceof Error ? e.message : String(e),
            })
        }
    }, [alsMergeModal, handleRefreshChanges, loadReadiness, showToast])

    const handleClearMergeCompletePending = useCallback(async () => {
        if (!selectedProject) return
        try {
            await gitService.clearMergePendingFlag(selectedProject)
            showToast({
                type: 'success',
                title: 'Merge marked complete',
                detail: 'You can commit and push when ready.',
            })
            await loadReadiness()
        } catch (e) {
            showToast({
                type: 'error',
                title: 'Could not clear merge flag',
                detail: e instanceof Error ? e.message : String(e),
            })
        }
    }, [loadReadiness, selectedProject, showToast])

    const handleGitPull = async () => {
        if (!selectedProject) return
        try {
            const result = await runPull(selectedProject)
            if (!result.ok && result.code === 'MISSING_SAMPLES') {
                setSampleGate({
                    action: 'pull',
                    message: result.message,
                    issues: result.issues,
                })
                return
            }
            if (!result.ok && result.code === 'ALS_MERGE_CONFLICT') {
                openAlsMergeFromConflictJson(result.pendingPath, result.conflictJson)
                await loadReadiness()
                return
            }
            if (result.ok) {
                notifyPullSuccess(showToast, result.message)
                await handleRefreshChanges()
                await loadReadiness()
            }
        } catch (error) {
            notifyPullError(showToast, error)
        }
    }

    const confirmSampleBypassPull = async () => {
        if (!selectedProject || !sampleGate || sampleGate.action !== 'pull') return
        setSampleGate(null)
        try {
            const result = await runPull(selectedProject, { skipMissingSampleCheck: true })
            if (!result.ok && result.code === 'ALS_MERGE_CONFLICT') {
                openAlsMergeFromConflictJson(result.pendingPath, result.conflictJson)
                await loadReadiness()
                return
            }
            if (result.ok) {
                setMediaBypass(true)
                notifyPullSuccess(showToast, result.message)
                await handleRefreshChanges()
                await loadReadiness()
            }
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
            await loadReadiness()
        } catch (error) {
            notifyCommitError(showToast, error)
        }
    }

    const handleGitPush = async () => {
        if (!selectedProject) return
        try {
            const result = await runPush(selectedProject)
            if (!result.ok && result.code === 'MISSING_SAMPLES') {
                setSampleGate({
                    action: 'push',
                    message: result.message,
                    issues: result.issues,
                })
                return
            }
            if (!result.ok && result.code === 'PUSH_BEHIND_REMOTE') {
                showToast({
                    type: 'info',
                    title: 'Pull before pushing',
                    detail: result.message,
                })
                await loadReadiness()
                return
            }
            if (result.ok) {
                notifyPushSuccess(showToast, result.message)
                await handleRefreshChanges()
                await loadReadiness()
            }
        } catch (error) {
            notifyPushError(showToast, error)
        }
    }

    const confirmSampleBypassPush = async () => {
        if (!selectedProject || !sampleGate || sampleGate.action !== 'push') return
        setSampleGate(null)
        try {
            const result = await runPush(selectedProject, { skipMissingSampleCheck: true })
            if (!result.ok && result.code === 'PUSH_BEHIND_REMOTE') {
                showToast({
                    type: 'info',
                    title: 'Pull before pushing',
                    detail: result.message,
                })
                await loadReadiness()
                return
            }
            if (result.ok) {
                setMediaBypass(true)
                notifyPushSuccess(showToast, result.message)
                await handleRefreshChanges()
                await loadReadiness()
            }
        } catch (error) {
            notifyPushError(showToast, error)
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
        void loadReadiness()
    }, [loadReadiness])

    useEffect(() => {
        handleLoadHistory()
    }, [handleLoadHistory])

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
            void loadReadiness()
        }

        window.addEventListener('soundhaus:project-refresh-request', onRefreshRequest)
        return () => window.removeEventListener('soundhaus:project-refresh-request', onRefreshRequest)
    }, [handleRefreshChanges, loadReadiness, selectedProject])

    const syncStatus = readiness
        ? (() => {
            const s = readiness.sync
            switch (s.state) {
                case 'no_upstream':
                    return { tone: 'neutral' as const, text: 'No upstream branch' }
                case 'unknown':
                    return { tone: 'neutral' as const, text: 'Sync status unknown' }
                case 'up_to_date':
                    return { tone: 'ok' as const, text: 'Up to date with remote' }
                case 'ahead':
                    return {
                        tone: 'ok' as const,
                        text: `Ahead by ${s.ahead ?? 0} commit(s) — you can push when ready`,
                    }
                case 'behind':
                    return {
                        tone: 'warn' as const,
                        text: `Behind remote by ${s.behind ?? 0} commit(s) — pull before pushing`,
                    }
                case 'diverged':
                    return {
                        tone: 'warn' as const,
                        text: 'Branch diverged from remote — pull and reconcile',
                    }
            }
        })()
        : null

    const samplesStatus = readiness
        ? (() => {
              const libN = readiness.samples.libraryAdvisoryCount ?? 0
              if (readiness.samples.state === 'action_needed') {
                  if (mediaBypass) {
                      return {
                          tone: 'warn' as const,
                          text: 'You continued without fixing sample paths — collaborators may get missing audio',
                      }
                  }
                  return {
                      tone: 'warn' as const,
                      text: `Action needed: ${readiness.samples.issueCount} sample reference(s) look missing or external. In Ableton: File → Collect All and Save.`,
                  }
              }
              if (libN > 0) {
                  return {
                      tone: 'neutral' as const,
                      text:
                          libN === 1
                              ? 'This set references one Ableton library or pack sound. That is fine on your machine. Collaborators need the same library content, or use File → Collect All and Save in Ableton for a self-contained project.'
                              : `This set references ${libN} Ableton library or pack sounds. Fine on your machine; collaborators need the same packs, or use Collect All and Save for a portable project.`,
                  }
              }
              return {
                  tone: 'ok' as const,
                  text: 'Sample files appear to live inside the project',
              }
          })()
        : null

    const toneClass = (t: 'ok' | 'warn' | 'neutral') =>
        t === 'ok' ? 'text-success' : t === 'warn' ? 'text-[var(--color-warning)]' : 'text-text-tertiary'

    const sampleIssueReasonLabel = (reason: string) =>
        reason === 'outside_project'
            ? 'outside project folder'
            : reason === 'file_not_found'
              ? 'file not found'
              : reason

    const projectName = selectedProject?.split(/[\\/]/).pop() || 'Project'

    return (
        <div className="flex w-full h-full min-h-0 min-w-0 bg-bg-primary text-text-primary overflow-hidden animate-fade-in">
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

                {/* Sync + media readiness (§5b) */}
                {readiness?.alsMergeConflictPendingPath && !alsMergeModal && (
                    <div
                        className="rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-4 flex flex-wrap items-center justify-between gap-3"
                        role="status"
                    >
                        <div className="min-w-0">
                            <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                                ALS merge paused
                            </div>
                            <p className="text-sm text-text-secondary mt-1">
                                Pull stopped because clips overlap on at least one track. Choose Remote, Local, or Duplicate
                                for each track to finish the merge.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void resumeAlsMergeFromDisk()}
                            className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium btn-brand cursor-pointer"
                        >
                            Resolve…
                        </button>
                    </div>
                )}

                {readiness?.mergeCompletePending && (
                    <div
                        className="rounded-xl border border-border-default bg-bg-secondary/80 p-4 flex flex-wrap items-center justify-between gap-3"
                        role="status"
                    >
                        <div className="min-w-0">
                            <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                                Finish duplicate-track merge
                            </div>
                            <p className="text-sm text-text-secondary mt-1">
                                After you save the project in Ableton, mark this step complete so you can commit and push
                                cleanly.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void handleClearMergeCompletePending()}
                            className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium border border-border-default bg-bg-elevated hover:bg-bg-tertiary/60 cursor-pointer"
                        >
                            Complete merge
                        </button>
                    </div>
                )}

                {readiness && syncStatus && samplesStatus && (
                    <div className="rounded-xl border border-border-default bg-bg-secondary/80 p-4 space-y-3">
                        <div className="flex items-start gap-3">
                            <GitBranch className={`w-4 h-4 shrink-0 mt-0.5 ${toneClass(syncStatus.tone)}`} />
                            <div className="min-w-0">
                                <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                                    Sync
                                </div>
                                <p className={`text-sm mt-0.5 ${toneClass(syncStatus.tone)}`}>
                                    {syncStatus.text}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 min-w-0 w-full">
                            <div className="flex items-start gap-3">
                                <FolderOpen className={`w-4 h-4 shrink-0 mt-0.5 ${toneClass(samplesStatus.tone)}`} />
                                <div className="min-w-0 flex-1">
                                    <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                                        Samples / media
                                    </div>
                                    <p className={`text-sm mt-0.5 ${toneClass(samplesStatus.tone)}`}>
                                        {samplesStatus.text}
                                    </p>
                                </div>
                                {(readiness.samples.state === 'action_needed' ||
                                    readiness.samples.libraryAdvisoryCount > 0) && (
                                    <button
                                        type="button"
                                        onClick={() => void handleRefreshSampleReadiness()}
                                        disabled={readinessSamplesRefreshing}
                                        className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg mt-0.5 text-text-tertiary hover:text-accent hover:bg-accent/10
                                                   disabled:opacity-40 disabled:cursor-not-allowed
                                                   transition-all duration-200 cursor-pointer"
                                        title="Re-check sample paths (after Collect All and Save in Ableton)"
                                        aria-label="Refresh sample status"
                                    >
                                        <RefreshCw
                                            className={`w-3.5 h-3.5 ${readinessSamplesRefreshing ? 'animate-spin-slow' : ''}`}
                                        />
                                    </button>
                                )}
                            </div>
                            {readiness.samples.issues.length > 0 && (
                                <details className="group rounded-lg border border-border-subtle bg-bg-primary/50 text-left">
                                    <summary
                                        className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/30 rounded-lg transition-colors
                                                   [&::-webkit-details-marker]:hidden flex items-center justify-between gap-2"
                                    >
                                        <span>
                                            Paths that need fixing ({readiness.samples.issues.length})
                                        </span>
                                        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-text-tertiary group-open:rotate-90 transition-transform" />
                                    </summary>
                                    <ul className="px-3 pb-3 pt-0 space-y-2 max-h-48 overflow-y-auto border-t border-border-subtle/80">
                                        {readiness.samples.issues.map((issue, i) => (
                                            <li key={`${issue.relativePath}-${issue.reason}-${i}`} className="text-xs">
                                                <span className="font-mono text-text-primary break-all block">
                                                    {issue.relativePath}
                                                </span>
                                                <span className="text-text-tertiary mt-0.5 block">
                                                    {sampleIssueReasonLabel(issue.reason)}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                            {readiness.samples.libraryAdvisories.length > 0 && (
                                <details className="group rounded-lg border border-border-subtle bg-bg-primary/50 text-left">
                                    <summary
                                        className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/30 rounded-lg transition-colors
                                                   [&::-webkit-details-marker]:hidden flex items-center justify-between gap-2"
                                    >
                                        <span>
                                            Library / pack references ({readiness.samples.libraryAdvisories.length})
                                        </span>
                                        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-text-tertiary group-open:rotate-90 transition-transform" />
                                    </summary>
                                    <p className="px-3 pt-1 pb-2 text-xs text-text-tertiary border-t border-border-subtle/80">
                                        These point at Ableton factory or pack content. They do not block sync. Use
                                        Collect All and Save only if you want audio copied into the project folder for
                                        collaborators.
                                    </p>
                                    <ul className="px-3 pb-3 pt-0 space-y-2 max-h-48 overflow-y-auto">
                                        {readiness.samples.libraryAdvisories.map((row: LibrarySampleAdvisoryDTO, i: number) => (
                                            <li key={`${row.relativePath}-${i}`} className="text-xs">
                                                <span className="font-mono text-text-primary break-all block">
                                                    {row.relativePath}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                        </div>
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
                        <div className="flex items-center justify-between px-4 py-3 bg-bg-elevated border-b border-border-subtle">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-semibold text-text-primary">Selected Commit Details</h3>
                            </div>
                            <span className="text-xs text-text-tertiary font-mono bg-bg-primary/60 border border-border-subtle px-2 py-1 rounded-full">
                                {selectedCommit.slice(0, 7)}
                            </span>
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

            {alsMergeModal && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="als-merge-title"
                >
                    <div className="w-full max-w-lg rounded-xl border border-border-default bg-bg-elevated shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
                        <h2 id="als-merge-title" className="text-base font-semibold text-text-primary">
                            Overlapping clip changes
                        </h2>
                        <p className="text-sm text-text-secondary leading-relaxed">
                            For each track, choose whose new clips win, or duplicate the track to keep both versions.
                        </p>
                        <ul className="space-y-3">
                            {alsMergeModal.conflicts.map((c) => (
                                <li
                                    key={c.track_id}
                                    className="rounded-lg border border-border-subtle bg-bg-secondary p-3 space-y-2"
                                >
                                    <div className="text-sm font-medium text-text-primary">
                                        {c.track_name?.trim() || `Track ${c.track_id}`}
                                    </div>
                                    <div className="text-xs text-text-tertiary">{c.summary}</div>
                                    <label className="sr-only" htmlFor={`als-merge-${c.track_id}`}>
                                        Resolution for track {c.track_id}
                                    </label>
                                    <select
                                        id={`als-merge-${c.track_id}`}
                                        className="w-full text-sm rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-text-primary"
                                        value={alsMergeModal.choices[c.track_id] ?? 'remote'}
                                        onChange={(e) =>
                                            setAlsMergeModal((m) =>
                                                m
                                                    ? {
                                                          ...m,
                                                          choices: { ...m.choices, [c.track_id]: e.target.value },
                                                      }
                                                    : null,
                                            )
                                        }
                                    >
                                        <option value="remote">Remote — use collaborators&apos; clips</option>
                                        <option value="local">Local — keep my clips</option>
                                        <option value="duplicate">Duplicate track — keep both</option>
                                    </select>
                                </li>
                            ))}
                        </ul>
                        <div className="flex flex-wrap gap-2 justify-end pt-1">
                            <button
                                type="button"
                                onClick={() => setAlsMergeModal(null)}
                                className="px-4 py-2 rounded-lg text-sm font-medium border border-border-default bg-bg-secondary text-text-primary hover:bg-bg-tertiary/60 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => void submitAlsMergeResolutions()}
                                className="px-4 py-2 rounded-lg text-sm font-medium btn-brand cursor-pointer"
                            >
                                Apply merge
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {sampleGate && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="sample-gate-title"
                >
                    <div className="w-full max-w-md rounded-xl border border-border-default bg-bg-elevated shadow-xl p-5 space-y-4">
                        <h2 id="sample-gate-title" className="text-base font-semibold text-text-primary">
                            Sample paths need attention
                        </h2>
                        <p className="text-sm text-text-secondary leading-relaxed">{sampleGate.message}</p>
                        {sampleGate.issues.length > 0 && sampleGate.issues.length <= 8 && (
                            <ul className="text-xs font-mono text-text-tertiary max-h-32 overflow-y-auto space-y-1 list-disc pl-4">
                                {sampleGate.issues.map((it, i) => (
                                    <li key={i}>
                                        {it.relativePath}
                                        <span className="text-text-tertiary/70"> ({it.reason})</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="flex flex-wrap gap-2 justify-end pt-1">
                            <button
                                type="button"
                                onClick={() => setSampleGate(null)}
                                className="px-4 py-2 rounded-lg text-sm font-medium border border-border-default
                                           bg-bg-secondary text-text-primary hover:bg-bg-tertiary/60 cursor-pointer"
                            >
                                Go back
                            </button>
                            <button
                                type="button"
                                onClick={
                                    sampleGate.action === 'pull'
                                        ? () => void confirmSampleBypassPull()
                                        : () => void confirmSampleBypassPush()
                                }
                                className="px-4 py-2 rounded-lg text-sm font-medium btn-brand cursor-pointer"
                            >
                                {sampleGate.action === 'pull' ? 'Continue pull anyway' : 'Push anyway'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default ProjectPage;
