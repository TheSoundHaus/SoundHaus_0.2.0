import { exec as gitExec } from 'dugite';
import { dialog, BrowserWindow } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { getAllowedCloneRemote, getGiteaCredentials, getSoundHausCredentials } from './login';
import { ensureSoundHausGitignore, ensureAbletonProjectInfoTracked } from './project';
import { desktopEnv } from './env';
import { join } from 'path'
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as os from 'os';

const giteaApiBaseUrl = desktopEnv.giteaPublicUrl;

function getGiteaApiRequestOptions(): { protocol: string; hostname: string; port: number; basePath: string } {
    const parsed = new URL(giteaApiBaseUrl);
    return {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80,
        basePath: parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, ''),
    };
}

async function fetchGiteaTokenUserLogin(token: string): Promise<string | null> {
    const giteaRequestTarget = getGiteaApiRequestOptions();
    const transport = giteaRequestTarget.protocol === 'https:' ? https : http;
    const userPath = `${giteaRequestTarget.basePath}/api/v1/user`;

    try {
        const resBody: { status: number; body: string } = await new Promise(
            (resolve, reject) => {
                const req = transport.request(
                    {
                        hostname: giteaRequestTarget.hostname,
                        port: giteaRequestTarget.port,
                        path: userPath,
                        method: 'GET',
                        headers: { Authorization: `token ${token}` },
                    },
                    (res) => {
                        let data = '';
                        res.on('data', (chunk: string) => {
                            data += chunk;
                        });
                        res.on('end', () => {
                            resolve({ status: res.statusCode ?? 0, body: data });
                        });
                    },
                );
                req.on('error', reject);
                req.end();
            },
        );
        if (resBody.status !== 200) {
            return null;
        }
        const parsed = JSON.parse(resBody.body) as { login?: string };
        return parsed.login ?? null;
    } catch {
        return null;
    }
}

function httpsUrlWithEmbeddedToken(
    cloneUrl: string,
    username: string,
    token: string,
): string {
    const u = new URL(cloneUrl);
    u.username = username;
    u.password = token;
    return u.href;
}

async function approveGitCredentials(
    params: { protocol: string; host: string; username: string; password: string },
    cwd?: string,
): Promise<{ stdout: string; stderr: string }> {
    const stdinInput =
        `protocol=${params.protocol}\n` +
        `host=${params.host}\n` +
        `username=${params.username}\n` +
        `password=${params.password}\n\n`;

    const workDir = cwd || os.homedir();
    const result = await gitExec(['credential', 'approve'], workDir, { stdin: stdinInput });
    if (result.exitCode !== 0) {
        throw new Error(`git credential approve exited with code ${result.exitCode}: ${result.stderr || result.stdout}`);
    }
    return { stdout: result.stdout, stderr: result.stderr };
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

async function deleteGiteaRepo(owner: string, repo: string, token: string): Promise<void> {
    const giteaRequestTarget = getGiteaApiRequestOptions();
    const requestPath = `${giteaRequestTarget.basePath}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const transport = giteaRequestTarget.protocol === 'https:' ? https : http;
    return new Promise((resolve) => {
        const req = transport.request({
            hostname: giteaRequestTarget.hostname,
            port: giteaRequestTarget.port,
            path: requestPath,
            method: 'DELETE',
            headers: { 'Authorization': `token ${token}` },
        }, (res) => {
            res.resume(); // drain response
            console.log(`[init:rollback] DELETE ${requestPath} → ${res.statusCode}`);
            resolve();
        });
        req.on('error', (e) => {
            console.warn('[init:rollback] DELETE request failed:', e.message);
            resolve();
        });
        req.end();
    });
}

async function init(folderPath: string, projectInfo?: ProjectSetupData): Promise<string> {
    console.log('[init] Starting repository initialization...');
    console.log('[init] Folder path:', folderPath);
    console.log('[init] Project info:', projectInfo);

    // Track created resources for rollback on failure
    let giteaRepoOwner: string | null = null;
    let giteaRepoName: string | null = null;
    let giteaToken: string | null = null;
    let giteaRepoCreated = false;

    try {
        // Step 1: Initialize git repository
        console.log('[init] Step 1: Running git init...');
        const initResult = await gitExec(['init', '-b', 'main'], folderPath);
        console.log('[init] Git init stdout:', initResult.stdout);
        if (initResult.stderr) console.warn('[init] Git init stderr:', initResult.stderr);
        if (initResult.exitCode !== 0) {
            throw new Error(`git init failed: ${initResult.stderr}`);
        }
        
        // Verify .git folder was created
        const gitPath = join(folderPath, '.git');
        if (!fs.existsSync(gitPath)) {
            throw new Error(`.git folder not created at ${gitPath}`);
        }
        console.log('[init] ✓ Git repository initialized successfully');
        console.log('[init] .git folder verified at:', gitPath);

        ensureSoundHausGitignore(folderPath);
        console.log('[init] ✓ Default .gitignore (Icon / Backup) applied');

        await ensureAbletonProjectInfoTracked(folderPath);
        console.log('[init] ✓ Ableton Project Info/ preserved for git tracking');

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
        giteaToken = token;
        console.log('[init] ✓ Gitea token retrieved');

        // Step 4: Create remote repository via HTTP request
        console.log('[init] Step 4: Making HTTP request to create repository...');
        const remoteURL = await new Promise<string>((resolve, reject) => {
            const giteaRequestTarget = getGiteaApiRequestOptions();
            const requestPath = `${giteaRequestTarget.basePath}/api/v1/user/repos`;
            const transport = giteaRequestTarget.protocol === 'https:' ? https : http;
            const reqOptions = {
                hostname: giteaRequestTarget.hostname,
                port: giteaRequestTarget.port,
                path: requestPath,
                method: 'POST',
                headers: {
                    'Authorization': `token ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            };

            console.log('[init] Gitea API target:', `${giteaRequestTarget.protocol}//${giteaRequestTarget.hostname}:${giteaRequestTarget.port}${requestPath}`);

            const req = transport.request(reqOptions, (res) => {
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
                        
                        // Track for rollback
                        const owner = parsed.owner?.login || parsed.full_name?.split('/')[0] || '';
                        giteaRepoOwner = owner;
                        giteaRepoName = parsed.name || finalRepoName;
                        giteaRepoCreated = true;

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
                const detail = error instanceof Error ? (error.stack || error.message) : String(error);
                reject(new Error(`HTTP request error: ${detail}`));
            });

            req.write(payload);
            req.end();
        });

        // Step 4.5: Register repo in the SoundHaus database
        console.log('[init] Step 4.5: Registering repo in SoundHaus database...');
        const supabaseToken = await getSoundHausCredentials();
        if (supabaseToken) {
            try {
                const registerRes = await fetch(`${desktopEnv.supabasePublicUrl}/repos/register`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `token ${supabaseToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        name: finalRepoName,
                        description: finalDescription,
                        private: isPrivate,
                    }),
                });
                const registerBody = await registerRes.text().catch(() => '');
                console.log('[init] Register response:', registerRes.status, registerBody);
                console.log('[init] ✓ Repo registered in SoundHaus database');
            } catch (regErr: any) {
                console.warn('[init] Could not register repo in database (non-fatal):', regErr.message);
            }
        } else {
            console.warn('[init] No SoundHaus token available, skipping database registration');
        }

        // Step 5: Configure git credentials
        console.log('[init] Step 5: Configuring git credentials...');
        const repoUrl = new URL(remoteURL);
        const repoPathParts = repoUrl.pathname.split('/').filter(Boolean);
        const repoOwner = repoPathParts[0] || '';
        
        console.log('[init] Repository owner:', repoOwner);

        // Set credential helper to store
        console.log('[init] Running: git config --local credential.helper store');
        const helperResult = await gitExec(['config', '--local', 'credential.helper', 'store'], folderPath);
        if (helperResult.stdout) console.log('[init] Credential helper stdout:', helperResult.stdout);
        if (helperResult.stderr) console.warn('[init] Credential helper stderr:', helperResult.stderr);
        console.log('[init] ✓ Credential helper configured');

        // Approve credentials for this repository
        console.log('[init] Approving credentials for:', `${repoUrl.protocol}//${repoUrl.host}`);
        const { stdout: approveStdout, stderr: approveStderr } = await approveGitCredentials({
            protocol: repoUrl.protocol.replace(':', ''),
            host: repoUrl.host,
            username: repoOwner,
            password: token,
        }, folderPath);
        if (approveStdout) console.log('[init] Credential approve stdout:', approveStdout);
        if (approveStderr) console.warn('[init] Credential approve stderr:', approveStderr);
        console.log('[init] ✓ Credentials approved');

        // Step 6: Add remote origin
        console.log('[init] Step 6: Adding remote origin...');
        console.log('[init] Running: git remote add origin', remoteURL);
        const remoteResult = await gitExec(['remote', 'add', 'origin', remoteURL], folderPath);
        if (remoteResult.stdout) console.log('[init] Remote add stdout:', remoteResult.stdout);
        if (remoteResult.stderr) console.warn('[init] Remote add stderr:', remoteResult.stderr);
        console.log('[init] ✓ Remote origin added');

        // Step 7: Set upstream tracking (may fail if no commits yet - that's okay)
        console.log('[init] Step 7: Setting upstream tracking...');
        const upstreamResult = await gitExec(['branch', '--set-upstream-to=origin/main', 'main'], folderPath);
        if (upstreamResult.exitCode === 0) {
            if (upstreamResult.stdout) console.log('[init] Upstream stdout:', upstreamResult.stdout);
            if (upstreamResult.stderr) console.warn('[init] Upstream stderr:', upstreamResult.stderr);
            console.log('[init] ✓ Upstream tracking configured');
        } else {
            console.warn('[init] Could not set upstream tracking (will be set on first push):', upstreamResult.stderr);
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

        // Rollback: delete the Gitea remote repo if it was already created
        if (giteaRepoCreated && giteaRepoOwner && giteaRepoName && giteaToken) {
            console.log(`[init:rollback] Deleting orphaned Gitea repo ${giteaRepoOwner}/${giteaRepoName}...`);
            await deleteGiteaRepo(giteaRepoOwner, giteaRepoName, giteaToken);
        }

        // Clean up orphaned .git directory if init failed partway through
        const gitDir = join(folderPath, '.git');
        try {
            await fs.promises.rm(gitDir, { recursive: true, force: true });
            console.log('[init] Cleaned up orphaned .git directory');
        } catch { /* ignore cleanup errors */ }

        // Clean up .soundhaus directory if it was created
        const soundhausDir = join(folderPath, '.soundhaus');
        try {
            await fs.promises.rm(soundhausDir, { recursive: true, force: true });
            console.log('[init] Cleaned up orphaned .soundhaus directory');
        } catch { /* ignore cleanup errors */ }

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

        const parsedClone = validateCloneUrlAgainstAllowedRemote(cloneUrl, allowedRemote);
        const repoOwner = parsedClone.repoOwner;
        const repoName = parsedClone.repoName;
        const fullDestinationPath = path.join(destinationPath, repoName);

        console.log('[clone] Repository owner:', repoOwner);
        console.log('[clone] Repository name:', repoName);
        console.log('[clone] Full destination:', fullDestinationPath);

        let cloneResult: Awaited<ReturnType<typeof gitExec>>;

        if (parsedClone.protocol === 'https' || parsedClone.protocol === 'http') {
            console.log('[clone] Getting Gitea credentials...');
            const token = await getGiteaCredentials();
            if (!token) {
                throw new Error('No Gitea token found. Please log in first.');
            }
            console.log('[clone] ✓ Gitea token retrieved');

            const tokenUserLogin = await fetchGiteaTokenUserLogin(token);
            const credentialUsername = tokenUserLogin ?? repoOwner;
            const authedCloneUrl = httpsUrlWithEmbeddedToken(
                cloneUrl,
                credentialUsername,
                token,
            );

            console.log('[clone] Running git clone...');
            const noPromptEnv: NodeJS.ProcessEnv = {
                ...process.env,
                GIT_TERMINAL_PROMPT: '0',
            };
            cloneResult = await gitExec(
                ['clone', authedCloneUrl, fullDestinationPath],
                destinationPath,
                { env: noPromptEnv },
            );

            if (cloneResult.exitCode === 0) {
                console.log('[clone] Stripping credentials from origin remote...');
                const setUrlResult = await gitExec(
                    ['remote', 'set-url', 'origin', cloneUrl],
                    fullDestinationPath,
                );
                if (setUrlResult.exitCode !== 0) {
                    console.warn('[clone] Could not reset origin URL:', setUrlResult.stderr);
                } else {
                    console.log('[clone] ✓ Origin uses credential-free URL');
                }
            }
        } else {
            console.log('[clone] Running git clone...');
            console.log('[clone] Command: git clone', cloneUrl, fullDestinationPath);
            cloneResult = await gitExec(['clone', cloneUrl, fullDestinationPath], destinationPath);
        }

        if (cloneResult.stdout) console.log('[clone] Clone stdout:', cloneResult.stdout);
        if (cloneResult.stderr) console.warn('[clone] Clone stderr:', cloneResult.stderr);
        if (cloneResult.exitCode !== 0) {
            throw new Error(`git clone failed: ${cloneResult.stderr}`);
        }

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