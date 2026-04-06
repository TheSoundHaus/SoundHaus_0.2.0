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
    let remoteBranch: string | undefined;

    // 1st try: upstream tracking ref (set by push -u)
    const upstreamResult = await exec(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], repoPath);
    if (upstreamResult.exitCode === 0 && upstreamResult.stdout.trim()) {
      remoteBranch = upstreamResult.stdout.trim();
    }

    // 2nd try: local HEAD branch name
    if (!remoteBranch) {
      const branchResult = await exec(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath);
      if (branchResult.exitCode === 0 && branchResult.stdout.trim() && branchResult.stdout.trim() !== 'HEAD') {
        remoteBranch = `origin/${branchResult.stdout.trim()}`;
      }
    }

    // 3rd try: ask the remote what its default branch is via ls-remote
    if (!remoteBranch) {
      const lsRemote = await exec(['ls-remote', '--symref', 'origin', 'HEAD'], repoPath);
      if (lsRemote.exitCode === 0 && lsRemote.stdout) {
        // Output looks like: "ref: refs/heads/main\tHEAD\n..."
        const symMatch = lsRemote.stdout.match(/ref:\s+refs\/heads\/(\S+)/);
        if (symMatch) {
          remoteBranch = `origin/${symMatch[1]}`;
        }
      }
    }

    // 4th try: pick the first branch listed on the remote
    if (!remoteBranch) {
      const lsHeads = await exec(['ls-remote', '--heads', 'origin'], repoPath);
      if (lsHeads.exitCode === 0 && lsHeads.stdout.trim()) {
        const firstRef = lsHeads.stdout.trim().split('\n')[0];
        const refMatch = firstRef.match(/refs\/heads\/(\S+)/);
        if (refMatch) {
          remoteBranch = `origin/${refMatch[1]}`;
        }
      }
    }

    // If we still have nothing, the remote is completely empty — nothing to pull
    if (!remoteBranch) {
      console.log('[Rebase] No local HEAD and no remote branches — nothing to pull');
      return { success: true };
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
