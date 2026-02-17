import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import styles from './ProjectPage.module.css'
import { useAlsParser } from '../hooks/useAlsParser'
import useElectronIPC from '../hooks/useElectronIPC'
import gitService from '../services/gitService'
import electronAPI from '../services/electronAPI';

const ProjectPage = () => {
    const location = useLocation();
    const initialPath = (location.state as any)?.projectPath || null

    const [alsStruct, setAlsStruct] = useState<any | null>(null)
    const [selectedProject, setSelectedProject] = useState<string | null>(initialPath)
    // Track Information closed by default, Changes open by default
    const [showTrackInfo, setShowTrackInfo] = useState<boolean>(false)
    const [showChanges, setShowChanges] = useState<boolean>(true)

    const [pulling, setPulling] = useState(false)
    const [pushing, setPushing] = useState(false)
    const [comitting, setComitting] = useState(false)
    const [refreshing, setRefreshing] = useState(false)

    const { metadata, findAndParse } = useAlsParser()
    const { getAlsStruct, findAls } = useElectronIPC()

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

            // Get remote HEAD version and save it temporarily
            const remoteResult = await electronAPI.getRemoteHeadAls(alsPath)
            
            if (!remoteResult.ok) {
                setAlsStruct({ ok: false, reason: remoteResult.error || 'Failed to fetch remote HEAD' })
                return
            }

            if (remoteResult.baselineStatus === 'no-commits') {
                setAlsStruct(remoteResult)
                return
            }

            // Compare current file with remote HEAD
            const diffResult = await electronAPI.diffXml(alsPath, remoteResult.tmpPath)
            const parsed = typeof diffResult === 'string' ? JSON.parse(diffResult) : diffResult
            setAlsStruct(parsed)
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
        setComitting(true)
        try {
            const result = await gitService.commitChange(selectedProject)
            alert(`Commit complete:\n${result}`)
            await handleRefreshChanges()
        } catch(error) {
            alert(`Commit failed:\n${error}`)
        } finally {
            setComitting(false)
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
                            ) : alsStruct.summary ? (
                                <div>
                                    <div style={{ padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                                        {alsStruct.summary.split('\n').map((line: string, i: number) => (
                                            <div key={i} style={{ marginBottom: '4px' }}>{line}</div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <p>No changes detected</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
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