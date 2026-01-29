import Link from "next/link";

/**
 * RepositoryCard Component - Displays repository overview information
 * Used in Explore and Personal Repositories pages
 *
 * @param id - Repository ID for routing
 * @param title - Repository name
 * @param author - Repository owner username
 * @param updatedAt - Last update timestamp
 * @param stats - Object containing repository statistics
 * @param isPublic - Whether repository is public or private
 */

interface RepositoryCardProps {
  id: string;
  title: string;
  author: string;
  updatedAt: string;
  stats: {
    stars?: number;
    tracks: number;
    collaborators: number;
    commits?: number;
  };
  isPublic?: boolean;
}

export default function RepositoryCard({
  id,
  title,
  author,
  updatedAt,
  stats,
  isPublic = true,
}: RepositoryCardProps) {
  return (
    <Link
      href={`/repository/${id}`}
      className="block rounded-lg border border-zinc-800 p-6 transition-colors hover:border-zinc-700 hover:bg-zinc-800/50"
    >
      {/* Thumbnail placeholder */}
      <div className="mb-4 h-32 rounded bg-zinc-800"></div>

      {/* Repository info */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
        {!isPublic && (
          <span className="text-xs text-zinc-500">Private</span>
        )}
      </div>

      <p className="mb-4 text-sm text-zinc-400">
        By {author} • {updatedAt}
      </p>

      {/* Stats */}
      <div className="flex gap-4 text-sm text-zinc-400">
        {stats.stars !== undefined && <span>⭐ {stats.stars}</span>}
        <span>🎵 {stats.tracks} tracks</span>
        <span>👥 {stats.collaborators} collaborators</span>
        {stats.commits !== undefined && <span>📊 {stats.commits} commits</span>}
      </div>
    </Link>
  );
}
