import { useState } from 'react'

const CloneUrlDialog = () => {
    const [cloneUrl, setCloneUrl] = useState('')
    const [clonePath, setClonePath] = useState('')

    const handleBrowseFolder = async () => {
        const folder = await window.electronAPI?.chooseFolder()
        if (folder) {
            setClonePath(folder)
        }
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!cloneUrl.trim() || !clonePath.trim()) return

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
                        disabled={!cloneUrl.trim() || !clonePath.trim()}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '4px',
                            border: 'none',
                            background: (cloneUrl.trim() && clonePath.trim()) ? '#007acc' : '#ccc',
                            color: 'white',
                            cursor: (cloneUrl.trim() && clonePath.trim()) ? 'pointer' : 'not-allowed',
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
