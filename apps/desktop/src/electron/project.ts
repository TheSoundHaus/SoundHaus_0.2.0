import { exec } from 'dugite';
import * as fs from 'fs';
import * as path from 'path';
import { rebase } from './git-rebase';

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
export async function ensureAbletonProjectInfoTracked(repoPath: string): Promise<void> {
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

async function pull(repoPath: string) {
  console.log(`[Project] Pull requested for: ${repoPath}`);
  const result = await rebase(repoPath);
  if (!result.success) {
    console.error(`[Project] Pull failed: ${result.error}`);
    throw new Error(result.error);
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
    throw new Error(commitResult.stderr || 'git commit failed');
  }

  return commitResult.stdout;
}

async function push(repoPath: string) {
  const result = await exec(['push', 'origin', 'HEAD'], repoPath);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'git push failed');
  }
  return result.stdout;
}

export { pull, commit, push, ensureSoundHausGitignore, ensureAbletonProjectInfoTracked };
