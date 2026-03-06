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
) {
  const res = await createStemJob(owner, repo, snippetUrl);
  if (!res.success) return { success: false as const, error: res.error };
  return { success: true as const, jobId: res.data.job_id, status: res.data.status };
}

/**
 * Poll a stem job's status.
 */
export async function pollStemJobAction(
  owner: string,
  repo: string,
  jobId: number,
) {
  const res = await getStemJobStatus(owner, repo, jobId);
  if (!res.success) return { success: false as const, error: res.error };
  return {
    success: true as const,
    status: res.data.status,
    errorMessage: res.data.error_message,
  };
}

/**
 * Confirm a stem set as the current one.
 */
export async function confirmStemsAction(
  owner: string,
  repo: string,
  jobId: number,
) {
  const res = await confirmStemJob(owner, repo, jobId);
  if (!res.success) return { success: false as const, error: res.error };
  return { success: true as const };
}
