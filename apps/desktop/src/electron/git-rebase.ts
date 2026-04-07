import { exec } from 'dugite';
import * as semanticDiffer from 'semantic-differ';
import * as fs from 'fs';
import * as path from 'path';

/** Calls native merge when the rebuilt `.node` includes `mergeAlsFiles` (see native/semantic-diff). */
async function mergeAlsFilesSafe(localPath: string, remotePath: string): Promise<Buffer> {
  const fn = semanticDiffer.mergeAlsFiles;
  if (typeof fn !== 'function') {
    throw new Error(
      'semantic-differ is missing mergeAlsFiles (outdated native addon). Rebuild: cd apps/desktop/native/semantic-diff && npm run build',
    );
  }
  return fn(localPath, remotePath);
}

interface RebaseResult {
  success: boolean;
  error?: string;
  conflictingFiles?: string[];
}

const ALS_BACKUP_NAME = 'soundhaus-als-local.als';

async function parseConflictingFiles(repoPath: string): Promise<string[]> {
  const { stdout } = await exec(['status', '--porcelain'], repoPath);
  const statusOutput = String(stdout || '');
  if (!statusOutput) return [];

  const conflictStatuses = /^(UU|AA|DD|UD|DU|UA|AU) /;
  return statusOutput
    .split('\n')
    .filter((line) => conflictStatuses.test(line))
    .map((line) => line.substring(3).trim())
    .filter(Boolean);
}

/**
 * Abort any in-progress rebase or merge so the repo is never left stuck.
 * Both commands silently no-op when there is nothing to abort.
 * Also removes a stale .git/index.lock that a crashed/killed git process
 * may have left behind — without this, every subsequent index-writing
 * command (rebase, checkout, etc.) fails with "could not write index".
 */
async function ensureCleanGitState(repoPath: string): Promise<void> {
  const lockPath = path.join(repoPath, '.git', 'index.lock');
  try {
    await fs.promises.unlink(lockPath);
    console.log('[Rebase] Removed stale .git/index.lock');
  } catch {
    // Lock file doesn't exist — normal case, nothing to do.
  }

  await exec(['rebase', '--abort'], repoPath);
  await exec(['merge', '--abort'], repoPath);
}

// ─────────────────────────────────────────────
// ALS backup helpers
// ─────────────────────────────────────────────

async function findAlsFile(repoPath: string): Promise<string | null> {
  const entries = await fs.promises.readdir(repoPath, { withFileTypes: true });
  const alsFile = entries.find((e) => e.isFile() && e.name.toLowerCase().endsWith('.als'));
  return alsFile ? path.join(repoPath, alsFile.name) : null;
}

async function isAlsDirty(repoPath: string, alsAbsPath: string): Promise<boolean> {
  const rel = path.relative(repoPath, alsAbsPath).split(path.sep).join('/');
  const { stdout } = await exec(['status', '--porcelain', '--', rel], repoPath);
  return Boolean(String(stdout || '').trim());
}

function backupPath(repoPath: string): string {
  return path.join(repoPath, '.git', ALS_BACKUP_NAME);
}

async function backupAls(alsAbsPath: string, repoPath: string): Promise<string> {
  const dest = backupPath(repoPath);
  await fs.promises.copyFile(alsAbsPath, dest);
  console.log('[Rebase] Backed up local .als to', dest);
  return dest;
}

async function restoreAlsBackup(backup: string, alsAbsPath: string): Promise<void> {
  await fs.promises.copyFile(backup, alsAbsPath);
  await fs.promises.unlink(backup);
  console.log('[Rebase] Restored .als from backup and removed backup file');
}

async function deleteBackupIfExists(repoPath: string): Promise<void> {
  try {
    await fs.promises.unlink(backupPath(repoPath));
  } catch {
    // No backup file — nothing to clean up.
  }
}

/**
 * True if any tracked file still has unstaged/staged edits (ignores untracked).
 */
async function hasDirtyTrackedFiles(repoPath: string): Promise<boolean> {
  const { stdout } = await exec(['status', '--porcelain', '--untracked-files=no'], repoPath);
  return Boolean(String(stdout || '').trim());
}

/**
 * Stash all remaining tracked modifications so `git rebase` can run.
 * Call this only after the .als has been reset to HEAD (user's .als edits live in the backup file).
 */
async function stashRemainingTrackedChanges(repoPath: string): Promise<
  { ok: true; stashed: boolean } | { ok: false; error: string }
> {
  if (!(await hasDirtyTrackedFiles(repoPath))) {
    return { ok: true, stashed: false };
  }

  const r = await exec(['stash', 'push', '-m', 'soundhaus-pre-pull'], repoPath);
  if (r.exitCode !== 0) {
    const detail = (r.stderr || r.stdout || 'git stash push failed').trim();
    return { ok: false, error: detail };
  }

  console.log('[Rebase] Stashed other tracked file changes before rebase');
  return { ok: true, stashed: true };
}

async function popPrePullStash(repoPath: string): Promise<{ ok: boolean; detail?: string }> {
  const pop = await exec(['stash', 'pop'], repoPath);
  if (pop.exitCode !== 0) {
    return {
      ok: false,
      detail: (pop.stderr || pop.stdout || 'stash pop failed').trim(),
    };
  }
  console.log('[Rebase] Restored stashed tracked file changes after pull');
  return { ok: true };
}

/**
 * Turn raw git stderr into a short explanation. The Rust ALS merge only runs
 * after rebase succeeds — callers should say so when rebase fails first.
 */
function explainRebaseFailure(stderr: string): string {
  const s = stderr.toLowerCase();
  const raw = stderr.trim();
  if (
    s.includes('unstaged') ||
    s.includes('uncommitted') ||
    s.includes('unstashed') ||
    s.includes('please commit or stash')
  ) {
    return (
      'Git refused to rebase because something was still modified in your project folder after preparing the pull. ' +
      'The XML merge step (Rust) did not run — it only runs after a successful rebase. ' +
      `If this persists, commit or stash all changes except what you need, then try again. Git said: ${raw}`
    );
  }
  return raw;
}

// ─────────────────────────────────────────────
// Rebase (fetch + rebase + merge)
// ─────────────────────────────────────────────

/**
 * Performs a git fetch followed by a rebase, with XML-level .als merge for
 * dirty working trees. If conflicts occur, aborts the rebase and returns an
 * error. The user's uncommitted .als edits are preserved via file backup +
 * Rust-side merge rather than git stash (which cannot handle binary files
 * across a rebase).
 */
async function rebase(repoPath: string): Promise<RebaseResult> {
  await ensureCleanGitState(repoPath);

  const alsAbsPath = await findAlsFile(repoPath);
  let hasBackup = false;
  let hadOtherStash = false;

  // Back up the dirty .als before rebase so we can merge it afterwards.
  if (alsAbsPath) {
    try {
      const dirty = await isAlsDirty(repoPath, alsAbsPath);
      if (dirty) {
        await backupAls(alsAbsPath, repoPath);
        hasBackup = true;

        // Reset the working-tree .als to HEAD so git rebase can proceed
        // without "dirty working tree" complaints on the tracked binary.
        const rel = path.relative(repoPath, alsAbsPath).split(path.sep).join('/');
        await exec(['checkout', 'HEAD', '--', rel], repoPath);
        console.log('[Rebase] Reset .als to HEAD before rebase');
      }
    } catch (backupError) {
      const msg = backupError instanceof Error ? backupError.message : String(backupError);
      console.error(`[Rebase] Failed to back up local .als: ${msg}`);
      return {
        success: false,
        error: `Unable to download changes: ${msg}`,
      };
    }
  }

  // Stash any *other* tracked edits (e.g. snapshot.json, samples). The .als
  // is already at HEAD; user's .als edits only exist in the backup file.
  const stashResult = await stashRemainingTrackedChanges(repoPath);
  if (stashResult.ok === false) {
    if (hasBackup && alsAbsPath) {
      try {
        await restoreAlsBackup(backupPath(repoPath), alsAbsPath);
      } catch (e) {
        console.error('[Rebase] Failed to restore .als after stash error:', e);
      }
    }
    return {
      success: false,
      error: `Unable to download changes: Could not stash other local file changes before updating. ${stashResult.error}`,
    };
  }
  hadOtherStash = stashResult.stashed;

  try {
    // Fetch
    console.log(`[Rebase] Starting fetch from origin/main in ${repoPath}`);
    const fetchResult = await exec(['fetch', 'origin', 'main'], repoPath);
    if (fetchResult.exitCode !== 0) {
      console.error(`[Rebase] Fetch failed: ${fetchResult.stderr}`);
      throw new Error(`Fetch failed: ${fetchResult.stderr}`);
    }
    console.log(`[Rebase] Fetch completed successfully`);

    // Rebase
    console.log(`[Rebase] Starting rebase onto origin/main`);
    const rebaseResult = await exec(['rebase', 'origin/main'], repoPath);
    if (rebaseResult.exitCode !== 0) {
      const rebaseError = rebaseResult.stderr || rebaseResult.stdout || 'Unknown rebase error';
      console.error(`[Rebase] Rebase failed: ${rebaseError}`);
      throw new Error(explainRebaseFailure(rebaseError));
    }
    console.log(`[Rebase] Rebase completed successfully`);

    // Merge the backed-up .als with the rebased .als using the Rust module.
    if (hasBackup && alsAbsPath) {
      const backup = backupPath(repoPath);
      try {
        console.log('[Rebase] Merging local .als edits with downloaded changes (Rust mergeAlsFiles)');
        const mergedBuffer = await mergeAlsFilesSafe(backup, alsAbsPath);
        await fs.promises.writeFile(alsAbsPath, mergedBuffer);
        await fs.promises.unlink(backup);
        console.log('[Rebase] Merge complete — local edits preserved');
      } catch (mergeError) {
        const mergeMsg = mergeError instanceof Error ? mergeError.message : String(mergeError);
        console.error(`[Rebase] ALS merge failed: ${mergeMsg}`);

        try {
          await restoreAlsBackup(backup, alsAbsPath);
        } catch (restoreErr) {
          const restoreMsg = restoreErr instanceof Error ? restoreErr.message : String(restoreErr);
          console.error(`[Rebase] Failed to restore backup after merge failure: ${restoreMsg}`);
        }

        if (hadOtherStash) {
          const pop = await popPrePullStash(repoPath);
          if (!pop.ok) {
            console.warn('[Rebase] stash pop after merge failure:', pop.detail);
          }
        }

        return {
          success: false,
          error: `Unable to merge your local project with the downloaded version. Your previous project file was restored. The Rust merge step failed: ${mergeMsg}`,
        };
      }
    }

    if (hadOtherStash) {
      const pop = await popPrePullStash(repoPath);
      if (!pop.ok) {
        return {
          success: false,
          error: `Download updated the project, but restoring your other local file changes failed (git stash). Your Ableton file may be updated; check git stash. ${pop.detail || ''}`,
        };
      }
    }

    console.log(`[Rebase] Download operation completed successfully`);
    return { success: true };
  } catch (error) {
    console.log(`[Rebase] Error during pull — cleaning up git state`);
    await ensureCleanGitState(repoPath);
    console.log(`[Rebase] Git state cleaned`);

    if (hadOtherStash) {
      const pop = await popPrePullStash(repoPath);
      if (!pop.ok) {
        console.warn('[Rebase] stash pop after error:', pop.detail);
      }
    }

    if (hasBackup && alsAbsPath) {
      try {
        await restoreAlsBackup(backupPath(repoPath), alsAbsPath);
      } catch (restoreErr) {
        const restoreMsg = restoreErr instanceof Error ? restoreErr.message : String(restoreErr);
        console.warn(`[Rebase] Failed to restore .als backup after error: ${restoreMsg}`);
      }
    }

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
  } finally {
    await deleteBackupIfExists(repoPath);
  }
}

export { rebase };
