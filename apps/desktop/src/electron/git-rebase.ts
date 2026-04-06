import { exec } from 'dugite';

interface RebaseResult {
  success: boolean;
  error?: string;
  conflictingFiles?: string[];
}

async function parseConflictingFiles(repoPath: string): Promise<string[]> {
  const { stdout } = await exec(['status', '--porcelain'], repoPath);
  if (!stdout) return [];

  const conflictStatuses = /^(UU|AA|DD|UD|DU|UA|AU) /;
  return stdout
    .split('\n')
    .filter((line) => conflictStatuses.test(line))
    .map((line) => line.substring(3).trim())
    .filter(Boolean);
}

/**
 * Abort any in-progress rebase or merge so the repo is never left stuck.
 * Both commands silently no-op when there is nothing to abort.
 */
async function ensureCleanGitState(repoPath: string): Promise<void> {
  await exec(['rebase', '--abort'], repoPath);
  await exec(['merge', '--abort'], repoPath);
}

async function rebase(repoPath: string): Promise<RebaseResult> {
  // Clear any pre-existing stuck state from a previous failed pull.
  await ensureCleanGitState(repoPath);

  try {
    console.log(`[Rebase] Starting fetch from origin/main in ${repoPath}`);
    const fetchResult = await exec(['fetch', 'origin', 'main'], repoPath);
    if (fetchResult.exitCode !== 0) {
      console.error(`[Rebase] Fetch failed: ${fetchResult.stderr}`);
      throw new Error(`Fetch failed: ${fetchResult.stderr}`);
    }
    console.log(`[Rebase] Fetch completed successfully`);

    console.log(`[Rebase] Starting rebase onto origin/main`);
    const rebaseResult = await exec(['rebase', '--autostash', 'origin/main'], repoPath);
    if (rebaseResult.exitCode !== 0) {
      console.error(`[Rebase] Rebase failed: ${rebaseResult.stderr}`);
      throw new Error(`Rebase failed: ${rebaseResult.stderr}`);
    }
    console.log(`[Rebase] Rebase completed successfully`);

    console.log(`[Rebase] Download operation completed successfully`);
    return { success: true };
  } catch (error) {
    // Always clean up first — covers mid-rebase conflicts, autostash pop
    // failures, and any other unexpected state.
    console.log(`[Rebase] Error during pull — cleaning up git state`);
    await ensureCleanGitState(repoPath);
    console.log(`[Rebase] Git state cleaned`);

    const conflictingFiles = await parseConflictingFiles(repoPath);

    if (conflictingFiles.length > 0) {
      console.warn(`[Rebase] Conflicts detected in files: ${conflictingFiles.join(', ')}`);
      return {
        success: false,
        error: `Unable to download changes. Your work has conflicts with recent changes from your collaborators.`,
        conflictingFiles,
      };
    }

    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Rebase] Download operation failed: ${errorMsg}`);
    return {
      success: false,
      error: `Unable to download changes: ${errorMsg}`,
    };
  }
}

export { rebase };
