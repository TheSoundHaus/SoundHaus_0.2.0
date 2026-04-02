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

async function abortRebase(repoPath: string): Promise<void> {
  await exec(['rebase', '--abort'], repoPath);
}

async function rebase(repoPath: string): Promise<RebaseResult> {
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
    console.log(`[Rebase] Checking for conflicts after error`);
    const conflictingFiles = await parseConflictingFiles(repoPath);

    if (conflictingFiles.length > 0) {
      console.warn(`[Rebase] Conflicts detected in files: ${conflictingFiles.join(', ')}`);
      console.log(`[Rebase] Aborting rebase operation`);
      await abortRebase(repoPath);
      console.log(`[Rebase] Rebase aborted`);

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
