import { getPublicProfile, getUserPublicRepos } from "@/lib/api/profile";
import type { PublicRepo } from "@/lib/types/api";
import UserAvatar from "@/components/UserAvatar";
import Link from "next/link";
import { Calendar, User, Music, Star, Globe, Instagram, Youtube, Twitter } from "lucide-react";

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

            {/* Social links */}
            {(profile.social_instagram || profile.social_youtube || profile.social_spotify || profile.social_twitter || profile.social_website) && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {profile.social_instagram && (
                  <a href={profile.social_instagram} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
                    <Instagram size={15} />
                  </a>
                )}
                {profile.social_youtube && (
                  <a href={profile.social_youtube} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-red-400 transition-colors">
                    <Youtube size={15} />
                  </a>
                )}
                {profile.social_spotify && (
                  <a href={profile.social_spotify} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-green-400 transition-colors">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-[15px] w-[15px]">
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                    </svg>
                  </a>
                )}
                {profile.social_twitter && (
                  <a href={profile.social_twitter} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
                    <Twitter size={15} />
                  </a>
                )}
                {profile.social_website && (
                  <a href={profile.social_website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-[#A7C7E7] transition-colors">
                    <Globe size={15} />
                  </a>
                )}
              </div>
            )}
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
