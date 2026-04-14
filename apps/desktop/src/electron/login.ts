import { exec as gitExec } from 'dugite';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
const soundhausDir = path.join(os.homedir(), '.soundhaus');
const soundhausCredPath = path.join(soundhausDir, '.soundhaus-credentials');
const giteaCredPath = path.join(soundhausDir, '.gitea-credentials');
const allowedCloneRemotePath = path.join(soundhausDir, '.allowed-clone-remote');

function getSoundHausCredentials(): Promise<string | null> {
    return new Promise((resolve) => {
        try {
            if (!fs.existsSync(soundhausCredPath)) {
                resolve(null);
                return;
            }

            const token = fs.readFileSync(soundhausCredPath, 'utf-8').trim();
            resolve(token || null);
        } catch (error) {
            console.warn('Failed to read saved PAT:', error);
            resolve(null);
        }
    });
}

function setSoundHausCredentials(token: string): Promise<string> {
    return new Promise(async (resolve, reject) => {
        try {
            // Configure credential helper globally
            await gitExec(['config', '--global', 'credential.helper', 'store'], os.homedir());

            fs.mkdirSync(soundhausDir, { recursive: true });

            fs.writeFileSync(soundhausCredPath, token);
            
            resolve('Credentials saved successfully');
        } catch (error) {
            reject(`Failed to set credentials: ${error}`);
        }
    });
}

function getGiteaCredentials(): Promise<string | null> {
    return new Promise((resolve) => {
        try {
            if (!fs.existsSync(giteaCredPath)) {
                resolve(null);
                return;
            }

            const token = fs.readFileSync(giteaCredPath, 'utf-8').trim();
            resolve(token || null);
        } catch (error) {
            console.warn('Failed to read saved Gitea PAT:', error);
            resolve(null);
        }
    });
}

function setGiteaCredentials(token: string): Promise<string> {
    return new Promise(async (resolve, reject) => {
        try {            
            fs.mkdirSync(soundhausDir, { recursive: true });

            // Clear stale git credential store entries for the Gitea host
            // so a previous user's cached credentials don't persist
            try {
                const gitCredFile = path.join(os.homedir(), '.git-credentials');
                if (fs.existsSync(gitCredFile)) {
                    const lines = fs.readFileSync(gitCredFile, 'utf-8').split('\n');
                    // Read the allowed remote to know which host to clear
                    let giteaHost = '';
                    if (fs.existsSync(allowedCloneRemotePath)) {
                        try {
                            const remote = fs.readFileSync(allowedCloneRemotePath, 'utf-8').trim();
                            const parsed = new URL(remote.includes('://') ? remote : `https://${remote}`);
                            giteaHost = parsed.host;
                        } catch { /* ignore parse errors */ }
                    }
                    if (giteaHost) {
                        const filtered = lines.filter(line => {
                            try {
                                return !line.includes(giteaHost);
                            } catch { return true; }
                        });
                        fs.writeFileSync(gitCredFile, filtered.join('\n'));
                        console.log('[login] Cleared stale git credentials for', giteaHost);
                    }
                }
            } catch (credErr) {
                console.warn('[login] Could not clear git credential store (non-fatal):', credErr);
            }

            fs.writeFileSync(giteaCredPath, token);
            
            resolve('Credentials saved successfully');
        } catch (error) {
            reject(`Failed to set credentials: ${error}`);
        }
    });
}

function getAllowedCloneRemote(): Promise<string | null> {
    return new Promise((resolve) => {
        try {
            if (!fs.existsSync(allowedCloneRemotePath)) {
                resolve(null);
                return;
            }

            const remote = fs.readFileSync(allowedCloneRemotePath, 'utf-8').trim();
            resolve(remote || null);
        } catch (error) {
            console.warn('Failed to read allowed clone remote:', error);
            resolve(null);
        }
    });
}

function setAllowedCloneRemote(remote: string): Promise<string> {
    return new Promise((resolve, reject) => {
        try {
            fs.mkdirSync(soundhausDir, { recursive: true });
            fs.writeFileSync(allowedCloneRemotePath, remote.trim());
            resolve('Allowed clone remote saved successfully');
        } catch (error) {
            reject(`Failed to set allowed clone remote: ${error}`);
        }
    });
}

/** Remove all stored credentials and clear the git credential store for the Gitea host. */
async function clearCredentials(): Promise<void> {
    // Wipe the git credential store entries for the Gitea host
    try {
        const gitCredFile = path.join(os.homedir(), '.git-credentials');
        if (fs.existsSync(gitCredFile) && fs.existsSync(allowedCloneRemotePath)) {
            const remote = fs.readFileSync(allowedCloneRemotePath, 'utf-8').trim();
            const parsed = new URL(remote.includes('://') ? remote : `https://${remote}`);
            const giteaHost = parsed.host;
            if (giteaHost) {
                const lines = fs.readFileSync(gitCredFile, 'utf-8').split('\n');
                const filtered = lines.filter(l => !l.includes(giteaHost));
                fs.writeFileSync(gitCredFile, filtered.join('\n'));
            }
        }
    } catch (err) {
        console.warn('[logout] Could not clear git credential store (non-fatal):', err);
    }

    // Remove SoundHaus credential files
    for (const p of [soundhausCredPath, giteaCredPath, allowedCloneRemotePath]) {
        try { fs.unlinkSync(p); } catch { /* already absent */ }
    }
}

export {
    getSoundHausCredentials,
    setSoundHausCredentials,
    getGiteaCredentials,
    setGiteaCredentials,
    getAllowedCloneRemote,
    setAllowedCloneRemote,
    clearCredentials
}