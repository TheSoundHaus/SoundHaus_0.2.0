import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const platformMap: Partial<Record<NodeJS.Platform, string>> = {
  win32: 'windows',
  darwin: 'macos',
  linux: 'linux',
};

const platformDir = platformMap[process.platform] || process.platform;
const envGit = process.env.SOUNDHAUS_GIT_BIN;
let gitBin = envGit || path.join(__dirname, '..', 'vendor', 'git', platformDir, process.platform === 'win32' ? 'git.exe' : 'git');
try {
  if (gitBin !== 'git' && !fs.existsSync(gitBin)) {
    console.warn('Configured git binary not found at', gitBin, '— falling back to system `git` in PATH');
    gitBin = 'git';
  }
} catch (e) {
  gitBin = 'git';
}

interface RebaseResult {
  success: boolean;
  error?: string;
  conflictingFiles?: string[];
}

/**
 * Detects conflicting files from git status output
 * Returns array of file paths that have conflicts
 */
function parseConflictingFiles(repoPath: string): Promise<string[]> {
  return new Promise((resolve) => {
    const statusCmd = `"${gitBin}" status --porcelain`;
    exec(statusCmd, { cwd: repoPath }, (err, stdout) => {
      if (!stdout) {
        resolve([]);
        return;
      }

      // Lines starting with "UU", "AA", "DD", "UD", "DU" indicate conflicts
      const conflictStatuses = /^(UU|AA|DD|UD|DU) /;
      const conflictingFiles = stdout
        .split('\n')
        .filter((line) => conflictStatuses.test(line))
        .map((line) => line.substring(3).trim())
        .filter(Boolean);

      resolve(conflictingFiles);
    });
  });
}

/**
 * Aborts an ongoing rebase operation
 */
function abortRebase(repoPath: string): Promise<void> {
  return new Promise((resolve) => {
    const cmd = `"${gitBin}" rebase --abort`;
    exec(cmd, { cwd: repoPath }, () => {
      // Ignore errors, rebase might not be in progress
      resolve();
    });
  });
}

/**
 * Performs a git fetch followed by a rebase operation
 * If conflicts occur, aborts the rebase and returns an error
 * @param repoPath - Path to the git repository
 * @returns Result object with success status and optional error/conflicting files
 */
async function rebase(repoPath: string): Promise<RebaseResult> {
  try {
    // Step 1: Fetch from remote
    console.log(`[Rebase] Starting fetch from origin/main in ${repoPath}`);
    await new Promise<void>((resolve, reject) => {
      const fetchCmd = `"${gitBin}" fetch origin main`;
      exec(fetchCmd, { cwd: repoPath }, (err, stdout, stderr) => {
        if (err) {
          console.error(`[Rebase] Fetch failed: ${stderr || err.message}`);
          reject(new Error(`Fetch failed: ${stderr || err.message}`));
        } else {
          console.log(`[Rebase] Fetch completed successfully`);
          resolve();
        }
      });
    });

    // Step 2: Attempt rebase
    console.log(`[Rebase] Starting rebase onto origin/main`);
    await new Promise<void>((resolve, reject) => {
      const rebaseCmd = `"${gitBin}" rebase origin/main`;
      exec(rebaseCmd, { cwd: repoPath }, (err, stdout, stderr) => {
        if (err) {
          console.error(`[Rebase] Rebase failed: ${stderr || err.message}`);
          reject(new Error(`Rebase failed: ${stderr || err.message}`));
        } else {
          console.log(`[Rebase] Rebase completed successfully`);
          resolve();
        }
      });
    });

    // Step 3: Success - no conflicts
    console.log(`[Rebase] Download operation completed successfully`);
    return {
      success: true,
    };
  } catch (error) {
    // Check if this is a conflict error by looking at git status
    console.log(`[Rebase] Checking for conflicts after error`);
    const conflictingFiles = await parseConflictingFiles(repoPath);

    if (conflictingFiles.length > 0) {
      // Conflicts detected - abort rebase
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

    // Some other git error occurred
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Rebase] Download operation failed: ${errorMsg}`);
    return {
      success: false,
      error: `Unable to download changes: ${errorMsg}`,
    };
  }
}

export { rebase };
