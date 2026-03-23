"use server"

import type { Snippet, SnippetMetadata, ApiResponse } from "../types/api";
import { authFetch } from "./client";
export async function getSnippetMetadata(
    owner:string, 
    repoName: string
): Promise<ApiResponse<{repo_id: string, snippet: Snippet}>> {

    const result = await authFetch<{ repo_id: string, snippet: Snippet }>(
        `/repos/${owner}/${repoName}/snippet/metadata`
    );

    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data };
}

export async function uploadSnippet(
    owner:string, 
    repoName: string, 
    file: File
): Promise<ApiResponse<{url: string; metadata: SnippetMetadata}>> {

    const formData = new FormData();
    formData.append("file", file); 
    
    const result = await authFetch<{url: string; metadata: SnippetMetadata}>(
        `/repos/${owner}/${repoName}/snippet/`,
        {
            method: "POST",
            body: formData,
        }
    );

    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data };
}

export async function deleteSnippet(
    owner: string,
    repoName: string
): Promise<ApiResponse<{ message: string}>> {
    const result = await authFetch<{message: string}>(
        `/repos/${owner}/${repoName}/snippet`,
        { method: "DELETE"}
    );

    if (!result.success) return {success: false, error: result.error};
    return {success: true, data: result.data};
}