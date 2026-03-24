import * as dotenv from 'dotenv';
import * as path from 'path';

// Load desktop env vars for Electron main-process modules.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return value;
}

export const desktopEnv = {
    giteaPublicUrl: requireEnv('GITEA_PUBLIC_URL').replace(/\/$/, ''),
};
