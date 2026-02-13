import { useCallback, useEffect, useState } from "react"
import RepoList from "../../components/RepoList/RepoList"
import RepoViewer from "../Repo/components/RepoViewer"
import { fetchPublicRepos } from "../../lib/api/repos"
import type { Repo } from "../../models/repo"
import "./Repos.css"

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000"

type Invitation = {
    invitation_id: string
    owner_email: string
    repo_name: string
    permission: string
}

export default function ReposPage() {
    const [repos, setRepos] = useState<Repo[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [selectedRepo, setSelectedRepo] = useState<string | null>(null)
    const [createName, setCreateName] = useState("")
    const [createDescription, setCreateDescription] = useState("")
    const [createPrivate, setCreatePrivate] = useState(true)
    const [creating, setCreating] = useState(false)
    const [pendingInvitations, setPendingInvitations] = useState<Invitation[]>([])
    const [invitesLoading, setInvitesLoading] = useState(false)

    const loadRepos = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)
            const data = await fetchPublicRepos()
            // Transform PublicRepo[] to Repo[] for RepoList component
            const transformed: Repo[] = data.map((r) => ({
                id: r.gitea_id,
                name: r.name,
                description: r.description,
                owner: r.owner,
            }))
            setRepos(transformed)
        } catch (err) {
            console.error("[ReposPage] Failed to load repos", err)
            setError(err instanceof Error ? err.message : "Failed to load projects")
        } finally {
            setLoading(false)
        }
    }, [])

    const loadInvitations = useCallback(async () => {
        const token = localStorage.getItem("access_token")
        if (!token) {
            setPendingInvitations([])
            return
        }

        try {
            setInvitesLoading(true)
            const response = await fetch(`${API_URL}/invitations/pending`, {
                headers: { Authorization: `Bearer ${token}` },
            })

            const data = await response.json()
            if (response.ok && data?.success) {
                setPendingInvitations(Array.isArray(data.invitations) ? data.invitations : [])
            } else {
                console.warn("[ReposPage] Unexpected invitations payload", data)
                setPendingInvitations([])
            }
        } catch (err) {
            console.error("[ReposPage] Failed to load invitations", err)
        } finally {
            setInvitesLoading(false)
        }
    }, [])

    useEffect(() => {
        void loadRepos()
        void loadInvitations()
    }, [loadRepos, loadInvitations])

    const handleCreateRepo = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!createName.trim()) {
            setError("Project name is required")
            return
        }

        const token = localStorage.getItem("access_token") || ""
        if (!token) {
            setError("No access token found. Please log in again.")
            return
        }

        try {
            setCreating(true)
            setError(null)
            const response = await fetch(`${API_URL}/repos`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    name: createName.trim(),
                    description: createDescription.trim() || undefined,
                    private: createPrivate,
                }),
            })

            const data = await response.json()
            if (!response.ok || !data?.success) {
                throw new Error(data?.error || data?.message || "Failed to create project")
            }

            setCreateName("")
            setCreateDescription("")
            setCreatePrivate(true)
            await loadRepos()
        } catch (err) {
            console.error("[ReposPage] Failed to create repo", err)
            setError(err instanceof Error ? err.message : "Failed to create project")
        } finally {
            setCreating(false)
        }
    }

    const handleAcceptInvitation = async (invitationId: string) => {
        const token = localStorage.getItem("access_token")
        if (!token) return

        try {
            const response = await fetch(`${API_URL}/invitations/${invitationId}/accept`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            })

            const data = await response.json()
            if (!response.ok || !data?.success) {
                throw new Error(data?.message || "Unable to accept invitation")
            }

            await Promise.all([loadInvitations(), loadRepos()])
        } catch (err) {
            console.error("[ReposPage] accept invitation failed", err)
            setError(err instanceof Error ? err.message : "Unable to accept invitation")
        }
    }

    const handleDeclineInvitation = async (invitationId: string) => {
        const token = localStorage.getItem("access_token")
        if (!token) return

        try {
            const response = await fetch(`${API_URL}/invitations/${invitationId}/decline`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            })

            const data = await response.json()
            if (!response.ok || !data?.success) {
                throw new Error(data?.message || "Unable to decline invitation")
            }

            await loadInvitations()
        } catch (err) {
            console.error("[ReposPage] decline invitation failed", err)
            setError(err instanceof Error ? err.message : "Unable to decline invitation")
        }
    }

    if (selectedRepo) {
        return (
            <RepoViewer repoName={selectedRepo} onBack={() => setSelectedRepo(null)} />
        )
    }

    return (
        <div className="repos-page">
            <header className="repos-header">
                <div>
                    <h1>Projects</h1>
                    <p>Manage your projects, invites, and watch setups from one hub.</p>
                </div>
            </header>

            {error && <div className="error-banner glass-panel">{error}</div>}

            <div className="repos-grid">
                <aside className="repos-sidebar">
                    <section className="glass-panel sidebar-card">
                        <div className="sidebar-heading">
                            <h2>Create project</h2>
                            <p>Spin up a fresh project for stems, sessions, or shared assets.</p>
                        </div>
                        <form onSubmit={handleCreateRepo} className="create-form">
                            <label>
                                <span>Project name</span>
                                <input
                                    type="text"
                                    value={createName}
                                    onChange={(event) => setCreateName(event.target.value)}
                                    placeholder="lofi-jams"
                                    disabled={creating}
                                    required
                                />
                            </label>

                            <label>
                                <span>Description</span>
                                <textarea
                                    value={createDescription}
                                    onChange={(event) => setCreateDescription(event.target.value)}
                                    placeholder="What's inside this project?"
                                    disabled={creating}
                                    rows={2}
                                />
                            </label>

                            <label className="checkbox">
                                <input
                                    type="checkbox"
                                    checked={createPrivate}
                                    onChange={(event) => setCreatePrivate(event.target.checked)}
                                    disabled={creating}
                                />
                                <span>Make this project private</span>
                            </label>

                            <button type="submit" className="button-primary compact" disabled={creating}>
                                {creating ? "Creating..." : "Create project"}
                            </button>
                        </form>
                    </section>

                    <section className="glass-panel sidebar-card">
                        <div className="sidebar-heading">
                            <h2>Pending invitations</h2>
                            <p>Respond to invites to join shared projects.</p>
                        </div>
                        {invitesLoading ? (
                            <div className="loading-state">Checking for invites...</div>
                        ) : pendingInvitations.length ? (
                            <ul className="invite-list">
                                {pendingInvitations.map((invite) => (
                                    <li key={invite.invitation_id}>
                                        <div className="invite-meta">
                                            <span className="invite-repo">{invite.repo_name}</span>
                                            <span className="invite-owner">from {invite.owner_email}</span>
                                            <span className="invite-permission">{invite.permission}</span>
                                        </div>
                                        <div className="invite-actions">
                                            <button
                                                type="button"
                                                className="button-primary compact"
                                                onClick={() => void handleAcceptInvitation(invite.invitation_id)}
                                            >
                                                Accept
                                            </button>
                                            <button
                                                type="button"
                                                className="button-ghost compact"
                                                onClick={() => void handleDeclineInvitation(invite.invitation_id)}
                                            >
                                                Decline
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="empty-state subtle">No pending invitations right now.</div>
                        )}
                    </section>
                </aside>

                <section className="repos-main">
                    {loading ? (
                        <div className="loading-state">Loading projects...</div>
                    ) : repos.length ? (
                        <RepoList repos={repos} onSelect={setSelectedRepo} />
                    ) : (
                        <div className="empty-state">No projects yet. Create your first one.</div>
                    )}
                </section>
            </div>
        </div>
    )
}