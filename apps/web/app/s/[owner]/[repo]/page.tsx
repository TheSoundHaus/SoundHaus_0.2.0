import SharePageClient from "./SharePageClient";

import { getRepoStats } from "@/lib/api/repos";
import { getSnippetMetadata } from "@/lib/api/snippets";
import type { RepoStats, Snippet } from "@/lib/types/api";

interface Params {
    owner: string;
    repo: string;
}

export default async function SharePage({
    params,
}: {
    params: Promise<Params>;
}) {
    const { owner, repo } = await params;

    const [statsRes, snippetRes] = await Promise.all([
        getRepoStats(owner, repo),
        getSnippetMetadata(owner, repo),
    ]);

    const stats: RepoStats | null = statsRes.success ? statsRes.data : null;
    const snippet: Snippet | null = snippetRes.success ? snippetRes.data.snippet : null;

    return (
        <SharePageClient
            owner={owner}
            repo={repo}
            stats={stats}
            snippet={snippet}
        />
    );
}
