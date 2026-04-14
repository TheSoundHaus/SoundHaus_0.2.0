"use server";

import type { GiteaRepo, ApiResponse, RepoStats, CloneResult, PublicRepo, EnrichedRepo, SearchReposResponse } from "../types/api";
import { authFetch } from "./client";

// GET /repos — returns the authenticated user's Gitea repositories
export async function getMyRepos(): Promise<ApiResponse<GiteaRepo[]>> {
    // authFetch is async, so we must await it
    // We tell TypeScript the response body shape is { repos: GiteaRepo[] }
    const result = await authFetch<{ repos: GiteaRepo[] }>("/repos");

    // If the request failed, reconstruct as GiteaRepo[] error shape
    // (can't `return result` directly — different generic type parameter)
    if (!result.success) return { success: false, error: result.error };

    // Backend wraps the array: { success: true, repos: [...] }
    // We unwrap it so callers get ApiResponse<GiteaRepo[]> not ApiResponse<{ repos: GiteaRepo[] }>
    return { success: true, data: result.data?.repos ?? [] };
}

/**
 * Search public repositories
 * Backend endpoint: GET /repos/search
 */
export async function searchPublicRepos(
  query: string,
  sort: string = "stars",
  limit: number = 20,
  offset: number = 0,
): Promise<ApiResponse<SearchReposResponse>> {
  try {
    const params = new URLSearchParams({
      q: query,
      sort,
      limit: String(limit),
      offset: String(offset),
    });
    const result = await authFetch<SearchReposResponse>(`/repos/search?${params}`);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, data: result.data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function getPublicRepos(genres?: string[], match?: string) : Promise<ApiResponse<PublicRepo[]>> {
    const params = new URLSearchParams();
    if (genres?.length) params.append("genres", genres.join(","));
    if (match) params.append("match", match);
    
    const query = params.toString() ? `?${params.toString()}` : "";
    const result = await authFetch<{ repos: PublicRepo[]}>(`/repos/public${query}`);

    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data?.repos ?? [] };
}

export async function getRepoStats(owner: string, repoName: string) : Promise<ApiResponse<RepoStats>> {
    const result = await authFetch<RepoStats>(`/repos/${owner}/${repoName}/stats`)
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data};
}

export async function cloneRepo(owner: string, repoName: string) : Promise<ApiResponse<CloneResult>>
{
    const result = await authFetch<CloneResult>(
        `/repos/${owner}/${repoName}/clone`,
        {
            method: "POST"
        }
    );
    if (!result.success) return { success: false, error: result.error };
    return {success: true, data:result.data}
}

export async function createRepo(name: string, isPrivate: boolean, description: string): Promise<ApiResponse<GiteaRepo>>{
    
    const result = await authFetch<{repo: GiteaRepo}>(
        "/repos",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name,
                description: description ?? "",
                private: isPrivate ?? false,
            }),
        }
    );

    if (!result.success) return { success: false, error: result.error};

    const repo = result.data?.repo;
    if (!repo) return { success: false, error: "No repo returned from server" };
    return { success: true, data: repo };
}

// GET /repos/enriched — user's repos with SoundHaus metadata (snippet, genres, stars, clones)
export async function getEnrichedRepos(): Promise<ApiResponse<EnrichedRepo[]>> {
    const result = await authFetch<{ repos: EnrichedRepo[] }>("/repos/enriched");
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data?.repos ?? [] };
}

// PUT /repos/{owner}/{repo}/star — star a repo
export async function starRepo(owner: string, repo: string): Promise<ApiResponse<{ message: string }>> {
    const result = await authFetch<{ message: string }>(`/repos/${owner}/${repo}/star`, { method: "PUT" });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data };
}

// DELETE /repos/{owner}/{repo}/star — unstar a repo
export async function unstarRepo(owner: string, repo: string): Promise<ApiResponse<{ message: string }>> {
    const result = await authFetch<{ message: string }>(`/repos/${owner}/${repo}/star`, { method: "DELETE" });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data };
}

// DELETE /repos/{owner}/{repo} — delete a repo
export async function deleteRepo(owner: string, repo: string): Promise<ApiResponse<{ message: string }>> {
    const result = await authFetch<{ message: string }>(`/repos/${owner}/${repo}`, { method: "DELETE" });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data };
}

// PATCH /repos/{owner}/{repo}/settings — rename or update repo settings
export async function renameRepo(
    owner: string,
    repo: string,
    newName: string,
): Promise<ApiResponse<GiteaRepo>> {
    const result = await authFetch<{ repo: GiteaRepo }>(`/repos/${owner}/${repo}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
    });
    if (!result.success) return { success: false, error: result.error };
    if (!result.data?.repo) return { success: false, error: "No repo returned from rename" };
    return { success: true, data: result.data.repo };
}

// PATCH /repos/{owner}/{repo}/settings — update visibility
export async function updateRepoVisibility(
    owner: string,
    repo: string,
    isPrivate: boolean,
): Promise<ApiResponse<GiteaRepo>> {
    const result = await authFetch<{ repo: GiteaRepo }>(`/repos/${owner}/${repo}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ private: isPrivate }),
    });
    if (!result.success) return { success: false, error: result.error };
    if (!result.data?.repo) return { success: false, error: "No repo returned from visibility update" };
    return { success: true, data: result.data.repo };
}

// PATCH /repos/{owner}/{repo}/settings — update description
export async function updateRepoDescription(
    owner: string,
    repo: string,
    description: string,
): Promise<ApiResponse<GiteaRepo>> {
    const result = await authFetch<{ repo: GiteaRepo }>(`/repos/${owner}/${repo}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
    });
    if (!result.success) return { success: false, error: result.error };
    if (!result.data?.repo) return { success: false, error: "No repo returned from update" };
    return { success: true, data: result.data.repo };
}

// PUT /repos/{owner}/{repo}/thumbnail — set YouTube URL thumbnail
export async function setThumbnailUrl(
    owner: string,
    repo: string,
    type: "youtube" | "image",
    url: string,
): Promise<ApiResponse<{ thumbnail_url: string; thumbnail_type: string }>> {
    const result = await authFetch<{ thumbnail_url: string; thumbnail_type: string }>(
        `/repos/${owner}/${repo}/thumbnail`,
        {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type, url }),
        },
    );
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data };
}

// POST /repos/{owner}/{repo}/thumbnail/upload — upload image thumbnail
export async function uploadThumbnail(
    owner: string,
    repo: string,
    file: File,
): Promise<ApiResponse<{ thumbnail_url: string; thumbnail_type: string }>> {
    const formData = new FormData();
    formData.append("file", file);
    const result = await authFetch<{ thumbnail_url: string; thumbnail_type: string }>(
        `/repos/${owner}/${repo}/thumbnail/upload`,
        {
            method: "POST",
            body: formData,
        },
    );
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data };
}

// DELETE /repos/{owner}/{repo}/thumbnail — remove thumbnail
export async function deleteThumbnail(
    owner: string,
    repo: string,
): Promise<ApiResponse<{ message: string }>> {
    const result = await authFetch<{ message: string }>(
        `/repos/${owner}/${repo}/thumbnail`,
        { method: "DELETE" },
    );
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data };
}