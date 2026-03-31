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

function pull(repoPath: string) {
  return new Promise((resolve, reject) => {
    const cmd = `"${gitBin}" pull origin main`;
    exec(cmd, { cwd: repoPath }, (err, stdout, stderr) => {
      if (err) { reject(stderr); return; }
      resolve(stdout);
    });
  });
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
    const cmd = [
      // If HEAD doesn't exist yet (fresh repo), create an initial commit.
      // Using `git commit --allow-empty` avoids refspec HEAD failures and keeps the flow smooth.
      `"${gitBin}" rev-parse --verify HEAD >/dev/null 2>&1 || (` +
        `"${gitBin}" add . && "${gitBin}" commit --allow-empty -m "Initial snapshot"` +
      `)`,
      `"${gitBin}" push -u origin HEAD`,
    ].join(' && ');

    exec(cmd, { cwd: repoPath }, (err, stdout, stderr) => {
      if (err) { reject(stderr); return; }
      resolve(stdout);
    });
  });
}

export { gitBin, pull, commit, push };

