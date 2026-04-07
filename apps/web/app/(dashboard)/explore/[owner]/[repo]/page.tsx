import PublicRepoClient from "./PublicRepoClient";

import { getRepoStats } from "@/lib/api/repos";
import { getRepoActivity, getRepoEvents } from "@/lib/api/webhooks";
import { getSnippetMetadata } from "@/lib/api/snippets";
import { getCommits } from "@/lib/api/commits";
import { getReadme } from "@/lib/api/readme";
import type { RepoStats, RepoActivity, RepoEvents, Snippet } from "@/lib/types/api";
import type { CommitListResponse } from "@/lib/api/commits";

interface Params {
  owner: string;
  repo: string;
}

export default async function PublicRepoPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { owner, repo } = await params;

  const [statsRes, activityRes, eventsRes, snippetRes, commitsRes, readmeRes] = await Promise.all([
    getRepoStats(owner, repo),
    getRepoActivity(owner, repo),
    getRepoEvents(owner, repo),
    getSnippetMetadata(owner, repo),
    getCommits(owner, repo, 1, 20),
    getReadme(owner, repo),
  ]);

  const stats: RepoStats | null = statsRes.success ? statsRes.data : null;
  const activity: RepoActivity | null = activityRes.success ? activityRes.data : null;
  const events: RepoEvents | null = eventsRes.success ? eventsRes.data : null;
  const snippet: Snippet | null = snippetRes.success ? snippetRes.data.snippet : null;
  const commitData: CommitListResponse | null = commitsRes.success ? commitsRes.data : null;
  const readme: string = readmeRes.success ? readmeRes.data : "";

  return (
    <PublicRepoClient
      owner={owner}
      repo={repo}
      stats={stats}
      activity={activity}
      events={events}
      snippet={snippet}
      initialCommits={commitData}
      readme={readme}
    />
  );
}
