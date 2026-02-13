import type { Repo } from "../../models/repo"

interface RepoCardProps {
  repo: Repo
  onSelect?: (repoId: string) => void
}

export default function RepoCard({ repo, onSelect }: RepoCardProps) {
  const handleCardClick = () => {
    if (onSelect) {
      onSelect(repo.id)
    }
  }

  const handleOpenClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onSelect) {
      onSelect(repo.id)
    }
  }

  return (
    <div className="repo-card" onClick={handleCardClick}>
      <div className="repo-card-header">
        <h3 className="repo-card-name">{repo.name}</h3>
      </div>

      {repo.description && (
        <p className="repo-card-description">{repo.description}</p>
      )}

      <div className="repo-card-footer">
        <div className="repo-collaborators">
          <div className="collaborator-circle" title="You">
            👤
          </div>
          {/* Placeholder for additional collaborators */}
        </div>

        <button
          className="repo-open-button"
          onClick={handleOpenClick}
        >
          Open
        </button>
      </div>
    </div>
  )
}