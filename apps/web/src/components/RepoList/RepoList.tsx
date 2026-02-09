import RepoCard from "../RepoCard/RepoCard"
import type { Repo } from "../../models/repo"

interface RepoListProps {
  repos: Repo[]
  onSelect?: (repoId: string) => void
}

export default function RepoList({ repos, onSelect }: RepoListProps) {
  if (!repos.length) {
    return (
      <div className="empty-state">
        <p>No projects found</p>
      </div>
    )
  }

  return (
    <div className="repo-grid">
      {repos.map((repo) => (
        <RepoCard key={repo.id} repo={repo} onSelect={onSelect} />
      ))}
    </div>
  )
}