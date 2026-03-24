import { useState, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAlsParser } from '../hooks/useAlsParser'
import useElectronIPC from '../hooks/useElectronIPC'
import gitService from '../services/gitService'
import electronAPI from '../services/electronAPI'
import {
    ChevronDown, ChevronRight, RefreshCw, ArrowDownToLine, 
    Save, ArrowUpFromLine, Music, GitBranch, Layers, ArrowLeft, CheckCircle2, AlertCircle
} from 'lucide-react'

/**
 * Returns styling info for a diff summary line based on its operation type.
 * Top-level lines use prefixes: '+ ' (added), '- ' (removed), '~ ' (modified)
 * Child lines start with indented action: '  renamed:', '  moved:', '  added:', '  removed:'
 */
function getDiffLineStyle(line: string): { color: string; bg: string; icon: string; text: string } {
    const trimmed = line.trimStart()
    const isChild = line.startsWith('  ')

    // Child lines — action word is first token
    if (isChild) {
        if (trimmed.startsWith('added:')) {
            return { color: 'text-diff-added', bg: 'bg-diff-added-bg', icon: '+', text: trimmed }
        }
        if (trimmed.startsWith('removed:')) {
            return { color: 'text-diff-removed', bg: 'bg-diff-removed-bg', icon: '\u2212', text: trimmed }
        }
        if (trimmed.startsWith('renamed:')) {
            return { color: 'text-diff-renamed', bg: 'bg-diff-renamed-bg', icon: '\u21C4', text: trimmed }
        }
        if (trimmed.startsWith('moved:')) {
            return { color: 'text-diff-moved', bg: 'bg-diff-moved-bg', icon: '\u2195', text: trimmed }
        }
        // Fallback child
        return { color: 'text-diff-modified', bg: 'bg-diff-modified-bg', icon: '\u00B7', text: trimmed }
    }

    // Top-level lines — prefix character
    if (line.startsWith('+ ')) {
        return { color: 'text-diff-added', bg: 'bg-diff-added-bg', icon: '+', text: line.slice(2) }
    }
    if (line.startsWith('- ')) {
        return { color: 'text-diff-removed', bg: 'bg-diff-removed-bg', icon: '\u2212', text: line.slice(2) }
    }
    if (line.startsWith('~ ')) {
        return { color: 'text-diff-modified', bg: 'bg-diff-modified-bg', icon: '~', text: line.slice(2) }
    }

    // Fallback
    return { color: 'text-text-secondary', bg: '', icon: ' ', text: line }
}

const ProjectPage = () => {
    const location = useLocation()
    const navigate = useNavigate()
    const initialPath = (location.state as any)?.projectPath || null

    const [alsStruct, setAlsStruct] = useState<any | null>(null)
    const [selectedProject] = useState<string | null>(initialPath)
    // Track Information closed by default, Changes open by default
    const [showTrackInfo, setShowTrackInfo] = useState<boolean>(false)
    const [showChanges, setShowChanges] = useState<boolean>(true)

    const [pulling, setPulling] = useState(false)
    const [pushing, setPushing] = useState(false)
    const [committing, setCommitting] = useState(false)
    const [refreshing, setRefreshing] = useState(false)

    const { findAndParse } = useAlsParser()
    const { findAls } = useElectronIPC()

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

            // Single atomic call — diffs in Rust, no temp files
            const result = await electronAPI.getChanges(alsPath)
            setAlsStruct(result)
        } catch (e) {
            setAlsStruct({ ok: false, reason: e instanceof Error ? e.message : String(e) })
        } finally {
            setRefreshing(false)
        }
    }, [findAls, findAndParse, selectedProject])

    const handleGitPull = async () => {
        if(!selectedProject) return
        setPulling(true)
        try {
            const result = await gitService.pullRepo(selectedProject)
            alert(`Pull complete:\n${result}`)
            await handleRefreshChanges()
        } catch(error) {
            alert(`Pull failed:\n${error}`)
        } finally {
            setPulling(false)
        }
    }

    const handleGitCommit = async () => {
        if(!selectedProject) return
        setCommitting(true)
        try {
            const result = await gitService.commitChange(selectedProject)
            alert(`Commit complete:\n${result}`)
            // After a commit the working tree matches HEAD — show in-sync immediately
            setAlsStruct((prev: any) => prev ? { ...prev, diffStatus: 'in-sync', summary: '' } : prev)
        } catch(error) {
            alert(`Commit failed:\n${error}`)
        } finally {
            setCommitting(false)
        }
    }

    const handleGitPush = async () => {
        if(!selectedProject) return
        setPushing(true)
        try {
            const result = await gitService.pushRepo(selectedProject)
            alert(`Push complete:\n${result}`)
            await handleRefreshChanges()
        } catch(error) {
            alert(`Push failed:\n${error}`)
        } finally {
            setPushing(false)
        }
    }

    useEffect(() => {
        handleRefreshChanges()
    }, [handleRefreshChanges])

    // Derive project name from path
    const projectName = selectedProject?.split('/').pop() || 'Untitled Project'

    return (
        <div className="flex flex-col w-full h-screen bg-bg-primary overflow-hidden">
            {/* ── Header Bar ── */}
            <div className="flex items-center gap-3 px-5 pt-4 pb-3 drag-region border-b border-border-subtle/50">
                <button
                    onClick={() => navigate('/home')}
                    className="no-drag flex items-center justify-center w-7 h-7 rounded-lg
                               hover:bg-bg-tertiary/60 text-text-tertiary hover:text-text-secondary
                               transition-all duration-200 cursor-pointer"
                >
                    <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="no-drag flex items-center gap-2 flex-1 min-w-0">
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-accent/10">
                        <Music className="w-3.5 h-3.5 text-accent" />
                    </div>
                    <span className="text-sm font-medium text-text-primary truncate">{projectName}</span>
                </div>
                <div className="no-drag flex items-center gap-1 text-xs text-text-tertiary">
                    <GitBranch className="w-3 h-3" />
                    <span>main</span>
                </div>
            </div>

            {/* ── Main Content ── */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {/* Track Information Panel */}
                <div className="glass-panel rounded-2xl overflow-hidden animate-slide-up">
                    <button
                        onClick={() => setShowTrackInfo(s => !s)}
                        aria-expanded={showTrackInfo}
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-left
                                   hover:bg-white/[0.03] transition-colors duration-150 cursor-pointer"
                    >
                        {showTrackInfo
                            ? <ChevronDown className="w-4 h-4 text-text-tertiary" />
                            : <ChevronRight className="w-4 h-4 text-text-tertiary" />
                        }
                        <Layers className="w-4 h-4 text-text-secondary" />
                        <span className="text-sm font-medium text-text-primary">Track Information</span>
                        {alsStruct?.project?.Tracks && (
                            <span className="ml-auto text-xs text-text-tertiary bg-bg-elevated px-2 py-0.5 rounded-full">
                                {alsStruct.project.Tracks.length}
                            </span>
                        )}
                    </button>
                    {showTrackInfo && (
                        <div className="px-4 pb-4 animate-slide-down">
                            {alsStruct == null ? (
                                <p className="text-sm text-text-tertiary py-2">No ALS loaded</p>
                            ) : alsStruct.ok === false ? (
                                <div className="flex items-center gap-2 text-sm text-error bg-error-soft rounded-xl px-3 py-2">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    {alsStruct.reason ?? 'An error occurred'}
                                </div>
                            ) : alsStruct.project?.Tracks ? (
                                <div className="space-y-1.5">
                                    {alsStruct.project.Tracks.map((track: any, i: number) => (
                                        <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-bg-primary/40
                                                                 hover:bg-bg-primary/60 transition-colors duration-150">
                                            <div className="w-1 h-8 rounded-full bg-accent/40" />
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-medium text-text-primary truncate">
                                                    {track.EffectiveName || 'Unnamed Track'}
                                                </div>
                                                <div className="text-xs text-text-tertiary">
                                                    {track.Type} · ID {track.Id}
                                                    {track.UserName && ` · ${track.UserName}`}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-text-tertiary py-2">No tracks found</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Changes Panel */}
                <div className="glass-panel rounded-2xl overflow-hidden animate-slide-up" style={{ animationDelay: '60ms', animationFillMode: 'both' }}>
                    <div className="flex items-center">
                        <button
                            onClick={() => setShowChanges(s => !s)}
                            aria-expanded={showChanges}
                            className="flex-1 flex items-center gap-2.5 px-4 py-3 text-left
                                       hover:bg-white/[0.03] transition-colors duration-150 cursor-pointer"
                        >
                            {showChanges
                                ? <ChevronDown className="w-4 h-4 text-text-tertiary" />
                                : <ChevronRight className="w-4 h-4 text-text-tertiary" />
                            }
                            <GitBranch className="w-4 h-4 text-text-secondary" />
                            <span className="text-sm font-medium text-text-primary">Changes</span>
                        </button>
                        <button
                            onClick={handleRefreshChanges}
                            disabled={refreshing}
                            className="mr-3 flex items-center justify-center w-7 h-7 rounded-lg
                                       text-text-tertiary hover:text-text-secondary hover:bg-bg-elevated
                                       disabled:opacity-40 disabled:cursor-wait
                                       transition-all duration-200 cursor-pointer"
                            title="Compare with remote HEAD"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin-slow' : ''}`} />
                        </button>
                    </div>
                    {showChanges && (
                        <div className="px-4 pb-4 animate-slide-down">
                            {alsStruct == null ? (
                                <p className="text-sm text-text-tertiary py-2">No ALS loaded</p>
                            ) : alsStruct.ok === false ? (
                                <div className="flex items-center gap-2 text-sm text-error bg-error-soft rounded-xl px-3 py-2">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    {alsStruct.reason ?? 'An error occurred'}
                                </div>
                            ) : alsStruct.baselineStatus === 'no-commits' ? (
                                <p className="text-sm text-text-tertiary py-2 italic">
                                    No snapshots yet — this will be the initial snapshot.
                                </p>
                            ) : alsStruct.diffStatus === 'in-sync' ? (
                                <div className="flex items-center gap-2 text-sm text-success bg-success-soft rounded-xl px-3 py-2">
                                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                                    In sync with last snapshot
                                </div>
                            ) : alsStruct.diffStatus === 'has-changes' ? (
                                <div className="diff-panel rounded-xl p-3 font-mono text-xs leading-relaxed space-y-0.5">
                                    {alsStruct.summary.split('\n').map((line: string, i: number) => {
                                        const style = getDiffLineStyle(line)
                                        return (
                                            <div
                                                key={i}
                                                className={`flex items-start gap-2 px-2 py-1 rounded-md transition-colors duration-100 ${style.bg}`}
                                            >
                                                <span className={`flex-shrink-0 select-none font-semibold ${style.color}`}>
                                                    {style.icon}
                                                </span>
                                                <span className={style.color}>
                                                    {style.text}
                                                </span>
                                            </div>
                                        )
                                    })}
                                    {/* Legend */}
                                    <div className="flex items-center gap-4 pt-2 mt-2 border-t border-white/[0.04] text-[10px] text-text-tertiary">
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-diff-added" />added</span>
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-diff-removed" />removed</span>
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-diff-renamed" />renamed</span>
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-diff-moved" />moved</span>
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-diff-modified" />modified</span>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-text-tertiary py-2">
                                    Press refresh to compare with last snapshot
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Fixed Bottom Action Bar ── */}
            <div className="flex-none px-4 py-3 border-t border-border-subtle/50 bg-bg-primary/80 backdrop-blur-lg">
                <div className="flex items-center gap-2 max-w-lg mx-auto">
                    <button
                        onClick={handleGitPull}
                        disabled={pulling}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                                   bg-bg-tertiary hover:bg-bg-elevated border border-border-subtle
                                   text-sm font-medium text-text-primary
                                   disabled:opacity-50 disabled:cursor-wait
                                   active:scale-[0.97] transition-all duration-200 cursor-pointer"
                    >
                        <ArrowDownToLine className={`w-4 h-4 ${pulling ? 'animate-pulse' : ''}`} />
                        Pull
                    </button>
                    <button
                        onClick={handleGitCommit}
                        disabled={committing}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                                   btn-brand
                                   text-sm
                                   disabled:opacity-50 disabled:cursor-wait
                                   active:scale-[0.97] transition-all duration-200 cursor-pointer"
                    >
                        <Save className={`w-4 h-4 ${committing ? 'animate-pulse' : ''}`} />
                        Commit
                    </button>
                    <button
                        onClick={handleGitPush}
                        disabled={pushing}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                                   bg-bg-tertiary hover:bg-bg-elevated border border-border-subtle
                                   text-sm font-medium text-text-primary
                                   disabled:opacity-50 disabled:cursor-wait
                                   active:scale-[0.97] transition-all duration-200 cursor-pointer"
                    >
                        <ArrowUpFromLine className={`w-4 h-4 ${pushing ? 'animate-pulse' : ''}`} />
                        Push
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ProjectPage;