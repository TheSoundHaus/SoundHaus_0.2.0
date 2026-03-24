import { useEffect, useMemo, useState } from 'react'
import { Link, FolderOpen, Download, X, AlertCircle } from 'lucide-react'

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

        window.electron?.submitCloneUrl(data)
    }

    const handleCancel = () => {
        window.electron?.cancelCloneUrl()
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-5">
            <div className="card-glass w-full max-w-md animate-scale-in">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-glass-blue/10 flex items-center justify-center">
                            <Download className="w-4 h-4 text-glass-blue" />
                        </div>
                        <h2 className="text-base font-semibold text-soft-white">Clone Repository</h2>
                    </div>
                    <button
                        onClick={handleCancel}
                        className="p-1.5 rounded-btn hover:bg-white/5 transition-colors"
                    >
                        <X className="w-4 h-4 text-muted" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    {/* Repository URL */}
                    <div>
                        <label className="label">
                            Repository URL <span className="text-glass-blue">*</span>
                        </label>
                        <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <Link className="w-4 h-4 text-muted" />
                            </div>
                            <input
                                type="text"
                                autoFocus
                                value={cloneUrl}
                                onChange={(e) => setCloneUrl(e.target.value)}
                                placeholder="https://gitea.example.com/user/repo.git"
                                className={`input pl-10 ${validationError ? 'input-error' : ''}`}
                            />
                        </div>
                        {validationError && (
                            <div className="flex items-center gap-1.5 mt-2">
                                <AlertCircle className="w-3.5 h-3.5 text-error flex-shrink-0" />
                                <span className="error-text mt-0">{validationError}</span>
                            </div>
                        )}
                    </div>

                    {/* Clone Path */}
                    <div>
                        <label className="label">
                            Local Path <span className="text-glass-blue">*</span>
                        </label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                    <FolderOpen className="w-4 h-4 text-muted" />
                                </div>
                                <input
                                    type="text"
                                    value={clonePath}
                                    onChange={(e) => setClonePath(e.target.value)}
                                    placeholder="Select a folder..."
                                    readOnly
                                    className="input pl-10 cursor-default"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleBrowseFolder}
                                className="btn btn-ghost text-xs flex-shrink-0"
                            >
                                Browse
                            </button>
                        </div>
                        {clonePath && (
                            <p className="helper-text font-mono text-xs truncate">{clonePath}</p>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 justify-end mt-2">
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="btn btn-ghost"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!canSubmit}
                            className="btn btn-primary"
                        >
                            <Download className="w-4 h-4" />
                            Clone
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default CloneUrlDialog
