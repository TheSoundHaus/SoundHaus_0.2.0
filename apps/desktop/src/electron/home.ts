import { exec } from 'child_process';
import { dialog, BrowserWindow } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { getGiteaCredentials } from './login';
import { join } from 'path'
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';

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

interface ProjectSetupData {
    name: string;
    description: string;
    isPublic: boolean;
}

function init(folderPath: string, projectInfo?: ProjectSetupData): Promise<string> {
    return new Promise((resolve, reject) => {
        const gitCmd = `"${gitBin}" init -b main`;
        exec(gitCmd, { cwd: folderPath }, (gitErr, _gitStdout, gitStderr) => {
            if (gitErr) {
                reject(gitStderr || gitErr.message);
                return;
            }

            const repoName = path.basename(folderPath).replace(/\s+/g, '_');
            
            // Use project info if provided, otherwise use defaults
            // Sanitize name to only allow alphanumeric, dashes, and dots (API requirement)
            const sanitizeName = (name: string): string => {
                return name
                    .replace(/\s+/g, '-')           // Replace spaces with dashes
                    .replace(/[^a-zA-Z0-9\-\.]/g, '') // Remove anything that's not alphanumeric, dash, or dot
                    .replace(/^-+|-+$/g, '');        // Remove leading/trailing dashes
            };
            
            const finalRepoName = projectInfo ? sanitizeName(projectInfo.name) : repoName;
            const finalDescription = projectInfo?.description || '';
            const isPrivate = projectInfo?.isPublic === false; // private if not explicitly public
            
            // Build JSON payload
            const payload = JSON.stringify({
                name: finalRepoName,
                description: finalDescription,
                private: isPrivate,
                auto_init: false,
                default_branch: "main"
            });

            const token = getGiteaCredentials();
            console.log(`Token: ${token}`);
            
            // Use Node.js HTTP request instead of curl to avoid shell escaping issues
            const reqOptions = {
                hostname: 'localhost',
                port: 3000,
                path: '/api/v1/user/repos',
                method: 'POST',
                headers: {
                    'Authorization': `token ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            };

            const req = http.request(reqOptions, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    let remoteURL = '';
                    try {
                        const parsed = JSON.parse(data);
                        remoteURL = parsed.clone_url || parsed.url || '';
                    } catch (parseErr) {
                        reject(`Failed to parse repo creation response: ${parseErr}\nResponse: ${data}`);
                        return;
                    }

                    if (!remoteURL) {
                        reject(`Repo creation did not return a url. Response: ${data}`);
                        return;
                    }

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
                                return;
                            }

                            resolve(remoteURL);
                        });
                    });
                });
            });

            req.on('error', (error) => {
                reject(`HTTP request error: ${error.message}`);
            });

            req.write(payload);
            req.end();
        });
    });
}

export {
    chooseFolder,
    hasGitFile,
    init
};