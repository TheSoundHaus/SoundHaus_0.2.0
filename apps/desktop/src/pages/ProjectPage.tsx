import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import styles from './ProjectPage.module.css'
import useElectronIPC from '../hooks/useElectronIPC'

const ProjectPage = () => {
    const location = useLocation();
    const initialPath = (location.state as any)?.projectPath || null

    const [alsStruct, setAlsStruct] = useState<any | null>(null)
    const [selectedProject, setSelectedProject] = useState<string | null>(initialPath)

    const { getAlsStruct, findAls } = useElectronIPC()

    useEffect(() => {
        // Guard: if there's no selected project or IPC helper, do nothing.
        if (!selectedProject) {
            setAlsStruct(null)
            return
        }

        if (typeof findAls !== 'function') {
            console.warn('findAls is not available from useElectronIPC')
            setAlsStruct(null)
            return
        }

        ;(async () => {
            try {
                const alsPath = await findAls(selectedProject)
                if (alsPath) {
                    if (typeof getAlsStruct === 'function') {
                        const s = await getAlsStruct(alsPath)
                        setAlsStruct(s)
                    } else {
                        setAlsStruct(null)
                    }
                } else {
                    setAlsStruct(null)
                }
            } catch (e) {
                setAlsStruct({ ok: false, reason: e instanceof Error ? e.message : String(e) })
            }
        })()
    }, [selectedProject, findAls, getAlsStruct])

    return(
        <div className={styles.container}>
            <div className={styles.left}>
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
                        <h1>Changes</h1>
                        <p>{alsStruct}</p>
                    </div>
                )}
            </div>
            <div className={styles.right}>
                <div className={styles.buttons}>
                    <button>Pull Project Changes from Server</button>
                    <button>Push Version to Server</button>
                </div>
            </div>
        </div>
    )
}

export default ProjectPage;