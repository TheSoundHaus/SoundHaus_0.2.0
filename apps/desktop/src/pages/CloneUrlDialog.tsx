import { useEffect, useMemo, useState } from 'react'

function parseAllowedHostPort(remote: string): string {
    const trimmed = remote.trim()
    const input = trimmed.includes('://') ? trimmed : `https://${trimmed}`
    const parsed = new URL(input)
    return parsed.host.toLowerCase()
}

function getCloneUrlHostPort(url: string): string | null {
    const value = url.trim()
    if (!value) return null

    try {
        const parsed = new URL(value)
        const protocol = parsed.protocol.replace(':', '').toLowerCase()
        if (protocol !== 'http' && protocol !== 'https') {
            return null
        }

        const pathParts = parsed.pathname.split('/').filter(Boolean)
        if (pathParts.length < 2) {
            return null
        }

        return parsed.host.toLowerCase()
    } catch {
        return null
    }
}

const CloneUrlDialog = () => {
    const [cloneUrl, setCloneUrl] = useState('')
    const [clonePath, setClonePath] = useState('')
    const [allowedHostPort, setAllowedHostPort] = useState<string>('')
    const [loadingRemote, setLoadingRemote] = useState(true)

    useEffect(() => {
        const loadAllowedRemote = async () => {
            try {
                const remote = await window.patService?.getAllowedCloneRemote()
                if (remote) {
                    setAllowedHostPort(parseAllowedHostPort(remote))
                }
            } catch (error) {
                console.warn('Failed to load allowed clone remote:', error)
            } finally {
                setLoadingRemote(false)
            }
        }

        void loadAllowedRemote()
    }, [])

    const validationError = useMemo(() => {
        if (loadingRemote) return null
        if (!allowedHostPort) return 'Allowed remote is not configured. Please log in again.'
        if (!cloneUrl.trim()) return null

        const cloneHostPort = getCloneUrlHostPort(cloneUrl)
        if (!cloneHostPort) {
            return 'Enter a valid HTTP or HTTPS clone URL with owner/repository path.'
        }

        if (cloneHostPort !== allowedHostPort) {
            return `Only repositories from ${allowedHostPort} are allowed.`
        }

        return null
    }, [allowedHostPort, cloneUrl, loadingRemote])

    const canSubmit = !loadingRemote && !validationError && !!cloneUrl.trim() && !!clonePath.trim()

    const handleBrowseFolder = async () => {
        const folder = await window.electronAPI?.chooseFolder()
        if (folder) {
            setClonePath(folder)
        }
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!canSubmit) return

        const data = {
            url: cloneUrl.trim(),
            path: clonePath.trim()
        }

        // Send data back to main process
        window.electron?.submitCloneUrl(data)
    }

    const handleCancel = () => {
        window.electron?.cancelCloneUrl()
    }

    return (
        <div style={{ padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <h2 style={{ marginTop: 0 }}>Clone Repository</h2>
            
            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 500 }}>
                        Repository URL *
                    </label>
                    <input
                        type="text"
                        autoFocus
                        value={cloneUrl}
                        onChange={(e) => setCloneUrl(e.target.value)}
                        placeholder="https://gitea.example.com/user/repo.git"
                        style={{
                            width: '100%',
                            padding: '8px',
                            boxSizing: 'border-box',
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                            fontSize: '14px'
                        }}
                    />
                </div>

                {validationError && (
                    <div style={{ marginBottom: '15px', color: '#b00020', fontSize: '12px' }}>
                        {validationError}
                    </div>
                )}

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 500 }}>
                        Clone to Local Path *
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                            type="text"
                            value={clonePath}
                            onChange={(e) => setClonePath(e.target.value)}
                            placeholder="/path/to/local/repo"
                            readOnly
                            style={{
                                flex: 1,
                                padding: '8px',
                                boxSizing: 'border-box',
                                borderRadius: '4px',
                                border: '1px solid #ccc',
                                fontSize: '14px',
                                backgroundColor: '#f5f5f5',
                                cursor: 'default'
                            }}
                        />
                        <button
                            type="button"
                            onClick={handleBrowseFolder}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '4px',
                                border: '1px solid #ccc',
                                background: '#f5f5f5',
                                cursor: 'pointer',
                                fontSize: '14px',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            Browse
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                    <button
                        type="button"
                        onClick={handleCancel}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                            background: '#f5f5f5',
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={!canSubmit}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '4px',
                            border: 'none',
                            background: canSubmit ? '#007acc' : '#ccc',
                            color: 'white',
                            cursor: canSubmit ? 'pointer' : 'not-allowed',
                            fontSize: '14px'
                        }}
                    >
                        Clone
                    </button>
                </div>
            </form>
        </div>
    )
}

export default CloneUrlDialog
