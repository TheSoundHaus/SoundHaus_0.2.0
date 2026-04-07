"use server";

import type { ApiResponse, RepoActivity, RepoEvents } from "../types/api";
import { authFetch } from "./client";

export async function getRepoActivity(
    owner: string, 
    repoName: string, 
    limit?: number
): Promise<ApiResponse<RepoActivity>> {
    const query = limit ? `?limit=${limit}` : "";
    const result = await authFetch<RepoActivity>(
        `/api/webhooks/repo/${owner}/${repoName}/activity${query}`
    );
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data};
}

export async function getRepoEvents(owner: string, repoName: string, limit?: number): Promise<ApiResponse<RepoEvents>>
{
    const query = limit ? `?limit=${limit}` : "";
    const result = await authFetch<RepoEvents>(
        `/api/webhooks/repo/${owner}/${repoName}/events${query}`
    );    
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data};
}


