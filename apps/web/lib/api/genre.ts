"use server"

import type { Genre, ApiResponse } from "../types/api";
import { authFetch } from "./client";


export async function getAllGenres(): Promise<ApiResponse<Genre[]>> {
    const result = await authFetch<{genres: Genre[]}>("/genres");
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data?.genres ?? [] };
}

export async function setRepoGenre(owner: string, repoName: string, genre_ids: string[]): Promise<ApiResponse<{success: boolean, message: string}>>
{
    const url = `/repos/${owner}/${repoName}/genres`
    const result = await authFetch<{success: boolean, message: string}>(
        `${url}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ genre_ids })
        }
    )
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: result.data }; 
}