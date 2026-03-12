"use server";

import { createRepo, starRepo, unstarRepo, deleteRepo, renameRepo } from "@/lib/api/repos";

// Thin server action wrapper for createRepo
// Returns a simple serializable object (no complex GiteaRepo nesting)
export async function createRepoAction(
  name: string,
  isPrivate: boolean,
  description: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const result = await createRepo(name, isPrivate, description);
    if (!result.success) return { success: false, error: result.error };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to create repository" };
  }
}

export async function starRepoAction(
  owner: string,
  repo: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const result = await starRepo(owner, repo);
    if (!result.success) return { success: false, error: result.error };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to star repository" };
  }
}

export async function unstarRepoAction(
  owner: string,
  repo: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const result = await unstarRepo(owner, repo);
    if (!result.success) return { success: false, error: result.error };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to unstar repository" };
  }
}

export async function deleteRepoAction(
  owner: string,
  repo: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const result = await deleteRepo(owner, repo);
    if (!result.success) return { success: false, error: result.error };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete repository" };
  }
}

export async function renameRepoAction(
  owner: string,
  repo: string,
  newName: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const result = await renameRepo(owner, repo, newName);
    if (!result.success) return { success: false, error: result.error };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to rename repository" };
  }
}
