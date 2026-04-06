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

async function ensureCleanGitState(repoPath: string): Promise<void> {
  // Silently abort any in-progress rebase or merge — both are no-ops when nothing is in-flight
  await exec(['rebase', '--abort'], repoPath);
  await exec(['merge', '--abort'], repoPath);
}

async function rebase(repoPath: string): Promise<RebaseResult> {
  // Clear any pre-existing stuck state before starting
  await ensureCleanGitState(repoPath);

  try {
    // Detect the tracking branch (e.g. origin/main or origin/master)
    const upstreamResult = await exec(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], repoPath);
    let remoteBranch = 'origin/main';
    if (upstreamResult.exitCode === 0 && upstreamResult.stdout.trim()) {
      remoteBranch = upstreamResult.stdout.trim();
    } else {
      // Fallback: detect the local branch name
      const branchResult = await exec(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath);
      const localBranch = branchResult.exitCode === 0 ? branchResult.stdout.trim() : 'main';
      remoteBranch = `origin/${localBranch}`;
    }

    // Extract just the branch name for fetch (e.g. 'main' from 'origin/main')
    const branchName = remoteBranch.replace(/^origin\//, '');

    console.log(`[Rebase] Starting fetch from ${remoteBranch} in ${repoPath}`);
    const fetchResult = await exec(['fetch', 'origin', branchName], repoPath);
    if (fetchResult.exitCode !== 0) {
      console.error(`[Rebase] Fetch failed: ${fetchResult.stderr}`);
      throw new Error(`Fetch failed: ${fetchResult.stderr}`);
    }
    console.log(`[Rebase] Fetch completed successfully`);

    console.log(`[Rebase] Starting rebase onto ${remoteBranch}`);
    const rebaseResult = await exec(['rebase', '--autostash', remoteBranch], repoPath);
    if (rebaseResult.exitCode !== 0) {
      console.error(`[Rebase] Rebase failed: ${rebaseResult.stderr}`);
      throw new Error(`Rebase failed: ${rebaseResult.stderr}`);
    }
    console.log(`[Rebase] Rebase completed successfully`);

    console.log(`[Rebase] Download operation completed successfully`);
    return { success: true };
  } catch (error) {
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
