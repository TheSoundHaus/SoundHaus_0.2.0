import * as path from 'path';
import { app } from 'electron';
const dotenv = require('dotenv');

// In a packaged app, __dirname is inside the asar archive and cannot reach the .env
// file on disk. Instead, extraResources copies .env to process.resourcesPath.
const envPath = app.isPackaged
    ? path.resolve(process.resourcesPath, '.env')
    : path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return value;
}

export const desktopEnv = {
    giteaPublicUrl: requireEnv('GITEA_PUBLIC_URL').replace(/\/$/, ''),
    supabasePublicUrl: requireEnv('VITE_SUPABASE_PUBLIC_URL').replace(/\/$/, ''),
};
