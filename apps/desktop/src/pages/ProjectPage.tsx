import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import styles from './ProjectPage.module.css'
import { useAlsParser } from '../hooks/useAlsParser'
import useElectronIPC from '../hooks/useElectronIPC'
import { useProjectGitActions } from '../hooks/useProjectGitActions'
import type { GitError } from '../hooks/useProjectGitActions'
import electronAPI from '../services/electronAPI';
import PianoRollCanvas from '../components/diff/PianoRollCanvas';

type CommitEntry = {
    hash: string;
    shortHash: string;
    subject: string;
    author: string;
    timestamp: string;
};

type SnapshotNote = {
    pitch: number;
    start_beat: number;
    duration_beats: number;
    velocity: number;
    note_id?: string | null;
};

type NoteDiff = {
    added: SnapshotNote[];
    removed: SnapshotNote[];
    adjusted: Array<{ from: SnapshotNote; to: SnapshotNote }>;
};

const ProjectPage = () => {
    const location = useLocation();
    const selectedProject = (location.state as any)?.projectPath || null

    const [alsStruct, setAlsStruct] = useState<any | null>(null)
    // Track Information closed by default, Changes open by default
    const [showTrackInfo, setShowTrackInfo] = useState<boolean>(false)
    const [showChanges, setShowChanges] = useState<boolean>(true)

    const [refreshing, setRefreshing] = useState(false)
    const [historyLoading, setHistoryLoading] = useState(false)
    const [history, setHistory] = useState<CommitEntry[]>([])
    const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
    const [selectedCommitSummary, setSelectedCommitSummary] = useState<string>('')
    const [selectedNoteDiff, setSelectedNoteDiff] = useState<NoteDiff | null>(null)

    const { findAndParse } = useAlsParser()
    const { findAls } = useElectronIPC()
    const { runPull, runCommit, runPush } = useProjectGitActions()

    const noteCounts = {
        added: selectedNoteDiff?.added.length ?? 0,
        removed: selectedNoteDiff?.removed.length ?? 0,
        adjusted: selectedNoteDiff?.adjusted.length ?? 0,
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
            setSelectedNoteDiff(result.noteDiff ?? { added: [], removed: [], adjusted: [] })
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
        if(!selectedProject) return
        try {
            const result = await runCommit(selectedProject)
            alert(`Commit complete:\n${result}`)
            // After a commit the working tree matches HEAD — show in-sync immediately
            // without a round-trip diff (which would always return empty).
            setAlsStruct((prev: any) => prev ? { ...prev, diffStatus: 'in-sync', summary: '' } : prev)
        } catch(error) {
            alert(`Commit failed:\n${error}`)
        }
    }

    const handleGitPush = async () => {
        if(!selectedProject) return
        try {
            const result = await runPush(selectedProject)
            alert(`Push complete:\n${result}`)
            await handleRefreshChanges()
        } catch(error) {
            alert(`Push failed:\n${error}`)
        }
    }

    useEffect(() => {
        handleRefreshChanges()
    }, [handleRefreshChanges])

    useEffect(() => {
        handleLoadHistory()
    }, [handleLoadHistory])

    useEffect(() => {
        const onRefreshRequest = (event: Event) => {
            const customEvent = event as CustomEvent<{ projectPath?: string }>
            if (!selectedProject) return
            if (customEvent.detail?.projectPath !== selectedProject) return
            void handleRefreshChanges()
        }

        window.addEventListener('soundhaus:project-refresh-request', onRefreshRequest)

        return () => {
            window.removeEventListener('soundhaus:project-refresh-request', onRefreshRequest)
        }
    }, [handleRefreshChanges, selectedProject])

    return(
        <div className={styles.container}>
            <div className={styles.left}>
                {/* Track Information dropdown - exact block requested */}
                <div style={{ border: '1px solid #e6e6e6', borderRadius: 6, marginBottom: 12, overflow: 'hidden' }}>
                    <button
                        onClick={() => setShowTrackInfo(s => !s)}
                        aria-expanded={showTrackInfo}
                        style={{ width: '100%', padding: '8px 12px', textAlign: 'left', background: '#fafafa', border: 'none', cursor: 'pointer' }}
                    >
                        Track Information <span style={{ float: 'right' }}>{showTrackInfo ? '▾' : '▸'}</span>
                    </button>
                    {showTrackInfo && (
                        <div style={{ padding: 12, background: '#fff' }}>
                            {alsStruct == null ? (
                                <div>
                                    <p>No ALS loaded</p>
                                </div>
                            ) : alsStruct.ok === false ? (
                                <div className={styles.error}>
                                    <p>{alsStruct.reason ?? 'An error occurred'}</p>
                                </div>
                            ) : alsStruct.project?.Tracks ? (
                                <div>
                                    <div style={{ display: 'grid', gap: '8px' }}>
                                        {alsStruct.project.Tracks.map((track: any, i: number) => (
                                            <div key={i} className={styles.changeItem}>
                                                <strong>{track.EffectiveName || 'Unnamed Track'}</strong>
                                                <div style={{ fontSize: '0.9em', color: '#666' }}>
                                                    Type: {track.Type} | ID: {track.Id}
                                                    {track.UserName && ` | User: ${track.UserName}`}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <p>No tracks found</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Changes dropdown - exact block requested */}
                <div style={{ border: '1px solid #e6e6e6', borderRadius: 6, marginBottom: 12, overflow: 'hidden' }}>
                    <button
                        onClick={() => setShowChanges(s => !s)}
                        aria-expanded={showChanges}
                        style={{ width: '100%', padding: '8px 12px', textAlign: 'left', background: '#fafafa', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                        <span>Changes <span style={{ marginLeft: '8px' }}>{showChanges ? '▾' : '▸'}</span></span>
                        <span
                            role="button"
                            tabIndex={0}
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
                            aria-disabled={refreshing}
                            style={{ 
                                padding: '4px 8px', 
                                fontSize: '12px', 
                                background: '#fff', 
                                border: '1px solid #ccc', 
                                borderRadius: '4px', 
                                cursor: refreshing ? 'wait' : 'pointer',
                                opacity: refreshing ? 0.6 : 1,
                                userSelect: 'none'
                            }}
                            title="Compare with remote HEAD"
                        >
                            {refreshing ? '⟳' : '↻'}
                        </span>
                    </button>
                    {showChanges && (
                        <div style={{ padding: 12, background: '#fff' }}>
                            {alsStruct == null ? (
                                <div>
                                    <p>No ALS loaded</p>
                                </div>
                            ) : alsStruct.ok === false ? (
                                <div className={styles.error}>
                                    <p>{alsStruct.reason ?? 'An error occurred'}</p>
                                </div>
                            ) : alsStruct.baselineStatus === 'no-commits' ? (
                                <div>
                                    <p style={{ color: '#888' }}>No snapshots yet — this will be the initial snapshot.</p>
                                </div>
                            ) : alsStruct.diffStatus === 'in-sync' ? (
                                <div>
                                    <p style={{ color: '#4caf50' }}>✓ In sync with last snapshot</p>
                                </div>
                            ) : alsStruct.diffStatus === 'has-changes' ? (
                                <div>
                                    <div style={{ padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                                        {alsStruct.summary.split('\n').map((line: string, i: number) => (
                                        <div key={i} style={{ marginBottom: '4px', whiteSpace: 'pre-wrap' }}>{line}</div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <p style={{ color: '#888' }}>Press ↻ to compare with last snapshot</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div style={{ border: '1px solid #e6e6e6', borderRadius: 6, marginBottom: 12, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '8px 12px', background: '#fafafa', borderBottom: '1px solid #eee' }}>
                        <span>Commit History</span>
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
                            style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                background: '#fff',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                cursor: historyLoading ? 'wait' : 'pointer',
                                opacity: historyLoading ? 0.6 : 1,
                                userSelect: 'none'
                            }}
                            title="Refresh commit history"
                        >
                            {historyLoading ? '⟳' : '↻'}
                        </span>
                    </div>
                    <div style={{ padding: 12, background: '#fff', maxHeight: 240, overflowY: 'auto' }}>
                        {historyLoading ? (
                            <p style={{ color: '#888' }}>Loading commit history...</p>
                        ) : history.length === 0 ? (
                            <p style={{ color: '#888' }}>No commits found.</p>
                        ) : (
                            <div style={{ display: 'grid', gap: 8 }}>
                                {history.map((entry) => (
                                    <button
                                        key={entry.hash}
                                        onClick={() => handleSelectCommit(entry.hash)}
                                        style={{
                                            textAlign: 'left',
                                            border: selectedCommit === entry.hash ? '1px solid #999' : '1px solid #e2e2e2',
                                            background: selectedCommit === entry.hash ? '#f7f7f7' : '#fff',
                                            borderRadius: 6,
                                            padding: 8,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <div style={{ fontWeight: 600 }}>{entry.subject}</div>
                                        <div style={{ fontSize: 12, color: '#666' }}>{entry.shortHash} • {entry.author}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <section className={styles.commitDiffSection}>
                    <div className={styles.commitDiffHeader}>
                        <h3 className={styles.commitDiffTitle}>Selected Commit Details</h3>
                        {selectedCommit && (
                            <span className={styles.commitPill}>{selectedCommit.slice(0, 7)}</span>
                        )}
                    </div>

                    <div className={styles.commitDiffBody}>
                        {!selectedCommit ? (
                            <p style={{ color: '#888' }}>Pick a commit above to view both semantic and MIDI note differences.</p>
                        ) : (
                            <>
                                <div style={{ border: '1px solid #e6e6e6', borderRadius: 8, overflow: 'hidden' }}>
                                    <div style={{ padding: '8px 12px', background: '#fafafa', borderBottom: '1px solid #eee', fontWeight: 600 }}>
                                        Semantic Summary
                                    </div>
                                    <div style={{ padding: 12 }}>
                                        {selectedCommitSummary ? (
                                            <div style={{ padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                                                {selectedCommitSummary.split('\n').map((line: string, i: number) => (
                                                    <div key={i} style={{ marginBottom: '4px', whiteSpace: 'pre-wrap' }}>{line}</div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p style={{ color: '#888' }}>No summary for this commit.</p>
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

                                <div style={{ marginTop: 4 }}>
                                    {hasNoteChanges ? (
                                        <PianoRollCanvas noteDiff={selectedNoteDiff} />
                                    ) : (
                                        <div style={{ border: '1px solid #e6e6e6', borderRadius: 8, padding: 12, background: '#fff' }}>
                                            <p style={{ color: '#888', margin: 0 }}>No MIDI note changes detected for this commit.</p>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </section>
            </div>
            <div className={styles.right}>
                <div className={styles.buttons}>
                    <button onClick={handleGitPull}>Download Changes from Server</button>
                    <button onClick={handleGitCommit}>Save Changes in Snapshot</button>
                    <button onClick={handleGitPush}>Upload Changes to Server</button>
                </div>
            </div>
        </div>
    )
}

export default ProjectPage;