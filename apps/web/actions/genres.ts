"use server";

import { setRepoGenre } from "@/lib/api/genre";

/**
 * Server action wrapper for updating a repo's genre assignments.
 * Replaces all existing genre assignments with the given genre_ids.
 */
export async function setRepoGenresAction(
  owner: string,
  repo: string,
  genreIds: string[],
): Promise<{ success: true } | { success: false; error: string }> {
  const result = await setRepoGenre(owner, repo, genreIds);
  if (!result.success) return { success: false, error: result.error };
  return { success: true };
}
