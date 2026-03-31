import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useAlsParser } from '../hooks/useAlsParser'
import useElectronIPC from '../hooks/useElectronIPC'
import { useProjectGitActions } from '../hooks/useProjectGitActions'
import electronAPI from '../services/electronAPI';

const ProjectPage = () => {
    const location = useLocation();
    const selectedProject = (location.state as any)?.projectPath || null

    const [alsStruct, setAlsStruct] = useState<any | null>(null)
    // Track Information closed by default, Changes open by default
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
            alert(`Pull complete:\n${result}`)
            await handleRefreshChanges()
        } catch(error) {
            alert(`Pull failed:\n${error}`)
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
        <div className="project-container">
            <div className="project-left">
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
                                <div className="project-error">
                                    <p>{alsStruct.reason ?? 'An error occurred'}</p>
                                </div>
                            ) : alsStruct.project?.Tracks ? (
                                <div>
                                    <div style={{ display: 'grid', gap: '8px' }}>
                                        {alsStruct.project.Tracks.map((track: any, i: number) => (
                                            <div key={i} className="project-change-item">
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
                                <div className="project-error">
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
                                            <div key={i} style={{ marginBottom: '4px' }}>{line}</div>
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
            </div>
            <div className="project-right">
                <div className="project-buttons">
                    <button onClick={handleGitPull}>Download Changes from Server</button>
                    <button onClick={handleGitCommit}>Save Changes in Snapshot</button>
                    <button onClick={handleGitPush}>Upload Changes to Server</button>
                </div>
            </div>
        </div>
    )
}

export default ProjectPage;