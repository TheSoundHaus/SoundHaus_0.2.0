import RepoDetailClient from "./RepoDetailClient";
import { getRepoStats } from "@/lib/api/repos";
import { getRepoActivity, getRepoEvents } from "@/lib/api/webhooks";
import { getSnippetMetadata } from "@/lib/api/snippets";
import { getAllGenres } from "@/lib/api/genre";
import type { RepoStats, RepoActivity, RepoEvents, Snippet, Genre } from "@/lib/types/api";

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

  // Fetch all data in parallel
  const [statsRes, activityRes, eventsRes, snippetRes, genresRes] = await Promise.all([
    getRepoStats(owner, repo),
    getRepoActivity(owner, repo),
    getRepoEvents(owner, repo),
    getSnippetMetadata(owner, repo),
    getAllGenres(),
  ]);

  const stats: RepoStats | null = statsRes.success ? statsRes.data : null;
  const activity: RepoActivity | null = activityRes.success ? activityRes.data : null;
  const events: RepoEvents | null = eventsRes.success ? eventsRes.data : null;
  const snippet: Snippet | null = snippetRes.success ? snippetRes.data.snippet : null;
  const allGenres: Genre[] = genresRes.success ? genresRes.data : [];

  return (
    <RepoDetailClient
      owner={owner}
      repo={repo}
      stats={stats}
      activity={activity}
      events={events}
      snippet={snippet}
      allGenres={allGenres}
    />
  );
}
