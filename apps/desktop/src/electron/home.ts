import { exec } from 'child_process';
import { promisify } from 'util';
import { dialog, BrowserWindow } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { getGiteaCredentials } from './login';
import { join } from 'path'
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';

const execAsync = promisify(exec);

const platformMap: Partial<Record<NodeJS.Platform, string>> = {
  win32: 'windows',
  darwin: 'macos',
  linux: 'linux',
};

const platformDir = platformMap[process.platform] || process.platform;
const envGit = process.env.SOUNDHAUS_GIT_BIN;
let gitBin: string;

// Try to use bundled git, but fall back to system git if it fails
if (envGit) {
  gitBin = envGit;
  console.log('[git] Using git from SOUNDHAUS_GIT_BIN:', gitBin);
} else {
  const bundledGit = path.join(__dirname, '..', 'vendor', 'git', platformDir, process.platform === 'win32' ? 'git.exe' : 'git');
  
  try {
    if (fs.existsSync(bundledGit)) {
      // Test if bundled git actually works
      const { execSync } = require('child_process');
      try {
        execSync(`"${bundledGit}" --version`, { timeout: 2000, stdio: 'pipe' });
        gitBin = bundledGit;
        console.log('[git] Using bundled git:', gitBin);
      } catch (testErr) {
        console.warn('[git] Bundled git failed test, falling back to system git');
        gitBin = 'git';
      }
    } else {
      console.warn('[git] Bundled git not found at', bundledGit, '— using system git');
      gitBin = 'git';
    }
  } catch (e) {
    console.warn('[git] Error checking bundled git, using system git:', e);
    gitBin = 'git';
  }
}

console.log('[git] Final git binary:', gitBin);

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

async function init(folderPath: string, projectInfo?: ProjectSetupData): Promise<string> {
    console.log('[init] Starting repository initialization...');
    console.log('[init] Folder path:', folderPath);
    console.log('[init] Project info:', projectInfo);

    try {
        // Step 1: Initialize git repository
        console.log('[init] Step 1: Running git init...');
        const gitCmd = `"${gitBin}" init -b main`;
        const { stdout: gitStdout, stderr: gitStderr } = await execAsync(gitCmd, { cwd: folderPath });
        console.log('[init] Git init stdout:', gitStdout);
        if (gitStderr) console.warn('[init] Git init stderr:', gitStderr);
        
        // Verify .git folder was created
        const gitPath = join(folderPath, '.git');
        if (!fs.existsSync(gitPath)) {
            throw new Error(`.git folder not created at ${gitPath}`);
        }
        console.log('[init] ✓ Git repository initialized successfully');
        console.log('[init] .git folder verified at:', gitPath);

        // Step 2: Prepare remote repository creation
        const repoName = path.basename(folderPath).replace(/\s+/g, '_');
        
        const sanitizeName = (name: string): string => {
            return name
                .replace(/\s+/g, '-')           // Replace spaces with dashes
                .replace(/[^a-zA-Z0-9\-\.]/g, '') // Remove anything that's not alphanumeric, dash, or dot
                .replace(/^-+|-+$/g, '');        // Remove leading/trailing dashes
        };
        
        const finalRepoName = projectInfo ? sanitizeName(projectInfo.name) : repoName;
        const finalDescription = projectInfo?.description || '';
        const isPrivate = projectInfo?.isPublic === false;
        
        console.log('[init] Step 2: Creating remote repository...');
        console.log('[init] Repository name:', finalRepoName);
        console.log('[init] Description:', finalDescription);
        console.log('[init] Private:', isPrivate);
        
        const payload = JSON.stringify({
            name: finalRepoName,
            description: finalDescription,
            private: isPrivate,
            auto_init: false,
            default_branch: "main"
        });

        // Step 3: Get Gitea credentials
        console.log('[init] Step 3: Getting Gitea credentials...');
        const token = await getGiteaCredentials();
        if (!token) {
            throw new Error('No Gitea token found. Please log in first.');
        }
        console.log('[init] ✓ Gitea token retrieved');

        // Step 4: Create remote repository via HTTP request
        console.log('[init] Step 4: Making HTTP request to create repository...');
        const remoteURL = await new Promise<string>((resolve, reject) => {
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
                console.log('[init] HTTP Response status:', res.statusCode);
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    console.log('[init] HTTP Response body:', data);
                    
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                        return;
                    }
                    
                    try {
                        const parsed = JSON.parse(data);
                        const url = parsed.clone_url || parsed.url || '';
                        
                        if (!url) {
                            reject(new Error(`Repo creation did not return a URL. Response: ${data}`));
                            return;
                        }
                        
                        console.log('[init] ✓ Remote repository created');
                        console.log('[init] Clone URL:', url);
                        resolve(url);
                    } catch (parseErr) {
                        reject(new Error(`Failed to parse repo creation response: ${parseErr}\nResponse: ${data}`));
                    }
                });
            });

            req.on('error', (error) => {
                console.error('[init] HTTP request error:', error);
                reject(new Error(`HTTP request error: ${error.message}`));
            });

            req.write(payload);
            req.end();
        });

        // Step 5: Configure git credentials
        console.log('[init] Step 5: Configuring git credentials...');
        const repoUrl = new URL(remoteURL);
        const repoPathParts = repoUrl.pathname.split('/').filter(Boolean);
        const repoOwner = repoPathParts[0] || '';
        
        console.log('[init] Repository owner:', repoOwner);

        // Set credential helper to store
        const setHelperCmd = `"${gitBin}" config --local credential.helper store`;
        console.log('[init] Running:', setHelperCmd);
        const { stdout: helperStdout, stderr: helperStderr } = await execAsync(setHelperCmd, { cwd: folderPath });
        if (helperStdout) console.log('[init] Credential helper stdout:', helperStdout);
        if (helperStderr) console.warn('[init] Credential helper stderr:', helperStderr);
        console.log('[init] ✓ Credential helper configured');

        // Approve credentials for this repository
        const approveCmd =
            `printf "protocol=${repoUrl.protocol.replace(':', '')}\n` +
            `host=${repoUrl.host}\n` +
            `username=${repoOwner}\n` +
            `password=${token}\n\n" | "${gitBin}" credential approve`;
        
        console.log('[init] Approving credentials for:', `${repoUrl.protocol}//${repoUrl.host}`);
        const { stdout: approveStdout, stderr: approveStderr } = await execAsync(approveCmd, { cwd: folderPath });
        if (approveStdout) console.log('[init] Credential approve stdout:', approveStdout);
        if (approveStderr) console.warn('[init] Credential approve stderr:', approveStderr);
        console.log('[init] ✓ Credentials approved');

        // Step 6: Add remote origin
        console.log('[init] Step 6: Adding remote origin...');
        const setRemoteCmd = `"${gitBin}" remote add origin ${remoteURL}`;
        console.log('[init] Running:', setRemoteCmd);
        const { stdout: remoteStdout, stderr: remoteStderr } = await execAsync(setRemoteCmd, { cwd: folderPath });
        if (remoteStdout) console.log('[init] Remote add stdout:', remoteStdout);
        if (remoteStderr) console.warn('[init] Remote add stderr:', remoteStderr);
        console.log('[init] ✓ Remote origin added');

        // Step 7: Set upstream tracking (may fail if no commits yet - that's okay)
        console.log('[init] Step 7: Setting upstream tracking...');
        const setUpstreamCmd = `"${gitBin}" branch --set-upstream-to=origin/main main`;
        try {
            const { stdout: upstreamStdout, stderr: upstreamStderr } = await execAsync(setUpstreamCmd, { cwd: folderPath });
            if (upstreamStdout) console.log('[init] Upstream stdout:', upstreamStdout);
            if (upstreamStderr) console.warn('[init] Upstream stderr:', upstreamStderr);
            console.log('[init] ✓ Upstream tracking configured');
        } catch (upstreamErr: any) {
            console.warn('[init] Could not set upstream tracking (will be set on first push):', upstreamErr.message);
        }

        console.log('[init] ✅ Repository initialization complete!');
        console.log('[init] Summary:');
        console.log('[init] - Local path:', folderPath);
        console.log('[init] - Remote URL:', remoteURL);
        console.log('[init] - Repository name:', finalRepoName);
        
        return remoteURL;

    } catch (error: any) {
        console.error('[init] ❌ Error during initialization:', error);
        console.error('[init] Error stack:', error.stack);
        throw new Error(`Failed to initialize repository: ${error.message}`);
    }
}

export {
    chooseFolder,
    hasGitFile,
    init
};