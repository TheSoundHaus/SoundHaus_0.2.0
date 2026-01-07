import { exec } from 'child_process';
import { dialog, BrowserWindow } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { join } from 'path'
import * as path from 'path';
import * as fs from 'fs';

const platformMap: Partial<Record<NodeJS.Platform, string>> = {
  win32: 'windows',
  darwin: 'macos',
  linux: 'linux',
};

const platformDir = platformMap[process.platform] || process.platform;
const envGit = process.env.SOUNDHAUS_GIT_BIN;
let gitBin = envGit || path.join(__dirname, '..', 'vendor', 'git', platformDir, process.platform === 'win32' ? 'git.exe' : 'git');
try {
  // fs is imported above as default export
  if (gitBin !== 'git' && !fs.existsSync(gitBin)) {
    console.warn('Configured git binary not found at', gitBin, '— falling back to system `git` in PATH');
    gitBin = 'git';
  }
} catch (e) {
  gitBin = 'git';
}

async function chooseFolder(mainWindow?: BrowserWindow): Promise<string | null> {
    const options: OpenDialogOptions = {
        properties: ['openDirectory'],
        title: 'Choose SoundHaus project directory'
    };

    const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, options)
        : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }

    return result.filePaths[0];
}

async function hasGitFile(folderPath: string): Promise<boolean> {
    const gitPath = join(folderPath, '.git');
    try {
        const stat = await fs.promises.stat(gitPath);
        return stat.isDirectory() || stat.isFile();
    }
    catch(err) {
        return false;
    }
}

function init(folderPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const gitCmd = `"${gitBin}" init -b main`;
        exec(gitCmd, { cwd: folderPath }, (gitErr, _gitStdout, gitStderr) => {
            if (gitErr) {
                reject(gitStderr || gitErr.message);
                return;
            }

            const repoName = path.basename(folderPath).replace(/\s+/g, '_');

            const curlCmd = `curl -sS -X POST http://129.212.182.247:3000/api/v1/user/repos \
            -u "4cf84c7c-0b07-4043-bdf6-9edf229625e6:DesktopTest123!" \
            -H "Content-Type: application/json" \
            -H "Accept: application/json" \
            -d '{
                "name": "${repoName}",
                "description": "",
                "private": false,
                "auto_init": false,
                "default_branch": "main"
            }'`;

            exec(curlCmd, { cwd: folderPath }, (curlErr, curlStdout, curlStderr) => {
                if (curlErr) {
                    reject(curlStderr || curlErr.message);
                    return;
                }

                let remoteURL = '';
                try {
                  const parsed = JSON.parse(curlStdout);
                  remoteURL = parsed.url || '';
                } catch (parseErr) {
                  reject(`Failed to parse repo creation response: ${parseErr}`);
                  return;
                }

                if (!remoteURL) {
                  reject('Repo creation did not return a url');
                  return;
                }

                // Insert credentials into the URL
                remoteURL = remoteURL.replace('http://', 'http://79e189c1bdbc88bec7196c5c5c9eb43293ed329a@');
                remoteURL = remoteURL.replace('/api/v1/repos', '');

                const setRemoteCmd = `git remote add origin ${remoteURL}`;
                exec(setRemoteCmd, { cwd: folderPath }, (remoteErr, _remoteStdout, remoteStderr) => {
                  if (remoteErr) {
                    reject(remoteStderr || remoteErr.message);
                    return;
                  }

                  // Set upstream tracking for main branch
                  const setUpstreamCmd = `git branch --set-upstream-to=origin/main main`;
                  exec(setUpstreamCmd, { cwd: folderPath }, (upstreamErr, _upstreamStdout, upstreamStderr) => {
                    // Ignore error if branch doesn't exist yet - will be set on first push
                    if (upstreamErr) {
                      console.warn('Could not set upstream tracking:', upstreamStderr);
                    }
                    resolve(remoteURL);
                  });
                });
            });
        });
    });
}

export {
    chooseFolder,
    hasGitFile,
    init
};