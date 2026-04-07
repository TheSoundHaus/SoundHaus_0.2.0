import { getPublicProfile, getUserPublicRepos, getPublicUserStats } from "@/lib/api/profile";
import type { PublicRepo } from "@/lib/types/api";
import UserAvatar from "@/components/UserAvatar";
import Link from "next/link";
import { Calendar, User, Music, Star, Globe, Instagram, Youtube, Twitter, GitFork, BarChart3, Disc3 } from "lucide-react";
import ProfileSnippetPlayer from "./ProfileSnippetPlayer";

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
  const [reposResult, statsResult] = await Promise.all([
    getUserPublicRepos(username),
    getPublicUserStats(username),
  ]);
  const repos: PublicRepo[] = reposResult.success ? (reposResult.data ?? []) : [];
  const stats = statsResult.success ? statsResult.data : null;

  // Aggregate genre chips from all repos
  const genreMap = new Map<string, number>();
  for (const repo of repos) {
    for (const g of repo.genres) {
      genreMap.set(g, (genreMap.get(g) || 0) + 1);
    }
  }
  const topGenres = [...genreMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name]) => name);

  // Repos with audio snippets for "Featured Audio" section
  const snippetRepos = repos.filter((r) => r.audio_snippet);

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
      <div className="mb-8 glass-card rounded-xl p-8">
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

            {/* Social links — always shown; greyed when not set */}
            <div className="mt-4 flex flex-wrap items-center gap-4">
              {profile.social_instagram ? (
                <a href={profile.social_instagram} target="_blank" rel="noopener noreferrer" title="Instagram" className="text-zinc-400 hover:text-[#E1306C] transition-colors">
                  <Instagram size={16} />
                </a>
              ) : (
                <span title="Instagram (not set)" className="text-zinc-700 cursor-default"><Instagram size={16} /></span>
              )}
              {profile.social_youtube ? (
                <a href={profile.social_youtube} target="_blank" rel="noopener noreferrer" title="YouTube" className="text-zinc-400 hover:text-[#FF0000] transition-colors">
                  <Youtube size={16} />
                </a>
              ) : (
                <span title="YouTube (not set)" className="text-zinc-700 cursor-default"><Youtube size={16} /></span>
              )}
              {profile.social_spotify ? (
                <a href={profile.social_spotify} target="_blank" rel="noopener noreferrer" title="Spotify" className="text-zinc-400 hover:text-[#1DB954] transition-colors">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                  </svg>
                </a>
              ) : (
                <span title="Spotify (not set)" className="text-zinc-700 cursor-default">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                  </svg>
                </span>
              )}
              {profile.social_twitter ? (
                <a href={profile.social_twitter} target="_blank" rel="noopener noreferrer" title="X / Twitter" className="text-zinc-400 hover:text-zinc-100 transition-colors">
                  <Twitter size={16} />
                </a>
              ) : (
                <span title="X / Twitter (not set)" className="text-zinc-700 cursor-default"><Twitter size={16} /></span>
              )}
              {profile.social_website ? (
                <a href={profile.social_website} target="_blank" rel="noopener noreferrer" title="Website" className="text-zinc-400 hover:text-[#A7C7E7] transition-colors">
                  <Globe size={16} />
                </a>
              ) : (
                <span title="Website (not set)" className="text-zinc-700 cursor-default"><Globe size={16} /></span>
              )}
            </div>
          </div>
        </div>

        {/* Stats pills */}
        {stats && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="flex flex-col items-center rounded-lg border border-white/[0.06] bg-white/[0.03] py-3">
              <span className="text-xl font-bold text-zinc-100">{stats.total_repos}</span>
              <span className="mt-0.5 text-xs text-zinc-500 flex items-center gap-1"><Music size={11} /> Projects</span>
            </div>
            <div className="flex flex-col items-center rounded-lg border border-white/[0.06] bg-white/[0.03] py-3">
              <span className="text-xl font-bold text-zinc-100">{stats.total_commits}</span>
              <span className="mt-0.5 text-xs text-zinc-500 flex items-center gap-1"><BarChart3 size={11} /> Commits</span>
            </div>
            <div className="flex flex-col items-center rounded-lg border border-white/[0.06] bg-white/[0.03] py-3">
              <span className="text-xl font-bold text-zinc-100">{stats.total_clones_received}</span>
              <span className="mt-0.5 text-xs text-zinc-500 flex items-center gap-1"><GitFork size={11} /> Clones</span>
            </div>
            <div className="flex flex-col items-center rounded-lg border border-white/[0.06] bg-white/[0.03] py-3">
              <span className="text-xl font-bold text-zinc-100">{stats.collaborations}</span>
              <span className="mt-0.5 text-xs text-zinc-500 flex items-center gap-1"><Disc3 size={11} /> Collabs</span>
            </div>
          </div>
        )}
      </div>

      {/* Genre chips */}
      {topGenres.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {topGenres.map((g) => (
            <span
              key={g}
              className="text-xs text-[#A7C7E7] bg-zinc-800/60 rounded-full px-3 py-1 border border-zinc-700/50"
            >
              {g}
            </span>
          ))}
        </div>
      )}

      {/* Featured Audio */}
      {snippetRepos.length > 0 && (
        <div className="mb-8 glass-card rounded-xl p-6">
          <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
            <Music size={18} className="text-[#A7C7E7]" />
            Featured Audio
          </h2>
          <div className="space-y-3">
            {snippetRepos.slice(0, 5).map((repo) => (
              <div
                key={repo.gitea_id}
                className="flex items-center gap-4 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/explore/${repo.owner}/${repo.repo_name}`}
                    className="text-sm font-medium text-zinc-200 hover:text-[#A7C7E7] transition-colors"
                  >
                    {repo.repo_name}
                  </Link>
                  {repo.genres.length > 0 && (
                    <div className="mt-1 flex gap-1">
                      {repo.genres.slice(0, 3).map((g) => (
                        <span key={g} className="text-[10px] text-zinc-500">{g}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="w-48 sm:w-64 shrink-0">
                  <ProfileSnippetPlayer src={repo.audio_snippet!} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Public Repos */}
      <div className="glass-card rounded-xl p-8">
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
