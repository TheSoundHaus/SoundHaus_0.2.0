import { exec } from 'child_process';
import path from 'path';
import { dialog } from 'electron';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let watcherStarted = false;

const platformMap = {
  win32: 'windows',
  darwin: 'macos',
  linux: 'linux',
};

const platformDir = platformMap[process.platform] || process.platform;
let gitBin = path.join(__dirname, 'vendor', 'git', platformDir, process.platform === 'win32' ? 'git.exe' : 'git');

async function chooseFolder(mainWindow) {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Choose clone destination',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
}

function cloneRepo(url, repoPath, mainWindow) {
  return new Promise((resolve, reject) => {
    const command = `"${gitBin}" clone ${url} "${repoPath}"`;
    exec(command, (err, stdout, stderr) => {
      if (err) {
        dialog.showErrorBox("Clone Failed", stderr || "An error occurred.");
        return reject(stderr);
      } else {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Clone Successful',
          message: 'Repository cloned successfully!',
        });
        return resolve(stdout);
      }
    });
  });
}

function getStatus(repoPath) {
  return new Promise((resolve, reject) => {
    const cmd = `"${gitBin}" status --porcelain`;
    exec(cmd, { cwd: repoPath }, (err, stdout) => {
      if (err) {
        // Not a git repository or other error — report no changes
        return resolve([]);
      }

      const changes = stdout
        .split('\n')
        .filter(Boolean)
        .map(line => {
          const status = line.slice(0, 2).trim();
          const file = line.slice(3).trim();
          return { status, file };
        });

      resolve(changes);
    });
  });
}

function pull(repoPath) {
  return new Promise((resolve, reject) => {
    const cmd = `"${gitBin}" pull`;
    exec(cmd, { cwd: repoPath }, (err, stdout, stderr) => {
      if (err) {
        return reject(stderr);
      }
      resolve(stdout);
    });
  });
}

function push(repoPath) {
  return new Promise((resolve, reject) => {
    const cmds = [
      `"${gitBin}" add .`,
      `"${gitBin}" commit -m "Auto-commit from Electron app"`,
      `"${gitBin}" push origin HEAD`
    ];
    const cmd = cmds.join(' && ');

    exec(cmd, { cwd: repoPath }, (err, stdout, stderr) => {
      if (err) {
        return reject(stderr);
      }
      resolve(stdout);
    });
  });
}

export {
  chooseFolder,
  cloneRepo,
  getStatus,
  pull,
  push
};