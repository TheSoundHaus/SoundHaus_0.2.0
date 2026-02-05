import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import styles from './ProjectPage.module.css'
import { useAlsParser } from '../hooks/useAlsParser'
import useElectronIPC from '../hooks/useElectronIPC'
import gitService from '../services/gitService'

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

    const { metadata, findAndParse } = useAlsParser()
    const { getAlsStruct, findAls } = useElectronIPC()

    const refreshChanges = useCallback(async () => {
        if (!selectedProject) {
            setAlsStruct(null)
            return
        }

        if (typeof findAls !== 'function') {
            console.warn('findAls is not available from useElectronIPC')
            setAlsStruct(null)
            return
        }

        findAndParse(selectedProject)

        try {
            const alsPath = await findAls(selectedProject)
            if (alsPath && typeof getAlsStruct === 'function') {
                const s = await getAlsStruct(alsPath)
                setAlsStruct(s)
            } else {
                setAlsStruct(null)
            }
        } catch (e) {
            setAlsStruct({ ok: false, reason: e instanceof Error ? e.message : String(e) })
        }
    }, [findAls, findAndParse, getAlsStruct, selectedProject])

    const handleGitPull = async () => {
        if(!selectedProject) return
        setPulling(true)
        try {
            const result = await gitService.pullRepo(selectedProject)
            alert(`Pull complete:\n${result}`)
            await refreshChanges()
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
            await refreshChanges()
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
            await refreshChanges()
        } catch(error) {
            alert(`Push failed:\n${error}`)
        } finally {
            setPushing(false)
        }
    }

    useEffect(() => {
        refreshChanges()
    }, [refreshChanges])

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
                            {metadata && (
                            typeof metadata === 'string' ? (
                                <div className="als-raw">
                                <pre style={{ whiteSpace: 'pre-wrap' }}>{metadata}</pre>
                                </div>
                            ) : (
                                <div className="als-placeholder">
                                {selectedProject
                                    ? 'No .als file found in project'
                                    : 'Select a project to view ALS content'}
                                </div>
                            )
                            )}
                        </div>
                    )}
                </div>

                {/* Changes dropdown - exact block requested */}
                <div style={{ border: '1px solid #e6e6e6', borderRadius: 6, marginBottom: 12, overflow: 'hidden' }}>
                    <button
                        onClick={() => setShowChanges(s => !s)}
                        aria-expanded={showChanges}
                        style={{ width: '100%', padding: '8px 12px', textAlign: 'left', background: '#fafafa', border: 'none', cursor: 'pointer' }}
                    >
                        Changes <span style={{ float: 'right' }}>{showChanges ? '▾' : '▸'}</span>
                    </button>
                    {showChanges && (
                        <div style={{ padding: 12, background: '#fff' }}>
                            {alsStruct == null ? (
                                    <div>
                                        <h1>Changes</h1>
                                        <p>No ALS loaded</p>
                                    </div>
                                ) : alsStruct.ok === false ? (
                                    <div className={styles.error}>
                                        <h1>Changes</h1>
                                        <p>{alsStruct.reason ?? 'An error occurred'}</p>
                                    </div>
                                ) : (
                                    <div className={styles.metadata}>
                                        {alsStruct && typeof alsStruct === 'object' ? (
                                            Array.isArray((alsStruct as any).changes) ? (
                                                <div>
                                                    <div>
                                                        {((alsStruct as any).changes as any[]).map((c, i) => (
                                                            <div key={i} className={styles.changeItem}>
                                                                <strong>{c.trackName ?? c.trackId ?? `Change ${i + 1}`}</strong>
                                                                <div>Before: {c.beforeTrackName ?? '—'} {c.before?.name ? `(${c.before.name})` : ''}</div>
                                                                <div>After: {c.afterTrackName ?? '—'} {c.after?.name ? `(${c.after.name})` : ''}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(alsStruct, null, 2)}</pre>
                                            )
                                        ) : (
                                            <pre style={{ whiteSpace: 'pre-wrap' }}>{String(alsStruct)}</pre>
                                        )}
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