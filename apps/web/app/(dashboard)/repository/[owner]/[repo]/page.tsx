import RepoDetailClient from "./RepoDetailClient";
import { getRepoStats } from "@/lib/api/repos";
import { getRepoActivity, getRepoEvents } from "@/lib/api/webhooks";
import { getSnippetMetadata } from "@/lib/api/snippets";
import { getAllGenres } from "@/lib/api/genre";
import { getCommits } from "@/lib/api/commits";
import { getPublicProfile } from "@/lib/api/profile";
import type { RepoStats, RepoActivity, RepoEvents, Snippet, Genre } from "@/lib/types/api";
import type { CommitListResponse } from "@/lib/api/commits";

interface Params {
  owner: string;
  repo: string;
}

export default async function RepositoryPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { owner, repo } = await params;

  // Fetch all data in parallel (commits included)
  const [statsRes, activityRes, eventsRes, snippetRes, genresRes, commitsRes, ownerProfileRes] = await Promise.all([
    getRepoStats(owner, repo),
    getRepoActivity(owner, repo),
    getRepoEvents(owner, repo),
    getSnippetMetadata(owner, repo),
    getAllGenres(),
    getCommits(owner, repo, 1, 20),
    getPublicProfile(owner),
  ]);

  const stats: RepoStats | null = statsRes.success ? statsRes.data : null;
  const activity: RepoActivity | null = activityRes.success ? activityRes.data : null;
  const events: RepoEvents | null = eventsRes.success ? eventsRes.data : null;
  const snippet: Snippet | null = snippetRes.success ? snippetRes.data.snippet : null;
  const allGenres: Genre[] = genresRes.success ? genresRes.data : [];
  const commitData: CommitListResponse | null = commitsRes.success ? commitsRes.data : null;
  const ownerProfile = ownerProfileRes.success ? ownerProfileRes.data : null;

  return (
    <RepoDetailClient
      owner={owner}
      repo={repo}
      stats={stats}
      activity={activity}
      events={events}
      snippet={snippet}
      allGenres={allGenres}
      initialCommits={commitData}
      ownerYoutube={ownerProfile?.social_youtube ?? null}
      ownerSpotify={ownerProfile?.social_spotify ?? null}
    />
  );
}
