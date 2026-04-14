"use server";

import { createRepo, starRepo, unstarRepo, deleteRepo, renameRepo, updateRepoDescription, updateRepoVisibility, forkRepo } from "@/lib/api/repos";

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
    return { success: false, error: e instanceof Error ? e.message : "Failed to create project" };
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
    return { success: false, error: e instanceof Error ? e.message : "Failed to star project" };
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
    return { success: false, error: e instanceof Error ? e.message : "Failed to unstar project" };
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
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete project" };
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
    return { success: false, error: e instanceof Error ? e.message : "Failed to rename project" };
  }
}

export async function updateVisibilityAction(
  owner: string,
  repo: string,
  isPrivate: boolean,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const result = await updateRepoVisibility(owner, repo, isPrivate);
    if (!result.success) return { success: false, error: result.error };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update visibility" };
  }
}

export async function updateDescriptionAction(
  owner: string,
  repo: string,
  description: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const result = await updateRepoDescription(owner, repo, description);
    if (!result.success) return { success: false, error: result.error };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update description" };
  }
}

export async function forkRepoAction(
  owner: string,
  repo: string,
): Promise<{ success: true; fork_name: string; fork_owner: string } | { success: false; error: string }> {
  try {
    const result = await forkRepo(owner, repo);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, fork_name: result.data!.fork_name, fork_owner: result.data!.fork_owner };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to fork project" };
  }
}
