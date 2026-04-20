import { exec as gitExec } from 'dugite';
import * as http from 'http';
import * as https from 'https';
import { desktopEnv } from './env';
import { getGiteaCredentials } from './login';

function getGiteaApiRequestOptions(): { protocol: string; hostname: string; port: number; basePath: string } {
  const parsed = new URL(desktopEnv.giteaPublicUrl);
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

/**
 * Registers the current SoundHaus user's Git HTTPS credentials with Git's
 * credential helpers so push/pull never open an interactive host sign-in page.
 */
export async function ensureGiteaGitCredentialsApproved(repoPath: string): Promise<void> {
  const token = await getGiteaCredentials();
  if (!token) {
    throw new Error(
      'You are not signed in to SoundHaus, or Git access is missing. Sign in again, then retry.',
    );
  }

  const originRes = await gitExec(['remote', 'get-url', 'origin'], repoPath);
  if (originRes.exitCode !== 0) {
    throw new Error(originRes.stderr?.trim() || 'Could not read this project’s remote.');
  }

  const raw = originRes.stdout.trim();
  if (!raw) {
    throw new Error('This project has no remote URL configured.');
  }

  const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  const protocol = (url.protocol || 'https:').replace(/:$/, '');
  const host = url.host;
  if (!host || (protocol !== 'http' && protocol !== 'https')) {
    throw new Error('Only HTTPS (or HTTP) remotes are supported for SoundHaus projects.');
  }

  const segments = url.pathname.split('/').filter(Boolean);
  const repoOwner = segments[0] ?? '';
  const login = await fetchGiteaTokenUserLogin(token);
  const username = login || repoOwner || 'token';

  const stdin =
    `protocol=${protocol}\nhost=${host}\nusername=${username}\npassword=${token}\n\n`;
  const approve = await gitExec(['credential', 'approve'], repoPath, { stdin });
  if (approve.exitCode !== 0) {
    const detail = (approve.stderr || approve.stdout || '').trim();
    throw new Error(
      detail
        ? `SoundHaus could not refresh Git login for this project. ${detail}`
        : 'SoundHaus could not refresh Git login for this project. Sign in again, then retry.',
    );
  }
}
