import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { rebase } from './git-rebase';

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

function commit(repoPath: string, message?: string) {
  const msg = message || 'Update project';
  // Escape double quotes inside the message to prevent shell injection
  const escapedMsg = msg.replace(/"/g, '\\"');
  return new Promise((resolve, reject) => {
    const cmds = [
      `"${gitBin}" add .`,
      `"${gitBin}" commit -m "${escapedMsg}"`,
    ];
    const cmd = cmds.join(' && ');
    exec(cmd, { cwd: repoPath }, (err, stdout, stderr) => {
      if (err) { reject(stderr); return; }
      resolve(stdout);
    });
  });
}

function push(repoPath: string) {
  return new Promise((resolve, reject) => {
    const cmd = `"${gitBin}" push origin HEAD`;
    exec(cmd, { cwd: repoPath }, (err, stdout, stderr) => {
      if (err) { reject(stderr); return; }
      resolve(stdout);
    });
  });
}

export { gitBin, pull, commit, push };

