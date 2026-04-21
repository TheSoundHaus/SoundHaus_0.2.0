import { exec } from 'dugite';
import * as fs from 'fs';
import * as path from 'path';
import { ensureGiteaGitCredentialsApproved } from './giteaGitAuth';
import {
  rebase,
  completeAlsMergeWithResolutions,
} from './git-rebase';
import { checkMissingSampleRefs, findRootAlsFile, SampleCheckBlockedError } from './sampleRefs';

const noGitPromptEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };

/** Marker line so we only append our block once and can recognize managed content. */
const SOUNDHAUS_GITIGNORE_MARKER = '# SoundHaus (managed block — do not remove this line)';

const SOUNDHAUS_GITIGNORE_BLOCK = `${SOUNDHAUS_GITIGNORE_MARKER}
# macOS folder icons (e.g. Icon\\r), Ableton Backup folders
**/*Icon*
Backup/
`;

/**
 * Writes or appends SoundHaus default ignore rules. Matches new init and legacy repos on first commit.
 */
function ensureSoundHausGitignore(repoPath: string): void {
  const gitignorePath = path.join(repoPath, '.gitignore');
  let existing = '';
  if (fs.existsSync(gitignorePath)) {
    existing = fs.readFileSync(gitignorePath, 'utf8');
  }
  if (existing.includes(SOUNDHAUS_GITIGNORE_MARKER)) {
    return;
  }
  const prefix = existing.length && !existing.endsWith('\n') ? '\n' : '';
  const block = (existing ? prefix : '') + SOUNDHAUS_GITIGNORE_BLOCK + '\n';
  fs.writeFileSync(gitignorePath, existing + block, 'utf8');
}

/**
 * True if a tracked path should be dropped from the index per SoundHaus defaults (mirrors .gitignore rules).
 */
function shouldUntrackSoundHausPath(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, '/');
  const segments = norm.split('/');
  if (segments.some((s) => s === 'Backup')) {
    return true;
  }
  if (segments.some((s) => s.includes('Icon'))) {
    return true;
  }
  return false;
}

/**
 * Git does not track empty directories. Ableton creates "Ableton Project Info/" as an
 * empty folder in modern Live (11/12) with no .cfg file inside. Without a tracked file,
 * git won't commit the directory and Windows clones won't have it, causing the
 * "outside of a Project folder" error on save. We drop a .gitkeep to preserve it.
 */
async function ensureAbletonProjectInfoTracked(repoPath: string): Promise<void> {
    const SKIP = new Set(['.git', '.soundhaus', 'node_modules', '__MACOSX']);

    async function walk(dir: string, depth: number): Promise<void> {
        if (depth > 8) return;
        let entries;
        try {
            entries = await fs.promises.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (SKIP.has(entry.name)) continue;
            const full = path.join(dir, entry.name);
            if (entry.name === 'Ableton Project Info') {
                const gitkeepPath = path.join(full, '.gitkeep');
                if (!fs.existsSync(gitkeepPath)) {
                    try {
                        await fs.promises.writeFile(gitkeepPath, '', 'utf8');
                        console.log('[project] Created .gitkeep in', full);
                    } catch (e) {
                        console.warn('[project] Could not write .gitkeep in', full, e);
                    }
                }
            } else {
                await walk(full, depth + 1);
            }
        }
    }
    await walk(repoPath, 0);
}

/**
 * Stops tracking paths that are now ignored (legacy repos that committed Icon files or Backup trees).
 */
async function untrackLegacyIgnoredPaths(repoPath: string): Promise<void> {
  const ls = await exec(['ls-files', '-z'], repoPath);
  if (ls.exitCode !== 0) {
    return;
  }
  const tracked = ls.stdout.split('\0').filter(Boolean);
  const toRemove = tracked.filter(shouldUntrackSoundHausPath);
  if (toRemove.length === 0) {
    return;
  }
  const rm = await exec(['rm', '--cached', '-f', '--', ...toRemove], repoPath);
  if (rm.exitCode !== 0) {
    console.warn('[project] git rm --cached for legacy ignored paths:', rm.stderr || rm.stdout);
  }
}

export type PullPushOptions = {
  skipMissingSampleCheck?: boolean;
};

/** Pull stopped: three-way ALS merge needs per-track Remote / Local / Duplicate. */
export class AlsMergeConflictError extends Error {
  readonly code = 'ALS_MERGE_CONFLICT' as const;
  readonly conflictJson: string;
  readonly pendingPath: string;

  constructor(conflictJson: string, pendingPath: string) {
    super(
      'Overlapping clip changes need your choice — use Remote, Local, or Duplicate track for each listed track.',
    );
    this.conflictJson = conflictJson;
    this.pendingPath = pendingPath;
    this.name = 'AlsMergeConflictError';
  }
}

/** Push blocked: local branch is behind origin (fetch + rev-list). */
export class PushBehindRemoteError extends Error {
  readonly code = 'PUSH_BEHIND_REMOTE' as const;

  constructor(message: string) {
    super(message);
    this.name = 'PushBehindRemoteError';
  }
}

async function fetchAndAssertAheadOfUpstream(repoPath: string): Promise<void> {
  const up = await exec(['rev-parse', '--abbrev-ref', '@{u}'], repoPath);
  if (up.exitCode !== 0 || !up.stdout.trim()) {
    return;
  }
  const branchName = up.stdout.trim().replace(/^origin\//, '');
  const fe = await exec(['fetch', 'origin', branchName], repoPath);
  if (fe.exitCode !== 0) {
    console.warn('[Project] Pre-push fetch failed; behind-check skipped:', fe.stderr || fe.stdout);
    return;
  }
  const lr = await exec(['rev-list', '--left-right', '--count', 'HEAD...@{u}'], repoPath);
  if (lr.exitCode !== 0) {
    return;
  }
  const parts = lr.stdout.trim().split(/\s+/);
  const behind = parseInt(parts[1] || '0', 10) || 0;
  if (behind > 0) {
    throw new PushBehindRemoteError(
      `You are behind the remote by ${behind} commit(s). Pull the latest changes before pushing.`,
    );
  }
}

async function assertSamplesOkForSync(repoPath: string, opts?: PullPushOptions): Promise<void> {
  if (opts?.skipMissingSampleCheck) {
    return;
  }
  const als = await findRootAlsFile(repoPath);
  if (!als) {
    return;
  }
  const { hasIssues, issues } = await checkMissingSampleRefs(repoPath, als);
  if (hasIssues) {
    throw new SampleCheckBlockedError(issues);
  }
}

async function pull(repoPath: string, opts?: PullPushOptions) {
  await assertSamplesOkForSync(repoPath, opts);
  console.log(`[Project] Pull requested for: ${repoPath}`);
  const result = await rebase(repoPath);
  if (!result.success) {
    console.error(`[Project] Pull failed: ${result.error}`);
    if (result.alsMergeConflict) {
      throw new AlsMergeConflictError(
        result.alsMergeConflict.conflictJson,
        result.alsMergeConflict.pendingPath,
      );
    }
    throw new Error(result.error || 'Pull failed');
  }
  console.log(`[Project] Pull completed successfully`);
  return 'Changes downloaded successfully';
}

async function commit(repoPath: string, message?: string) {
  const msg = message || 'Update project';

  ensureSoundHausGitignore(repoPath);
  await ensureAbletonProjectInfoTracked(repoPath);
  await untrackLegacyIgnoredPaths(repoPath);

  const addResult = await exec(['add', '.'], repoPath);
  if (addResult.exitCode !== 0) {
    throw new Error(addResult.stderr || 'git add failed');
  }

  const commitResult = await exec(['commit', '-m', msg], repoPath);
  if (commitResult.exitCode !== 0) {
    // "nothing to commit" is a normal condition, not an error
    const combined = `${commitResult.stdout}\n${commitResult.stderr}`.toLowerCase();
    if (combined.includes('nothing to commit')) {
      console.log('[commit] Nothing to commit — working tree clean');
      return 'nothing to commit';
    }
    throw new Error(commitResult.stderr || 'git commit failed');
  }

  return commitResult.stdout;
}

async function push(repoPath: string, opts?: PullPushOptions) {
  await assertSamplesOkForSync(repoPath, opts);
  await fetchAndAssertAheadOfUpstream(repoPath);
  // Ensure there is at least one commit before pushing (new empty repo)
  const headCheck = await exec(['rev-parse', '--verify', 'HEAD'], repoPath);
  if (headCheck.exitCode !== 0) {
    await exec(['add', '.'], repoPath);
    await exec(['commit', '--allow-empty', '-m', 'Initial snapshot'], repoPath);
  }
  const result = await exec(['push', '-u', 'origin', 'HEAD'], repoPath, { env: noGitPromptEnv });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'git push failed');
  }
  return result.stdout;
}

async function clearMergePendingFlag(repoPath: string): Promise<void> {
  const mp = path.join(repoPath, '.soundhaus', 'merge-pending.json');
  await fs.promises.unlink(mp).catch(() => {});
}

export {
  pull,
  commit,
  push,
  ensureSoundHausGitignore,
  ensureAbletonProjectInfoTracked,
  SampleCheckBlockedError,
  completeAlsMergeWithResolutions,
  clearMergePendingFlag,
};
