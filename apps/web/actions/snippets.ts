"use server";

import { authenticatedFetch } from "@/lib/utils/auth";
import type { SnippetMetadata } from "@/lib/types/api";

/**
 * Upload an audio snippet for a repository.
 * Accepts FormData with a "file" field (browser File → FormData serialisation).
 */
export async function uploadSnippetAction(
    owner: string,
    repo: string,
    formData: FormData,
): Promise<
    | { success: true; url: string; metadata: SnippetMetadata }
    | { success: false; error: string }
> {
    try {
        const response = await authenticatedFetch(
            `/repos/${owner}/${repo}/snippet`,
            {
                method: "POST",
                body: formData, // multipart/form-data — browser sets boundary automatically
            },
        );

        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}`;
            try {
                const body = await response.json();
                errorMessage = body.detail ?? errorMessage;
            } catch {
                errorMessage = response.statusText || errorMessage;
            }
            return { success: false, error: errorMessage };
        }

        const data = await response.json();
        return {
            success: true,
            url: data.url,
            metadata: data.metadata,
        };
    } catch (e) {
        return {
            success: false,
            error: e instanceof Error ? e.message : "Network error",
        };
    }
}

/**
 * Delete the audio snippet for a repository.
 */
export async function deleteSnippetAction(
    owner: string,
    repo: string,
): Promise<{ success: true } | { success: false; error: string }> {
    try {
        const response = await authenticatedFetch(
            `/repos/${owner}/${repo}/snippet`,
            { method: "DELETE" },
        );

        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}`;
            try {
                const body = await response.json();
                errorMessage = body.detail ?? errorMessage;
            } catch {
                errorMessage = response.statusText || errorMessage;
            }
            return { success: false, error: errorMessage };
        }

        return { success: true };
    } catch (e) {
        return {
            success: false,
            error: e instanceof Error ? e.message : "Network error",
        };
    }
}
