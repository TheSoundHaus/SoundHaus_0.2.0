"use server";

import { createRepo, starRepo, unstarRepo, deleteRepo, renameRepo } from "@/lib/api/repos";

// Thin server action wrapper for createRepo
// Returns a simple serializable object (no complex GiteaRepo nesting)
export async function createRepoAction(
  name: string,
  isPrivate: boolean,
  description: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const result = await createRepo(name, isPrivate, description);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true };
}

export async function starRepoAction(
  owner: string,
  repo: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const result = await starRepo(owner, repo);
  if (!result.success) return { success: false, error: result.error };
  return { success: true };
}

export async function unstarRepoAction(
  owner: string,
  repo: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const result = await unstarRepo(owner, repo);
  if (!result.success) return { success: false, error: result.error };
  return { success: true };
}

export async function deleteRepoAction(
  owner: string,
  repo: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const result = await deleteRepo(owner, repo);
  if (!result.success) return { success: false, error: result.error };
  return { success: true };
}

export async function renameRepoAction(
  owner: string,
  repo: string,
  newName: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const result = await renameRepo(owner, repo, newName);
  if (!result.success) return { success: false, error: result.error };
  return { success: true };
}
