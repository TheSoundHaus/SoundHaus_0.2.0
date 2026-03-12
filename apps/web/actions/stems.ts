"use server";

import {
  createStemJob,
  getStemJobStatus,
  confirmStemJob,
} from "@/lib/api/stems";

/**
 * Start stem generation for the repo's current snippet.
 */
export async function generateStemsAction(
  owner: string,
  repo: string,
  snippetUrl: string,
): Promise<
  | { success: true; jobId: number; status: string }
  | { success: false; error: string }
> {
  try {
    const res = await createStemJob(owner, repo, snippetUrl);
    if (!res.success) return { success: false, error: res.error };
    return { success: true, jobId: res.data.job_id, status: res.data.status };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to start stem generation" };
  }
}

/**
 * Poll a stem job's status.
 */
export async function pollStemJobAction(
  owner: string,
  repo: string,
  jobId: number,
): Promise<
  | { success: true; status: string; errorMessage: string | null }
  | { success: false; error: string }
> {
  try {
    const res = await getStemJobStatus(owner, repo, jobId);
    if (!res.success) return { success: false, error: res.error };
    return {
      success: true,
      status: res.data.status,
      errorMessage: res.data.error_message,
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to poll stem job" };
  }
}

/**
 * Confirm a stem set as the current one.
 */
export async function confirmStemsAction(
  owner: string,
  repo: string,
  jobId: number,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const res = await confirmStemJob(owner, repo, jobId);
    if (!res.success) return { success: false, error: res.error };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to confirm stems" };
  }
}
