"use server";

import { authenticatedFetch } from "../utils/auth";
import type { ApiResponse } from "../types/api";

export async function authFetch<T>(
    endpoint: string, 
    options: RequestInit = {}
): Promise<ApiResponse<T>> {
    try {
        const response = await authenticatedFetch(endpoint, options);
        
        if(!response.ok) {
            let errorMessage = `HTTP ${response.status}`;
            try {
                const body = await response.json();
                errorMessage = body.detail ?? errorMessage;
            } catch {
                errorMessage = response.statusText || errorMessage;
            }
            return { success: false, error: errorMessage };
        }
        const data = (await response.json()) as T;
        return { success: true, data };
    } catch (e) {
        return {
            success: false,
            error: e instanceof Error ? e.message : "Network error",
        };
    }
}