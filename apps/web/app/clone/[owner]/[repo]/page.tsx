import ClonePageClient from "./ClonePageClient";

import { getRepoStats } from "@/lib/api/repos";
import type { RepoStats } from "@/lib/types/api";

interface Params {
    owner: string;
    repo: string;
}

export default async function ClonePage({
    params,
}: {
    params: Promise<Params>;
}) {
    const { owner, repo } = await params;

    const statsRes = await getRepoStats(owner, repo);
    const stats: RepoStats | null = statsRes.success ? statsRes.data : null;

    return (
        <ClonePageClient
            owner={owner}
            repo={repo}
            stats={stats}
        />
    );
}
