import { exec } from 'child_process';
import { promisify } from 'util';
import { dialog, BrowserWindow } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { getAllowedCloneRemote, getGiteaCredentials } from './login';
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
const giteaApiBaseUrl = (process.env.SOUNDHAUS_GITEA_PUBLIC_URL || process.env.VITE_GITEA_PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
let gitBin: string;

function getGiteaApiRequestOptions(): { protocol: string; hostname: string; port: number } {
    const parsed = new URL(giteaApiBaseUrl);
    return {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80,
    };
}

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

type ParsedCloneUrl = {
    protocol: 'http' | 'https';
    hostPort: string;
    repoOwner: string;
    repoName: string;
};

function parseAllowedRemoteHostPort(allowedRemote: string): string {
    const trimmed = allowedRemote.trim();
    if (!trimmed) {
        throw new Error('Allowed remote is empty. Please log in again.');
    }

    const normalizedInput = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    const parsed = new URL(normalizedInput);
    if (!parsed.host) {
        throw new Error('Allowed remote is invalid. Please log in again.');
    }
    return parsed.host.toLowerCase();
}

function parseCloneUrl(cloneUrl: string): ParsedCloneUrl {
    const value = cloneUrl.trim();
    if (!value) {
        throw new Error('Clone URL is required.');
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(value);
    } catch {
        throw new Error('Clone URL is invalid.');
    }

    const protocol = parsedUrl.protocol.replace(':', '').toLowerCase();
    if (protocol !== 'http' && protocol !== 'https') {
        throw new Error('Only HTTP and HTTPS clone URLs are allowed.');
    }

    const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
    if (pathSegments.length < 2) {
        throw new Error('Clone URL must include owner/repository path.');
    }

    const repoOwner = pathSegments[0];
    const repoLeaf = pathSegments[pathSegments.length - 1];
    const repoName = repoLeaf.endsWith('.git') ? repoLeaf.slice(0, -4) : repoLeaf;
    if (!repoOwner || !repoName) {
        throw new Error('Clone URL must include a valid owner and repository name.');
    }

    return {
        protocol: protocol as 'http' | 'https',
        hostPort: parsedUrl.host.toLowerCase(),
        repoOwner,
        repoName,
    };
}

function validateCloneUrlAgainstAllowedRemote(cloneUrl: string, allowedRemote: string): ParsedCloneUrl {
    const parsedCloneUrl = parseCloneUrl(cloneUrl);
    const allowedHostPort = parseAllowedRemoteHostPort(allowedRemote);
    if (parsedCloneUrl.hostPort !== allowedHostPort) {
        throw new Error(`Only repositories from ${allowedHostPort} can be cloned.`);
    }
    return parsedCloneUrl;
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
            const giteaRequestTarget = getGiteaApiRequestOptions();
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

async function cloneRepo(cloneUrl: string, destinationPath: string): Promise<string> {
    console.log('[clone] Starting repository clone...');
    console.log('[clone] Clone URL:', cloneUrl);
    console.log('[clone] Destination path:', destinationPath);

    try {
        const allowedRemote = await getAllowedCloneRemote();
        if (!allowedRemote) {
            throw new Error('Allowed remote not configured. Please log in again.');
        }

        // Validate URL against allowed SoundHaus remote and parse clone target
        const parsedClone = validateCloneUrlAgainstAllowedRemote(cloneUrl, allowedRemote);
        const repoOwner = parsedClone.repoOwner;
        const repoName = parsedClone.repoName;
        
        // Create full path including repo subdirectory
        const fullDestinationPath = path.join(destinationPath, repoName);
        
        console.log('[clone] Repository owner:', repoOwner);
        console.log('[clone] Repository name:', repoName);
        console.log('[clone] Full destination:', fullDestinationPath);

        if (parsedClone.protocol === 'https' || parsedClone.protocol === 'http') {
            const cloneUrlObj = new URL(cloneUrl);

            // Get Gitea credentials
            console.log('[clone] Getting Gitea credentials...');
            const token = await getGiteaCredentials();
            if (!token) {
                throw new Error('No Gitea token found. Please log in first.');
            }
            console.log('[clone] ✓ Gitea token retrieved');

            // Configure credential helper to store credentials
            console.log('[clone] Setting up credential helper...');
            const setHelperCmd = `"${gitBin}" config --global credential.helper store`;
            const { stdout: helperStdout, stderr: helperStderr } = await execAsync(setHelperCmd);
            if (helperStdout) console.log('[clone] Credential helper stdout:', helperStdout);
            if (helperStderr) console.warn('[clone] Credential helper stderr:', helperStderr);
            console.log('[clone] ✓ Credential helper configured');

            // Approve credentials for this host
            const approveCmd =
                `printf "protocol=${cloneUrlObj.protocol.replace(':', '')}\n` +
                `host=${cloneUrlObj.host}\n` +
                `username=${repoOwner}\n` +
                `password=${token}\n\n" | "${gitBin}" credential approve`;

            console.log('[clone] Approving credentials for:', `${cloneUrlObj.protocol}//${cloneUrlObj.host}`);
            const { stdout: approveStdout, stderr: approveStderr } = await execAsync(approveCmd);
            if (approveStdout) console.log('[clone] Credential approve stdout:', approveStdout);
            if (approveStderr) console.warn('[clone] Credential approve stderr:', approveStderr);
            console.log('[clone] ✓ Credentials approved');
        }

        // Run git clone - this will create the subdirectory automatically
        console.log('[clone] Running git clone...');
        const cloneCmd = `"${gitBin}" clone "${cloneUrl}" "${fullDestinationPath}"`;
        console.log('[clone] Command:', cloneCmd);
        const { stdout: cloneStdout, stderr: cloneStderr } = await execAsync(cloneCmd);
        
        if (cloneStdout) console.log('[clone] Clone stdout:', cloneStdout);
        if (cloneStderr) console.warn('[clone] Clone stderr:', cloneStderr);
        
        console.log('[clone] ✅ Repository cloned successfully!');
        console.log('[clone] Summary:');
        console.log('[clone] - Clone URL:', cloneUrl);
        console.log('[clone] - Destination:', fullDestinationPath);
        
        return fullDestinationPath;

    } catch (error: any) {
        console.error('[clone] ❌ Error during clone:', error);
        console.error('[clone] Error stack:', error.stack);
        throw new Error(`Failed to clone repository: ${error.message}`);
    }
}

export {
    chooseFolder,
    hasGitFile,
    init,
    cloneRepo,
    validateCloneUrlAgainstAllowedRemote
};