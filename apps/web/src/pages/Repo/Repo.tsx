import { useEffect, useState } from "react"
import { useParams, Link } from "react-router-dom"
import { fetchRepoById } from "../../lib/api/repos"
import AudioPlayer from "../../components/AudioPlayer/AudioPlayer"
import GenreTags from "../../components/GenreTags/GenreTags"
import type { Repo } from "../../models/repo"

export default function RepoPage() {
  const { id } = useParams<{ id: string }>()
  const [repo, setRepo] = useState<Repo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'files' | 'commits'>('files')

  useEffect(() => {
    async function loadRepo() {
      if (!id) return
      try {
        setLoading(true)
        setError(null)
        const data = await fetchRepoById(id)
        if (!data) throw new Error("Project not found")

        // Ensure snippets and genres are always arrays
        setRepo({
          ...data,
          snippets: data.snippets || [],
          genres: data.genres || []
        })
      } catch (err) {
        console.error("Failed to load repo:", err)
        setError(err instanceof Error ? err.message : "Failed to load project")
      } finally {
        setLoading(false)
      }
    }

    void loadRepo()
  }, [id])

  if (loading) return <div className="loading">Loading project...</div>
  if (error) return <div className="error">{error}</div>
  if (!repo) return <div className="error">Project not found</div>

  return (
    <div className="container">
      <div className="header">
        <h1>{repo.name}</h1>
        <Link to="/repos" className="back-link">← Back to repos</Link>
      </div>

      {repo.description && (
        <div className="description">{repo.description}</div>
      )}

      {repo.genres && repo.genres.length > 0 && (
        <div className="genres">
          <GenreTags genres={repo.genres} />
        </div>
      )}

      <div className="tabs">
        <button 
          onClick={() => setActiveTab('files')}
          className={`tab ${activeTab === 'files' ? 'active' : ''}`}
        >
          Files
        </button>
        <button 
          onClick={() => setActiveTab('commits')}
          className={`tab ${activeTab === 'commits' ? 'active' : ''}`}
        >
          Commits
        </button>
      </div>

      {activeTab === 'files' && (
        <div className="files-grid">
          {repo.snippets && repo.snippets.length > 0 ? (
            repo.snippets.map((snippet) => (
              <div key={snippet.id} className="file-card">
                <div className="file-header">
                  <h3>{snippet.title}</h3>
                </div>
                <AudioPlayer src={snippet.src} />
              </div>
            ))
          ) : (
            <div className="empty-state">No audio files found</div>
          )}
        </div>
      )}

      {activeTab === 'commits' && (
        <div className="commits-list">
          <div className="empty-state">Commit history coming soon</div>
        </div>
      )}
    </div>
  )
}