import { getPublicProfile, getUserPublicRepos } from "@/lib/api/profile";
import UserAvatar from "@/components/UserAvatar";
import RepositoryCard from "@/components/RepositoryCard";
import { Calendar, User, Music } from "lucide-react";

interface Params {
  username: string;
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { username } = await params;
  const [profileResult, reposResult] = await Promise.all([
    getPublicProfile(username),
    getUserPublicRepos(username),
  ]);

  if (!profileResult.success) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-20 text-center">
        <div className="rounded-lg border border-zinc-800 p-12">
          <User size={48} className="mx-auto mb-4 text-zinc-600" />
          <h1 className="mb-2 text-2xl font-bold">Profile Not Found</h1>
          <p className="text-zinc-500">
            This user doesn&apos;t exist or their profile is private.
          </p>
        </div>
      </main>
    );
  }

  const profile = profileResult.data;
  const repos = reposResult.success ? (reposResult.data ?? []) : [];

  // Format account creation date
  function formatDate(iso: string | null): string {
    if (!iso) return "Unknown";
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return "Unknown";
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      {/* Profile Header */}
      <div className="mb-8 rounded-lg border border-zinc-800 p-8">
        <div className="flex items-start gap-6">
          <UserAvatar
            src={profile.avatar_url}
            alt={profile.display_name || profile.username}
            size={96}
          />
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight">
              {profile.display_name || profile.username}
            </h1>
            <p className="mt-1 text-lg text-zinc-400">@{profile.username}</p>

            {profile.bio && (
              <p className="mt-4 text-sm leading-relaxed text-zinc-300">
                {profile.bio}
              </p>
            )}

            <div className="mt-4 flex items-center gap-4 text-sm text-zinc-500">
              <div className="flex items-center gap-2">
                <Calendar size={14} />
                <span>Joined {formatDate(profile.created_at)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Music size={14} />
                <span>{repos.length} public project{repos.length !== 1 ? "s" : ""}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Public Repos */}
      <div className="rounded-lg border border-zinc-800 p-8">
        <h2 className="mb-6 text-xl font-semibold">Public Projects</h2>
        {repos.length === 0 ? (
          <p className="text-sm text-zinc-500">
            This user hasn&apos;t published any public projects yet.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {repos.map((repo) => (
              <RepositoryCard
                key={repo.gitea_id}
                id={repo.gitea_id}
                title={repo.repo_name}
                author={repo.owner}
                updatedAt={repo.updated_at ?? ""}
                stats={{ stars: repo.stars ?? 0 }}
                isPublic
                audioSnippet={repo.audio_snippet}
                thumbnailUrl={repo.thumbnail_url}
                thumbnailType={repo.thumbnail_type}
                cloneCount={repo.clone_count}
                cloneUrl={repo.clone_url}
                genres={repo.genres}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
