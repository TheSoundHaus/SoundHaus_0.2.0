import { getPublicProfile, getUserPublicRepos } from "@/lib/api/profile";
import type { PublicRepo } from "@/lib/types/api";
import UserAvatar from "@/components/UserAvatar";
import Link from "next/link";
import { Calendar, User, Music, Star } from "lucide-react";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Params {
  username: string;
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { username } = await params;
  const result = await getPublicProfile(username);

  if (!result.success) {
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

  const profile = result.data;
  const reposResult = await getUserPublicRepos(username);
  const repos: PublicRepo[] = reposResult.success ? (reposResult.data ?? []) : [];

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
    <main className="mx-auto max-w-3xl px-6 py-12">
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
              {profile.display_name || (!UUID_RE.test(profile.username) ? profile.username : 'SoundHaus User')}
            </h1>
            <p className="mt-1 text-lg text-zinc-400">
              {UUID_RE.test(profile.username) ? '@soundhaususer' : `@${profile.username}`}
            </p>

            {profile.bio && (
              <p className="mt-4 text-sm leading-relaxed text-zinc-300">
                {profile.bio}
              </p>
            )}

            <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
              <Calendar size={14} />
              <span>Joined {formatDate(profile.created_at)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Public Repos */}
      <div className="rounded-lg border border-zinc-800 p-8">
        <h2 className="mb-6 text-xl font-semibold">
          Public Projects
          {repos.length > 0 && (
            <span className="ml-2 text-sm font-normal text-zinc-500">{repos.length}</span>
          )}
        </h2>
        {repos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Music className="w-8 h-8 text-zinc-600" />
            <p className="text-sm text-zinc-500">No public projects yet.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {repos.map((repo) => {
              return (
                <Link
                  key={repo.gitea_id}
                  href={`/explore/${repo.owner}/${repo.repo_name}`}
                  className="group block rounded-xl border border-white/[0.06] bg-white/[0.03] p-5 transition-all duration-200 hover:border-[#A7C7E7]/30 hover:shadow-[0_0_16px_rgba(167,199,231,0.1)] no-underline"
                >
                  {/* Thumbnail */}
                  {repo.thumbnail_url && repo.thumbnail_type === "image" && (
                    <div className="mb-3 h-32 overflow-hidden rounded-lg">
                      <img
                        src={repo.thumbnail_url}
                        alt={repo.repo_name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                  )}
                  <h3 className="text-base font-semibold text-zinc-100 group-hover:text-[#A7C7E7] transition-colors">
                    {repo.repo_name}
                  </h3>
                  {repo.description && (
                    <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{repo.description}</p>
                  )}
                  {repo.genres.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {repo.genres.map((g) => (
                        <span
                          key={g}
                          className="text-[10px] text-[#A7C7E7] bg-zinc-800/60 rounded-full px-2 py-0.5 border border-zinc-700/50"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex gap-4 text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Star size={12} />
                      {repo.stars ?? 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <Music size={12} />
                      {repo.clone_count} clones
                    </span>
                    {repo.updated_at && (
                      <span>Updated {formatDate(repo.updated_at)}</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
