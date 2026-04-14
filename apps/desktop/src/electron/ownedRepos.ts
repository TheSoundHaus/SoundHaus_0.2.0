import { exec as gitExec } from 'dugite';
import * as fs from 'fs';
import * as path from 'path';

import { desktopEnv } from './env';
import { getAllowedCloneRemote, getSoundHausCredentials } from './login';
import { recentProjectsManager } from './recentProjectsManager';

export type OnlineRepoItemStatus = 'installed_locally' | 'online_only';

export interface OnlineRepoItem {
  fullName: string;
  displayName: string;
  cloneUrl: string;
  localPath?: string;
  status: OnlineRepoItemStatus;
}

export type GetOwnedReposResult =
  | { ok: true; items: OnlineRepoItem[] }
  | { ok: false; error: string };

interface GiteaRepoJson {
  name?: string;
  full_name?: string;
  clone_url?: string;
}

function parseAllowedHost(allowedRemote: string): string | null {
  const trimmed = allowedRemote.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const input = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    return new URL(input).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Normalize a remote URL to owner/repo when its host matches the configured Gitea host.
 */
function remoteUrlToFullName(remoteUrl: string, expectedHost: string): string | null {
  const trimmed = remoteUrl.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('git@')) {
    const at = trimmed.indexOf('@');
    const colon = trimmed.indexOf(':', at + 1);
    if (colon === -1) {
      return null;
    }
    const host = trimmed.slice(at + 1, colon).toLowerCase();
    if (host !== expectedHost) {
      return null;
    }
    let pathPart = trimmed.slice(colon + 1).replace(/\.git$/i, '');
    pathPart = pathPart.replace(/\\/g, '/');
    const segments = pathPart.split('/').filter(Boolean);
    if (segments.length < 2) {
      return null;
    }
    const repo = segments[segments.length - 1];
    const owner = segments[segments.length - 2];
    return `${owner}/${repo}`;
  }

  try {
    const u = new URL(trimmed);
    if (u.host.toLowerCase() !== expectedHost) {
      return null;
    }
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) {
      return null;
    }
    const repoLeaf = parts[parts.length - 1].replace(/\.git$/i, '');
    const owner = parts[parts.length - 2];
    return `${owner}/${repoLeaf}`;
  } catch {
    return null;
  }
}

async function pathHasGit(folderPath: string): Promise<boolean> {
  const gitPath = path.join(folderPath, '.git');
  try {
    const stat = await fs.promises.stat(gitPath);
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

async function getOriginUrl(repoPath: string): Promise<string | null> {
  const result = await gitExec(['remote', 'get-url', 'origin'], repoPath);
  if (result.exitCode !== 0) {
    return null;
  }
  const line = result.stdout.trim().split(/\n/)[0]?.trim() ?? '';
  return line || null;
}

/**
 * Map lowercase full_name → local path. Most recently opened recents win for the same repo.
 */
async function buildFullNameToLocalPath(expectedHost: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const recents = await recentProjectsManager.getAllProjects();
  const sorted = [...recents].sort((a, b) => {
    const ta = new Date(a.lastOpened).getTime();
    const tb = new Date(b.lastOpened).getTime();
    return tb - ta;
  });

  for (const p of sorted) {
    const folderPath = p.path;
    if (!(await pathHasGit(folderPath))) {
      continue;
    }
    const origin = await getOriginUrl(folderPath);
    if (!origin) {
      continue;
    }
    const fullName = remoteUrlToFullName(origin, expectedHost);
    if (!fullName) {
      continue;
    }
    const key = fullName.toLowerCase();
    if (!map.has(key)) {
      map.set(key, folderPath);
    }
  }

  return map;
}

function fallbackCloneUrl(fullName: string): string {
  const base = desktopEnv.giteaPublicUrl.replace(/\/$/, '');
  return `${base}/${fullName}.git`;
}

export async function getOwnedReposForOpenDialog(): Promise<GetOwnedReposResult> {
  const apiBase = desktopEnv.supabasePublicUrl?.replace(/\/$/, '');
  if (!apiBase) {
    return { ok: false, error: 'API URL is not configured.' };
  }

  const pat = await getSoundHausCredentials();
  if (!pat) {
    return { ok: false, error: 'Log in to see your online projects.' };
  }

  const allowed = await getAllowedCloneRemote();
  if (!allowed) {
    return { ok: false, error: 'Allowed remote is not configured. Please log in again.' };
  }

  const expectedHost = parseAllowedHost(allowed);
  if (!expectedHost) {
    return { ok: false, error: 'Could not read Gitea host from your login settings.' };
  }

  let response: Response;
  try {
    response = await fetch(`${apiBase}/repos?ownership=owned`, {
      headers: {
        Authorization: `token ${pat}`,
        Accept: 'application/json',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Could not reach the server: ${msg}` };
  }

  const rawText = await response.text().catch(() => '');
  let body: { success?: boolean; repos?: unknown; detail?: string };
  try {
    body = rawText ? (JSON.parse(rawText) as typeof body) : {};
  } catch {
    return { ok: false, error: 'Invalid response from server when listing projects.' };
  }

  if (response.status === 401) {
    return {
      ok: false,
      error: 'Session expired or not signed in. Log in again to list online projects.',
    };
  }

  if (!response.ok) {
    const detail =
      typeof body.detail === 'string'
        ? body.detail
        : `Server returned ${response.status}.`;
    return { ok: false, error: detail };
  }

  if (!body.success || !Array.isArray(body.repos)) {
    return { ok: false, error: 'Unexpected response when listing your projects.' };
  }

  const fullNameToPath = await buildFullNameToLocalPath(expectedHost);
  const items: OnlineRepoItem[] = [];

  for (const raw of body.repos as GiteaRepoJson[]) {
    const fullName = typeof raw.full_name === 'string' ? raw.full_name.trim() : '';
    if (!fullName) {
      continue;
    }
    const displayName =
      typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim()
        : fullName.split('/').pop() ?? fullName;
    const cloneUrl =
      typeof raw.clone_url === 'string' && raw.clone_url.trim()
        ? raw.clone_url.trim()
        : fallbackCloneUrl(fullName);

    const key = fullName.toLowerCase();
    const localPath = fullNameToPath.get(key);
    const status: OnlineRepoItemStatus = localPath ? 'installed_locally' : 'online_only';

    items.push({
      fullName,
      displayName,
      cloneUrl,
      ...(localPath ? { localPath } : {}),
      status,
    });
  }

  items.sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'installed_locally' ? -1 : 1;
    }
    return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
  });

  return { ok: true, items };
}
