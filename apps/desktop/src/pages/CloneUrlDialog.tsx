import { useEffect, useMemo, useState } from 'react'
import { Download, FolderSearch, X, AlertCircle, Link as LinkIcon } from 'lucide-react'

function parseAllowedHostPort(remote: string): string {
    const trimmed = remote.trim()
    const input = trimmed.includes('://') ? trimmed : `https://${trimmed}`
    const parsed = new URL(input)
    return parsed.host.toLowerCase()
}

type ParsedInput =
    | { kind: 'gitea'; url: string; hostPort: string }
    | { kind: 'soundhaus'; owner: string; repo: string }
    | { kind: 'invalid'; reason: string }
    | null

function parseCloneInput(input: string): ParsedInput {
    const value = input.trim()
    if (!value) return null

    try {
        const parsed = new URL(value)
        const protocol = parsed.protocol.replace(':', '').toLowerCase()
        if (protocol !== 'http' && protocol !== 'https') {
            return { kind: 'invalid', reason: 'Only HTTP and HTTPS URLs are supported.' }
        }

        const pathParts = parsed.pathname.split('/').filter(Boolean)

        // Detect SoundHaus clone link: /clone/owner/repo
        if (pathParts.length >= 3 && pathParts[0] === 'clone') {
            return { kind: 'soundhaus', owner: pathParts[1], repo: pathParts[2].replace(/\.git$/, '') }
        }

        // Standard Gitea clone URL: owner/repo or owner/repo.git
        if (pathParts.length >= 2) {
            return { kind: 'gitea', url: value, hostPort: parsed.host.toLowerCase() }
        }

        return { kind: 'invalid', reason: 'URL must include owner/repository path or be a SoundHaus clone link.' }
    } catch {
        return { kind: 'invalid', reason: 'Enter a valid URL.' }
    }
}

const CloneUrlDialog = () => {
    const [cloneUrl, setCloneUrl] = useState('')
    const [clonePath, setClonePath] = useState('')
    const [allowedRemote, setAllowedRemote] = useState<string>('')
    const [allowedHostPort, setAllowedHostPort] = useState<string>('')
    const [loadingRemote, setLoadingRemote] = useState(true)

    useEffect(() => {
        const loadAllowedRemote = async () => {
            try {
                const remote = await window.patService?.getAllowedCloneRemote()
                if (remote) {
                    setAllowedRemote(remote)
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

    const parsed = useMemo(() => parseCloneInput(cloneUrl), [cloneUrl])

    const validationError = useMemo(() => {
        if (loadingRemote) return null
        if (!allowedHostPort) return 'Allowed remote is not configured. Please log in again.'
        if (!cloneUrl.trim()) return null
        if (!parsed) return null

        if (parsed.kind === 'invalid') return parsed.reason

        if (parsed.kind === 'gitea' && parsed.hostPort !== allowedHostPort) {
            return `Only repositories from ${allowedHostPort} are allowed.`
        }

        return null
    }, [allowedHostPort, cloneUrl, loadingRemote, parsed])

    const resolvedGiteaUrl = useMemo(() => {
        if (!parsed || parsed.kind === 'invalid') return null
        if (parsed.kind === 'gitea') return parsed.url
        if (parsed.kind === 'soundhaus' && allowedRemote) {
            const base = allowedRemote.replace(/\/$/, '')
            return `${base}/${parsed.owner}/${parsed.repo}.git`
        }
        return null
    }, [parsed, allowedRemote])

    const isSoundHausLink = parsed?.kind === 'soundhaus'
    const canSubmit = !loadingRemote && !validationError && !!resolvedGiteaUrl && !!clonePath.trim()

    const handleBrowseFolder = async () => {
        const folder = await window.electronAPI?.chooseFolder()
        if (folder) {
            setClonePath(folder)
        }
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!canSubmit || !resolvedGiteaUrl) return

        const data = {
            url: resolvedGiteaUrl,
            path: clonePath.trim()
        }

        window.electron?.submitCloneUrl(data)
    }

    const handleCancel = () => {
        window.electron?.cancelCloneUrl()
    }

    return (
        <div className="flex items-center justify-center w-full h-screen bg-bg-primary p-5">
            <div className="w-full max-w-md animate-scale-in">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-accent/10">
                            <Download className="w-4.5 h-4.5 text-accent" />
                        </div>
                        <h2 className="text-lg font-semibold text-text-primary">Clone Repository</h2>
                    </div>
                    <button
                        onClick={handleCancel}
                        className="flex items-center justify-center w-7 h-7 rounded-lg
                                   text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/60
                                   transition-all duration-200 cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Form Card */}
                <div className="glass-panel rounded-2xl p-5">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Repository URL */}
                        <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                                Clone Link <span className="text-accent">*</span>
                            </label>
                            <input
                                type="text"
                                autoFocus
                                value={cloneUrl}
                                onChange={(e) => setCloneUrl(e.target.value)}
                                placeholder="Paste a SoundHaus clone link or Gitea URL"
                                className="w-full px-3.5 py-2.5 rounded-xl bg-bg-primary/60 border border-border-default text-text-primary text-sm
                                           placeholder:text-text-tertiary
                                           focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent
                                           transition-all duration-200"
                            />
                        </div>

                        {/* SoundHaus link indicator */}
                        {isSoundHausLink && !validationError && (
                            <div className="flex items-center gap-2 text-xs text-accent bg-accent/5 rounded-xl px-3 py-2">
                                <LinkIcon className="w-3.5 h-3.5 flex-shrink-0" />
                                SoundHaus link detected &mdash; {(parsed as { owner: string; repo: string }).owner}/{(parsed as { owner: string; repo: string }).repo}
                            </div>
                        )}

                        {/* Validation Error */}
                        {validationError && (
                            <div className="flex items-start gap-2 text-xs text-error bg-error-soft rounded-xl px-3 py-2 animate-slide-down">
                                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                {validationError}
                            </div>
                        )}

                        {/* Clone Path */}
                        <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                                Local Path <span className="text-accent">*</span>
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={clonePath}
                                    readOnly
                                    placeholder="Choose a folder…"
                                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-bg-primary/40 border border-border-default text-text-primary text-sm
                                               placeholder:text-text-tertiary cursor-default"
                                />
                                <button
                                    type="button"
                                    onClick={handleBrowseFolder}
                                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl
                                               bg-bg-elevated border border-border-default
                                               text-sm text-text-secondary hover:text-text-primary
                                               hover:bg-bg-tertiary
                                               active:scale-[0.97] transition-all duration-200 cursor-pointer whitespace-nowrap"
                                >
                                    <FolderSearch className="w-4 h-4" />
                                    Browse
                                </button>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 pt-2">
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="flex-1 px-4 py-2.5 rounded-xl
                                           bg-bg-primary/40 border border-border-default
                                           text-sm font-medium text-text-secondary
                                           hover:text-text-primary hover:bg-bg-elevated
                                           active:scale-[0.97] transition-all duration-200 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={!canSubmit}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                                           btn-brand
                                           text-sm
                                           disabled:opacity-40 disabled:cursor-not-allowed
                                           active:scale-[0.97] transition-all duration-200 cursor-pointer"
                            >
                                <Download className="w-4 h-4" />
                                Clone
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}

export default CloneUrlDialog
