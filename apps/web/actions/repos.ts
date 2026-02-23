"use server";

import { createRepo } from "@/lib/api/repos";

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
