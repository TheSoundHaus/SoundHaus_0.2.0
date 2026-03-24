import RepositoryCard from "./RepositoryCard";

/**
 * RepositoryList Component - Grid/List view of repositories
 * Renders multiple repository cards in a responsive layout
 *
 * @param repositories - Array of repository data
 * @param viewMode - Display mode (grid or list)
 */

interface Repository {
  id: string;
  title: string;
  author: string;
  updatedAt: string;
  stats: {
    stars: number;
    tracks?: number;
    collaborators?: number;
    commits?: number;
  };
  isPublic?: boolean;
  cloneCount: number;
  audioSnippet?: string | null;
  isStarred?: boolean;
  isOwner?: boolean;
  genres?: string[];
}

interface RepositoryListProps {
  repositories: Repository[];
  viewMode?: "grid" | "list";
}

export default function RepositoryList({
  repositories,
  viewMode = "grid",
}: RepositoryListProps) {
  if (repositories.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 p-12 text-center">
        <p className="text-lg text-zinc-400">No projects found</p>
      </div>
    );
  }

  return (
    <div
      className={
        viewMode === "grid"
          ? "grid gap-6 md:grid-cols-2 lg:grid-cols-3"
          : "flex flex-col gap-4"
      }
    >
      {repositories.map((repo) => (
        <RepositoryCard
          key={repo.id}
          id={repo.id}
          title={repo.title}
          author={repo.author}
          updatedAt={repo.updatedAt}
          stats={repo.stats}
          isPublic={repo.isPublic}
          cloneCount={repo.cloneCount}
          audioSnippet={repo.audioSnippet}
          isStarred={repo.isStarred}
          isOwner={repo.isOwner}
          genres={repo.genres}
        />
      ))}
    </div>
  );
}
