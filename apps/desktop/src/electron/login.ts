import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

function getSoundHausCredentials(): Promise<string | null> {
    return new Promise((resolve) => {
        try {
            const credPath = path.join(os.homedir(), '.soundhaus', '.soundhaus-credentials');
            
            if (!fs.existsSync(credPath)) {
                resolve(null);
                return;
            }
            
            const token = fs.readFileSync(credPath, 'utf-8').trim();
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
            await execAsync('git config --global credential.helper store');
            
            // Write credentials to ~/.soundhaus/.git-credentials
            const soundhausDir = path.join(os.homedir(), '.soundhaus');
            fs.mkdirSync(soundhausDir, { recursive: true });

            const credPath = path.join(soundhausDir, '.soundhaus-credentials');
            fs.writeFileSync(credPath, token);
            
            resolve('Credentials saved successfully');
        } catch (error) {
            reject(`Failed to set credentials: ${error}`);
        }
    });
}

function getGiteaCredentials(): Promise<string | null> {
    return new Promise((resolve) => {
        try {
            const credPath = path.join(os.homedir(), '.soundhaus', '.gitea-credentials');
            
            if (!fs.existsSync(credPath)) {
                resolve(null);
                return;
            }
            
            const token = fs.readFileSync(credPath, 'utf-8').trim();
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
            // Write credentials to ~/.soundhaus/.git-credentials
            const soundhausDir = path.join(os.homedir(), '.soundhaus');
            fs.mkdirSync(soundhausDir, { recursive: true });

            const credPath = path.join(soundhausDir, '.gitea-credentials');
            fs.writeFileSync(credPath, token);
            
            resolve('Credentials saved successfully');
        } catch (error) {
            reject(`Failed to set credentials: ${error}`);
        }
    });
}

export {
    getSoundHausCredentials,
    setSoundHausCredentials,
    getGiteaCredentials,
    setGiteaCredentials
}