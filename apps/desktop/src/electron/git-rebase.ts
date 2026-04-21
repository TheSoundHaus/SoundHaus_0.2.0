import { exec } from 'dugite';
import * as semanticDiffer from 'semantic-differ';
import * as fs from 'fs';
import * as path from 'path';
import { ensureGiteaGitCredentialsApproved } from './giteaGitAuth';

const noGitPromptEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
import { gitShowBinary } from './git-bin';

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

export interface AlsMergeConflictPayload {
  conflictJson: string;
  pendingPath: string;
}

export interface RebaseResult {
  success: boolean;
  error?: string;
  conflictingFiles?: string[];
  /** Present when clip-level three-way merge needs user resolution */
  alsMergeConflict?: AlsMergeConflictPayload;
}

const BASE_ALS_TEMP = path.join('.git', 'soundhaus-merge-base.als');

const ALS_BACKUP_NAME = 'soundhaus-als-local.als';

/** Index-stage temps during `git rebase` conflicts (cleaned up after continue or pending write). */
const REBASE_STAGE_BASE = path.join('.git', 'soundhaus-rebase-base.als');
const REBASE_STAGE_LOCAL = path.join('.git', 'soundhaus-rebase-local.als');
const REBASE_STAGE_REMOTE = path.join('.git', 'soundhaus-rebase-remote.als');

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

async function getUnmergedPaths(repoPath: string): Promise<string[]> {
  const r = await exec(['diff', '--name-only', '--diff-filter=U'], repoPath);
  if (r.exitCode !== 0) return [];
  return String(r.stdout || '')
    .split('\n')
    .map((l) => l.trim().replace(/\\/g, '/'))
    .filter(Boolean);
}

/** Tracked SoundHaus snapshot next to ALS — often conflicts alongside `.als` during rebase. */
function isSoundhausSnapshotConflictPath(rel: string): boolean {
  const n = rel.replace(/\\/g, '/');
  return n.startsWith('.soundhaus/') && n.endsWith('/snapshot.json');
}

/** Hook runs when the root `.als` conflicts and every other unmerged path is only a snapshot file. */
function rebaseAlsHookUnmergedOk(unmerged: string[], alsRelNorm: string): boolean {
  if (!unmerged.includes(alsRelNorm)) return false;
  for (const p of unmerged) {
    if (p === alsRelNorm) continue;
    if (!isSoundhausSnapshotConflictPath(p)) return false;
  }
  return true;
}

/**
 * During rebase, `--ours` is the upstream (onto). Snapshot JSON is regenerated from HEAD after pull;
 * taking upstream avoids blocking `rebase --continue` on snapshot merge noise.
 */
/**
 * `rebase --continue` may run `git commit`, which opens `core.editor`. In Electron
 * that often points at Notepad; Git's MSYS wrapper then fails on Windows paths.
 * Use embedded Git's `true` on PATH plus `-c core.editor=true`.
 */
const NON_INTERACTIVE_GIT_EDITOR_ENV: Record<string, string> = {
  GIT_EDITOR: 'true',
  EDITOR: 'true',
  VISUAL: 'true',
};

async function execRebaseContinue(repoPath: string) {
  return exec(
    ['-c', 'core.editor=true', 'rebase', '--continue'],
    repoPath,
    { env: NON_INTERACTIVE_GIT_EDITOR_ENV },
  );
}

async function resolveSoundhausSnapshotRebaseConflicts(
  repoPath: string,
  alsRelNorm: string,
): Promise<void> {
  const unmerged = await getUnmergedPaths(repoPath);
  for (const p of unmerged) {
    if (p === alsRelNorm) continue;
    if (!isSoundhausSnapshotConflictPath(p)) continue;
    const co = await exec(['checkout', '--ours', '--', p], repoPath);
    if (co.exitCode !== 0) {
      throw new Error(co.stderr || co.stdout || `checkout --ours failed for ${p}`);
    }
    const ad = await exec(['add', p], repoPath);
    if (ad.exitCode !== 0) {
      throw new Error(ad.stderr || ad.stdout || `git add failed for ${p}`);
    }
  }
}

async function isRebaseInProgress(repoPath: string): Promise<boolean> {
  try {
    await fs.promises.access(path.join(repoPath, '.git', 'rebase-merge'));
    return true;
  } catch {
    try {
      await fs.promises.access(path.join(repoPath, '.git', 'rebase-apply'));
      return true;
    } catch {
      return false;
    }
  }
}

async function readAlsRebaseResumePending(repoPath: string): Promise<boolean> {
  const pendingPath = path.join(repoPath, '.soundhaus', 'als-merge-pending.json');
  try {
    const raw = await fs.promises.readFile(pendingPath, 'utf8');
    const j = JSON.parse(raw) as { rebaseResume?: boolean };
    return j.rebaseResume === true;
  } catch {
    return false;
  }
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

  const skipRebaseAbort =
    (await isRebaseInProgress(repoPath)) && (await readAlsRebaseResumePending(repoPath));
  if (skipRebaseAbort) {
    console.log('[Rebase] Skipping rebase --abort (ALS merge paused during rebase)');
  } else {
    await exec(['rebase', '--abort'], repoPath);
  }
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
 * Tracked paths that differ from `HEAD` in the index or working tree (POSIX-style paths).
 */
async function trackedPathsDifferingFromHead(repoPath: string): Promise<string[]> {
  const w = await exec(['diff', '--name-only', 'HEAD'], repoPath);
  const c = await exec(['diff', '--cached', '--name-only', 'HEAD'], repoPath);
  const out = new Set<string>();
  const add = (stdout: string) => {
    for (const line of stdout.split('\n')) {
      const p = line.trim();
      if (p) {
        out.add(p.replace(/\\/g, '/'));
      }
    }
  };
  add(String(w.stdout || ''));
  add(String(c.stdout || ''));
  return [...out];
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

type MergeAlsThreeWayFn = (
  base: string,
  local: string,
  remote: string,
  resolutionsJson?: string | null,
) => Promise<{ ok: boolean; merged?: Buffer; conflictJson?: string }>;

type AlsRebaseHookResult =
  | { kind: 'not_applicable' }
  | { kind: 'merged' }
  | { kind: 'needs_ui'; payload: AlsMergeConflictPayload }
  | { kind: 'rust_error'; message: string };

async function unlinkRebaseStageTemps(repoPath: string): Promise<void> {
  for (const rel of [REBASE_STAGE_BASE, REBASE_STAGE_LOCAL, REBASE_STAGE_REMOTE]) {
    await fs.promises.unlink(path.join(repoPath, rel)).catch(() => {});
  }
}

/**
 * When `git rebase` stops on a conflict in the root `.als` only, run the same
 * Rust three-way merge used post-rebase. Stage mapping for rebase: :1: = base,
 * :2: = upstream (onto), :3: = replayed commit — Rust `remote` uses upstream
 * layout; `local` is the commit being replayed.
 */
async function tryRustMergeAlsRebaseConflict(
  repoPath: string,
  alsRelNorm: string,
  alsAbsPath: string,
  mergeThree: MergeAlsThreeWayFn,
  pendingExtras: {
    sessionName: string;
    dirtyBackupMerge?: { baseCommit: string; alsRelPath: string };
  },
): Promise<AlsRebaseHookResult> {
  const rebaseActive = await isRebaseInProgress(repoPath);
  if (!rebaseActive) {
    return { kind: 'not_applicable' };
  }
  const unmerged = await getUnmergedPaths(repoPath);
  const hookableUnmerged = rebaseAlsHookUnmergedOk(unmerged, alsRelNorm);
  if (!hookableUnmerged) {
    return { kind: 'not_applicable' };
  }

  let baseBuf: Buffer;
  let upstreamBuf: Buffer;
  let replayedBuf: Buffer;
  try {
    baseBuf = await gitShowBinary(repoPath, `:1:${alsRelNorm}`);
    upstreamBuf = await gitShowBinary(repoPath, `:2:${alsRelNorm}`);
    replayedBuf = await gitShowBinary(repoPath, `:3:${alsRelNorm}`);
  } catch (showErr) {
    return { kind: 'not_applicable' };
  }

  const baseAbs = path.join(repoPath, REBASE_STAGE_BASE);
  const localAbs = path.join(repoPath, REBASE_STAGE_LOCAL);
  const remoteAbs = path.join(repoPath, REBASE_STAGE_REMOTE);
  await fs.promises.writeFile(baseAbs, baseBuf);
  await fs.promises.writeFile(localAbs, replayedBuf);
  await fs.promises.writeFile(remoteAbs, upstreamBuf);

  let tw: { ok: boolean; merged?: Buffer; conflictJson?: string };
  try {
    tw = await mergeThree(baseAbs, localAbs, remoteAbs, undefined);
  } catch (mergeThrow) {
    throw mergeThrow;
  }
  if (!tw.ok && tw.conflictJson) {
    const pendingDir = path.join(repoPath, '.soundhaus');
    await fs.promises.mkdir(pendingDir, { recursive: true });
    const pendingPath = path.join(pendingDir, 'als-merge-pending.json');
    await fs.promises.writeFile(
      pendingPath,
      JSON.stringify(
        {
          openedAt: new Date().toISOString(),
          repoPath,
          sessionName: pendingExtras.sessionName,
          basePath: baseAbs,
          localPath: localAbs,
          remotePath: remoteAbs,
          outputPath: alsAbsPath,
          rebaseResume: true,
          conflictJson: tw.conflictJson,
          ...(pendingExtras.dirtyBackupMerge
            ? { dirtyBackupMerge: pendingExtras.dirtyBackupMerge }
            : {}),
        },
        null,
        2,
      ),
      'utf8',
    );
    return {
      kind: 'needs_ui',
      payload: { conflictJson: tw.conflictJson, pendingPath },
    };
  }

  if (!tw.ok || !tw.merged) {
    await unlinkRebaseStageTemps(repoPath);
    return {
      kind: 'rust_error',
      message: tw.conflictJson || 'Three-way merge returned no data',
    };
  }

  await fs.promises.writeFile(alsAbsPath, tw.merged);
  await unlinkRebaseStageTemps(repoPath);
  await resolveSoundhausSnapshotRebaseConflicts(repoPath, alsRelNorm);
  const addR = await exec(['add', alsRelNorm], repoPath);
  if (addR.exitCode !== 0) {
    return {
      kind: 'rust_error',
      message: addR.stderr || addR.stdout || 'git add failed after ALS rebase merge',
    };
  }
  return { kind: 'merged' };
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
  await ensureGiteaGitCredentialsApproved(repoPath);

  if ((await isRebaseInProgress(repoPath)) && (await readAlsRebaseResumePending(repoPath))) {
    return {
      success: false,
      error: 'Finish resolving the ALS merge before pulling again.',
    };
  }

  const alsAbsPath = await findAlsFile(repoPath);
  let hasBackup = false;
  let skipBackupCleanup = false;
  const alsRelNorm = alsAbsPath
    ? path.relative(repoPath, alsAbsPath).split(path.sep).join('/')
    : null;

  const differing = await trackedPathsDifferingFromHead(repoPath);
  const nonAlsDirty = alsRelNorm
    ? differing.filter((p) => p !== alsRelNorm)
    : [...differing];

  if (nonAlsDirty.length > 0) {
    const preview = nonAlsDirty.slice(0, 3).join(', ');
    const more = nonAlsDirty.length > 3 ? '…' : '';
    return {
      success: false,
      error:
        `Unable to download changes: You have uncommitted edits to other tracked files (${preview}${more}). ` +
        'Commit or revert those files, then try again. (SoundHaus no longer stashes snapshot or sample changes during pull.)',
    };
  }

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

  try {
    // Detect the tracking branch dynamically instead of hardcoding origin/main
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
      const lsRemote = await exec(['ls-remote', '--symref', 'origin', 'HEAD'], repoPath, {
        env: noGitPromptEnv,
      });
      if (lsRemote.exitCode === 0 && lsRemote.stdout) {
        const symMatch = lsRemote.stdout.match(/ref:\s+refs\/heads\/(\S+)/);
        if (symMatch) {
          remoteBranch = `origin/${symMatch[1]}`;
        }
      }
    }

    // 4th try: pick the first branch listed on the remote
    if (!remoteBranch) {
      const lsHeads = await exec(['ls-remote', '--heads', 'origin'], repoPath, {
        env: noGitPromptEnv,
      });
      if (lsHeads.exitCode === 0 && lsHeads.stdout.trim()) {
        const firstRef = lsHeads.stdout.trim().split('\n')[0];
        const refMatch = firstRef.match(/refs\/heads\/(\S+)/);
        if (refMatch) {
          remoteBranch = `origin/${refMatch[1]}`;
        }
      }
    }

    // If we still have nothing, the remote is completely empty
    if (!remoteBranch) {
      console.log('[Rebase] No local HEAD and no remote branches — nothing to pull');
      return { success: true };
    }

    const branchName = remoteBranch.replace(/^origin\//, '');

    // BASE = committed .als at HEAD before fetch/rebase (after any .als checkout).
    let baseCommit: string | null = null;
    if (alsRelNorm) {
      const bc = await exec(['rev-parse', 'HEAD'], repoPath);
      if (bc.exitCode === 0 && bc.stdout.trim()) {
        baseCommit = bc.stdout.trim();
        console.log('[Rebase] BASE commit for three-way ALS merge:', baseCommit.slice(0, 7));
      }
    }

    // Fetch
    console.log(`[Rebase] Starting fetch from ${remoteBranch} in ${repoPath}`);
    const fetchResult = await exec(['fetch', 'origin', branchName], repoPath, {
      env: noGitPromptEnv,
    });
    if (fetchResult.exitCode !== 0) {
      console.error(`[Rebase] Fetch failed: ${fetchResult.stderr}`);
      throw new Error(`Fetch failed: ${fetchResult.stderr}`);
    }
    console.log(`[Rebase] Fetch completed successfully`);

    // Rebase (with ALS semantic hook when Git stops on root `.als` only)
    console.log(`[Rebase] Starting rebase onto ${remoteBranch}`);
    let rebaseResult = await exec(['rebase', remoteBranch], repoPath);

    const mergeThreeFn = semanticDiffer.mergeAlsFilesThreeWay as MergeAlsThreeWayFn | undefined;

    while (rebaseResult.exitCode !== 0) {
      if (!alsRelNorm || !alsAbsPath || typeof mergeThreeFn !== 'function') {
        const rebaseError = rebaseResult.stderr || rebaseResult.stdout || 'Unknown rebase error';
        console.error(`[Rebase] Rebase failed: ${rebaseError}`);
        throw new Error(explainRebaseFailure(rebaseError));
      }

      const hook = await tryRustMergeAlsRebaseConflict(
        repoPath,
        alsRelNorm,
        alsAbsPath,
        mergeThreeFn,
        {
          sessionName: path.basename(alsAbsPath, '.als'),
          dirtyBackupMerge:
            hasBackup && baseCommit ? { baseCommit, alsRelPath: alsRelNorm } : undefined,
        },
      );

      if (hook.kind === 'not_applicable') {
        const rebaseError = rebaseResult.stderr || rebaseResult.stdout || 'Unknown rebase error';
        console.error(`[Rebase] Rebase failed: ${rebaseError}`);
        throw new Error(explainRebaseFailure(rebaseError));
      }
      if (hook.kind === 'rust_error') {
        throw new Error(hook.message);
      }
      if (hook.kind === 'needs_ui') {
        skipBackupCleanup = true;
        return {
          success: false,
          alsMergeConflict: hook.payload,
        };
      }

      console.log('[Rebase] ALS semantic merge resolved rebase conflict; continuing rebase');
      rebaseResult = await execRebaseContinue(repoPath);
    }

    console.log(`[Rebase] Rebase completed successfully`);

    // Merge the backed-up .als with the rebased .als (three-way when BASE blob is available).
    if (hasBackup && alsAbsPath && alsRelNorm && baseCommit) {
      const backup = backupPath(repoPath);
      const baseTmpAbs = path.join(repoPath, BASE_ALS_TEMP);
      try {
        const mergeThree = semanticDiffer.mergeAlsFilesThreeWay as
          | ((
              base: string,
              local: string,
              remote: string,
              resolutionsJson?: string | null,
            ) => Promise<{ ok: boolean; merged?: Buffer; conflictJson?: string }>)
          | undefined;

        let mergedBuffer: Buffer;

        if (typeof mergeThree === 'function') {
          let baseWritten = false;
          try {
            const baseBuf = await gitShowBinary(repoPath, `${baseCommit}:${alsRelNorm}`);
            await fs.promises.writeFile(baseTmpAbs, baseBuf);
            baseWritten = true;
          } catch (be) {
            console.warn('[Rebase] Could not load BASE .als blob; falling back to two-way merge:', be);
          }

          if (baseWritten) {
            console.log('[Rebase] Three-way ALS merge (BASE + LOCAL backup + REMOTE)');
            const tw = await mergeThree(baseTmpAbs, backup, alsAbsPath, undefined);
            if (!tw.ok && tw.conflictJson) {
              skipBackupCleanup = true;
              const sessionName = path.basename(alsAbsPath, '.als');
              const pendingDir = path.join(repoPath, '.soundhaus');
              await fs.promises.mkdir(pendingDir, { recursive: true });
              const pendingPath = path.join(pendingDir, 'als-merge-pending.json');
              await fs.promises.writeFile(
                pendingPath,
                JSON.stringify(
                  {
                    openedAt: new Date().toISOString(),
                    repoPath,
                    sessionName,
                    basePath: baseTmpAbs,
                    localPath: backup,
                    remotePath: alsAbsPath,
                    conflictJson: tw.conflictJson,
                  },
                  null,
                  2,
                ),
                'utf8',
              );
              return {
                success: false,
                alsMergeConflict: { conflictJson: tw.conflictJson, pendingPath },
              };
            }
            if (!tw.ok || !tw.merged) {
              throw new Error('Three-way merge returned no data');
            }
            mergedBuffer = tw.merged;
            await fs.promises.unlink(baseTmpAbs).catch(() => {});
          } else {
            console.log('[Rebase] Two-way ALS merge (Rust mergeAlsFiles)');
            mergedBuffer = await mergeAlsFilesSafe(backup, alsAbsPath);
          }
        } else {
          console.log('[Rebase] Two-way ALS merge — rebuild native addon for three-way');
          mergedBuffer = await mergeAlsFilesSafe(backup, alsAbsPath);
        }

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

        await fs.promises.unlink(baseTmpAbs).catch(() => {});

        return {
          success: false,
          error: `Unable to merge your local project with the downloaded version. Your previous project file was restored. The Rust merge step failed: ${mergeMsg}`,
        };
      }
    } else if (hasBackup && alsAbsPath) {
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

        return {
          success: false,
          error: `Unable to merge your local project with the downloaded version. Your previous project file was restored. The Rust merge step failed: ${mergeMsg}`,
        };
      }
    }

    console.log(`[Rebase] Download operation completed successfully`);
    return { success: true };
  } catch (error) {
    console.log(`[Rebase] Error during pull — cleaning up git state`);
    await ensureCleanGitState(repoPath);
    console.log(`[Rebase] Git state cleaned`);

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
    if (!skipBackupCleanup) {
      await deleteBackupIfExists(repoPath);
    }
  }
}

/** Written when `mergeAlsFilesThreeWay` returns a conflict JSON payload. */
export type AlsMergePendingFile = {
  openedAt: string;
  repoPath: string;
  sessionName: string;
  basePath: string;
  localPath: string;
  remotePath: string;
  conflictJson: string;
  /** When set (rebase hook), merged bytes are written here — `remotePath` may be a stage temp. */
  outputPath?: string;
  /** After Apply merge: `git add` + `git rebase --continue` (and optional dirty-backup ALS merge). */
  rebaseResume?: boolean;
  /** Pre-pull uncommitted `.als` backup merge after rebase fully completes. */
  dirtyBackupMerge?: { baseCommit: string; alsRelPath: string };
};

/**
 * Apply user per-track choices (`remote` | `local` | `duplicate`) and finish the ALS merge.
 * Removes the backup, BASE temp, and `als-merge-pending.json`. Writes `merge-pending.json`
 * when any choice is `duplicate` (Complete merge in UI).
 */
export async function completeAlsMergeWithResolutions(
  pendingPath: string,
  resolutions: Record<string, string>,
): Promise<{ hadDuplicate: boolean }> {
  const raw = await fs.promises.readFile(pendingPath, 'utf8');
  const p = JSON.parse(raw) as AlsMergePendingFile;
  const mergeThree = semanticDiffer.mergeAlsFilesThreeWay as MergeAlsThreeWayFn | undefined;
  if (typeof mergeThree !== 'function') {
    throw new Error(
      'mergeAlsFilesThreeWay is missing — rebuild: cd apps/desktop/native/semantic-diff && npm run build',
    );
  }
  const res = await mergeThree(p.basePath, p.localPath, p.remotePath, JSON.stringify(resolutions));
  if (!res.ok || !res.merged) {
    throw new Error(res.conflictJson || 'Three-way ALS merge failed after resolution');
  }
  const outPath = p.outputPath ?? p.remotePath;
  await fs.promises.writeFile(outPath, res.merged);
  await fs.promises.unlink(p.localPath).catch(() => {});
  await fs.promises.unlink(p.basePath).catch(() => {});
  if (p.outputPath && p.remotePath !== p.outputPath) {
    await fs.promises.unlink(p.remotePath).catch(() => {});
  }
  await fs.promises.unlink(pendingPath).catch(() => {});
  const hadDuplicate = Object.values(resolutions).some(
    (v) => String(v).toLowerCase() === 'duplicate',
  );
  if (hadDuplicate) {
    const mp = path.join(p.repoPath, '.soundhaus', 'merge-pending.json');
    await fs.promises.mkdir(path.dirname(mp), { recursive: true });
    await fs.promises.writeFile(
      mp,
      JSON.stringify(
        {
          openedAt: new Date().toISOString(),
          repoPath: p.repoPath,
          sessionName: p.sessionName,
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  if (p.rebaseResume) {
    const alsRelForAdd = path.relative(p.repoPath, outPath).split(path.sep).join('/');
    await resolveSoundhausSnapshotRebaseConflicts(p.repoPath, alsRelForAdd);
    const addR = await exec(['add', alsRelForAdd], p.repoPath);
    if (addR.exitCode !== 0) {
      throw new Error(addR.stderr || addR.stdout || 'git add failed after ALS merge');
    }
    let cont = await execRebaseContinue(p.repoPath);
    while (cont.exitCode !== 0 && (await isRebaseInProgress(p.repoPath))) {
      const hook = await tryRustMergeAlsRebaseConflict(
        p.repoPath,
        alsRelForAdd,
        outPath,
        mergeThree,
        {
          sessionName: p.sessionName,
          dirtyBackupMerge: p.dirtyBackupMerge,
        },
      );
      if (hook.kind === 'needs_ui') {
        throw new Error(
          'Another ALS merge conflict appeared while continuing the rebase. A new pending merge was saved under .soundhaus — refresh the project or reopen the ALS merge UI.',
        );
      }
      if (hook.kind === 'not_applicable' || hook.kind === 'rust_error') {
        throw new Error(
          hook.kind === 'rust_error'
            ? hook.message
            : cont.stderr || cont.stdout || 'rebase could not continue after ALS merge',
        );
      }
      cont = await execRebaseContinue(p.repoPath);
    }
    if (cont.exitCode !== 0) {
      throw new Error(cont.stderr || cont.stdout || 'rebase --continue failed after ALS merge');
    }
  }

  if (p.dirtyBackupMerge && p.rebaseResume) {
    const backupAbs = backupPath(p.repoPath);
    try {
      await fs.promises.access(backupAbs);
    } catch {
      return { hadDuplicate };
    }
    const { baseCommit, alsRelPath } = p.dirtyBackupMerge;
    const baseTmpAbs = path.join(p.repoPath, BASE_ALS_TEMP);
    let baseWritten = false;
    try {
      const baseBuf = await gitShowBinary(p.repoPath, `${baseCommit}:${alsRelPath}`);
      await fs.promises.writeFile(baseTmpAbs, baseBuf);
      baseWritten = true;
    } catch (be) {
      console.warn('[Rebase] Could not load BASE for dirty backup merge:', be);
    }
    if (baseWritten) {
      const tw = await mergeThree(baseTmpAbs, backupAbs, outPath, undefined);
      if (!tw.ok && tw.conflictJson) {
        const pendingDir = path.join(p.repoPath, '.soundhaus');
        await fs.promises.mkdir(pendingDir, { recursive: true });
        const newPending = path.join(pendingDir, 'als-merge-pending.json');
        await fs.promises.writeFile(
          newPending,
          JSON.stringify(
            {
              openedAt: new Date().toISOString(),
              repoPath: p.repoPath,
              sessionName: p.sessionName,
              basePath: baseTmpAbs,
              localPath: backupAbs,
              remotePath: outPath,
              conflictJson: tw.conflictJson,
            },
            null,
            2,
          ),
          'utf8',
        );
        throw new Error(
          'Your uncommitted session changes conflict after download. Resolve in the ALS merge UI.',
        );
      }
      if (!tw.ok || !tw.merged) {
        await fs.promises.unlink(baseTmpAbs).catch(() => {});
        throw new Error(tw.conflictJson || 'Dirty backup ALS merge failed');
      }
      await fs.promises.writeFile(outPath, tw.merged);
      await fs.promises.unlink(baseTmpAbs).catch(() => {});
      await fs.promises.unlink(backupAbs).catch(() => {});
    } else {
      const mergedBuffer = await mergeAlsFilesSafe(backupAbs, outPath);
      await fs.promises.writeFile(outPath, mergedBuffer);
      await fs.promises.unlink(backupAbs).catch(() => {});
    }
  }

  return { hadDuplicate };
}

export { rebase };
