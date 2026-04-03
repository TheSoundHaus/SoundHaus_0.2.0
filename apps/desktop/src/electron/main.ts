import { app, BrowserWindow, shell, ipcMain, Menu } from "electron";
import type { IpcMainInvokeEvent, MenuItemConstructorOptions } from 'electron';
import { desktopEnv } from './env';
import { chooseFolder, hasGitFile, init, cloneRepo, validateCloneUrlAgainstAllowedRemote } from './home'
import { getSoundHausCredentials, setSoundHausCredentials, getGiteaCredentials, setGiteaCredentials, getAllowedCloneRemote, setAllowedCloneRemote } from "./login"; 
import { gitBin, pull, commit, push } from "./project";
import { createProjectSetupDialog } from './dialogs/projectSetupDialog';
import { createCloneUrlDialog } from './dialogs/cloneUrlDialog';
import { createAboutDialog } from './dialogs/aboutDialog';
import { buildSearchableIndex } from './menuIndexer';
import { recentProjectsManager } from './recentProjectsManager';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from "path";
import { parseAls, diffFromSnapshot, diffSnapshots, generateCommitMessage } from 'semantic-differ'
import { changesToProjectDiff } from './diffTransformer'

// Handle Squirrel.Windows install/update/uninstall events and exit immediately.
// Without this, setup can launch the app at the wrong time and shortcut creation may fail.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const isDev = process.env.DEV != undefined;
const isPreview = process.env.PREVIEW != undefined;

let mainWindow: BrowserWindow | null = null;

if (process.platform === 'win32') {
  // Keep a stable AppUserModelID so Start Menu/taskbar shortcuts resolve consistently.
  app.setAppUserModelId('com.soundhaus.desktop');
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

// Tracks the last project path selected by the user so View > Project View
// can navigate back to it. Starts null (menu item disabled).
let lastSelectedProjectPath: string | null = null;
let isOnProjectRoute = false;

function updateProjectViewMenuEnabled() {
  const menu = Menu.getApplicationMenu();
  if (!menu) return;
  const item = menu.getMenuItemById('view-project');
  if (item) {
    item.enabled = lastSelectedProjectPath !== null;
  }
}

function updateProjectGitMenuEnabled() {
  const menu = Menu.getApplicationMenu();
  if (!menu) return;
  const enabled = isOnProjectRoute && lastSelectedProjectPath !== null;
  for (const id of ['project-pull', 'project-commit', 'project-push']) {
    const item = menu.getMenuItemById(id);
    if (item) item.enabled = enabled;
  }
}

// IDs of all actionable (non-role) menu items that should be disabled on login
const actionableMenuIds = [
  'import-ableton', 'import-soundhaus', 'browse-public',
  'view-home', 'view-project',
  'project-pull', 'project-commit', 'project-push', 'view-on-soundhaus',
];

function updateMenuForRoute(route: string) {
  const menu = Menu.getApplicationMenu();
  if (!menu) return;

  if (route === '/') {
    // On login: disable all actionable items
    for (const id of actionableMenuIds) {
      const item = menu.getMenuItemById(id);
      if (item) item.enabled = false;
    }
  } else {
    // Leaving login: re-enable all actionable items, then apply specific rules
    for (const id of actionableMenuIds) {
      const item = menu.getMenuItemById(id);
      if (item) item.enabled = true;
    }
    updateProjectViewMenuEnabled();
    updateProjectGitMenuEnabled();
  }
}

const execFileP = promisify(execFile);

type SnapshotNote = {
  pitch: number;
  start_beat: number;
  duration_beats: number;
  velocity: number;
  note_id?: string | null;
};

type TrackNoteDiff = {
  trackId: string;
  trackName: string;
  added: SnapshotNote[];
  removed: SnapshotNote[];
  adjusted: Array<{ from: SnapshotNote; to: SnapshotNote }>;
};

type GroupedNoteDiff = {
  tracks: TrackNoteDiff[];
};

type CommitMeta = {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  timestamp: string;
};

function buildTextSummary(changes: any[], depth = 0): string[] {
  const lines: string[] = [];
  const indent = '  '.repeat(depth);
  for (const node of changes) {
    if (node?.type === 'Note') {
      continue;
    }
    const prefix = node.action === 'added' ? '+ ' : node.action === 'removed' ? '- ' : '~ ';
    let line = `${indent}${prefix}${node.type}: ${node.label}`;
    if (node.from && node.to && node.action === 'value_change') {
      line += ` (${node.from} -> ${node.to})`;
    }
    lines.push(line);
    if (node.children && node.children.length > 0) {
      lines.push(...buildTextSummary(node.children, depth + 1));
    }
  }
  return lines;
}

function parseNotePayload(raw: unknown): SnapshotNote | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.pitch !== 'number') return null;
    if (typeof parsed?.start_beat !== 'number') return null;
    if (typeof parsed?.duration_beats !== 'number') return null;
    return {
      pitch: parsed.pitch,
      start_beat: parsed.start_beat,
      duration_beats: parsed.duration_beats,
      velocity: typeof parsed?.velocity === 'number' ? parsed.velocity : 100,
      note_id: typeof parsed?.note_id === 'string' ? parsed.note_id : null,
    };
  } catch {
    return null;
  }
}

function extractNoteDiffFromChanges(changes: any[], trackOrder: string[] = []): GroupedNoteDiff {
  const byTrack = new Map<string, TrackNoteDiff>();
  const orderIndex = new Map<string, number>();

  trackOrder.forEach((id, index) => {
    if (typeof id === 'string' && id.length > 0) {
      orderIndex.set(id, index);
    }
  });

  const ensureTrack = (trackId: string, trackName: string) => {
    const existing = byTrack.get(trackId);
    if (existing) {
      if (!existing.trackName && trackName) {
        existing.trackName = trackName;
      }
      return existing;
    }

    const created: TrackNoteDiff = {
      trackId,
      trackName: trackName || 'Unnamed Track',
      added: [],
      removed: [],
      adjusted: [],
    };
    byTrack.set(trackId, created);
    return created;
  };

  const visit = (nodes: any[], currentTrack: TrackNoteDiff | null) => {
    for (const node of nodes || []) {
      let nextTrack = currentTrack;

      if (node?.type === 'Track') {
        const trackId = typeof node?.id === 'string' && node.id.length > 0
          ? node.id
          : `track:${typeof node?.label === 'string' ? node.label : 'unknown'}`;
        const trackName = typeof node?.label === 'string' && node.label.length > 0
          ? node.label
          : 'Unnamed Track';
        nextTrack = ensureTrack(trackId, trackName);
      } else if (node?.type === 'Note' && currentTrack) {
        if (node.action === 'added') {
          const note = parseNotePayload(node.to);
          if (note) currentTrack.added.push(note);
        } else if (node.action === 'removed') {
          const note = parseNotePayload(node.from);
          if (note) currentTrack.removed.push(note);
        } else if (node.action === 'adjusted') {
          const from = parseNotePayload(node.from);
          const to = parseNotePayload(node.to);
          if (from && to) currentTrack.adjusted.push({ from, to });
        }
      }

      if (Array.isArray(node?.children) && node.children.length > 0) {
        visit(node.children, nextTrack);
      }
    }
  };

  visit(changes || [], null);

  const tracks = Array.from(byTrack.values()).filter((track) => {
    return track.added.length + track.removed.length + track.adjusted.length > 0;
  });

  tracks.sort((a, b) => {
    const ai = orderIndex.has(a.trackId) ? orderIndex.get(a.trackId)! : Number.MAX_SAFE_INTEGER;
    const bi = orderIndex.has(b.trackId) ? orderIndex.get(b.trackId)! : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.trackName.localeCompare(b.trackName);
  });

  return { tracks };
}

/**
 * Find the first .als file in a directory, parse it, and write/overwrite
 * .soundhaus/{sessionName}/snapshot.json.  Returns the alsPath on success
 * or null when no ALS exists or the write fails (non-fatal).
 */
async function refreshSnapshot(repoPath: string): Promise<{ alsPath: string | null; error?: string }> {
  try {
    const entries = await fs.promises.readdir(repoPath, { withFileTypes: true });
    const alsFile = entries.find(e => e.isFile() && e.name.toLowerCase().endsWith('.als'));
    if (!alsFile) return { alsPath: null };

    const alsPath = path.join(repoPath, alsFile.name);
    const sessionName = path.basename(alsPath, '.als');
    const snapshotDir = path.join(repoPath, '.soundhaus', sessionName);
    await fs.promises.mkdir(snapshotDir, { recursive: true });
    const snapshotJson = await parseAls(alsPath);
    await fs.promises.writeFile(path.join(snapshotDir, 'snapshot.json'), snapshotJson, 'utf8');
    return { alsPath };
  } catch (err: any) {
    const msg = err && err.message ? err.message : String(err);
    console.warn('[refreshSnapshot] Failed:', msg);
    return { alsPath: null, error: msg };
  }
}

function createWindow() {
    mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    backgroundColor: '#18181B',
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      webSecurity: false,
      spellcheck: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else if (isPreview) {
    mainWindow.webContents.openDevTools();
    mainWindow.loadFile("dist/index.html");
  } else {
    mainWindow.loadFile("dist/index.html");
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url); // Open URL in user's browser.
    return { action: "deny" }; // Prevent the app from opening the URL.
  })

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('choose-folder', async (event: IpcMainInvokeEvent) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow();
  const repoPath = await chooseFolder(win ?? undefined);
  return repoPath;
});

ipcMain.handle('check-git', async (_event: IpcMainInvokeEvent, folderPath: string) => {
  if(typeof folderPath !== 'string') return false;
  return await hasGitFile(folderPath);
});

// DEPRECATED: find-instrument-changes handler removed.
// The Rust semantic-diff parser now handles all diffing via the 'diff-xml' IPC channel.
// structuralCompareAls() from project.ts is no longer called.

ipcMain.handle('find-als', async (_event: IpcMainInvokeEvent, folderPath) => {
  if(!folderPath) {
    return null;
  }
  try {
    const findFirstAls = async (root: string, maxDepth = 6): Promise<string | null> => {
      // Breadth-first search for the first .als under root.
      // Skips common irrelevant / huge directories.
      const skipDirs = new Set([
        '.git',
        '.soundhaus',
        'node_modules',
        '.next',
        'dist',
        'build',
        'target',
      ]);

      type QueueItem = { dir: string; depth: number };
      const queue: QueueItem[] = [{ dir: root, depth: 0 }];

      while (queue.length > 0) {
        const current = queue.shift()!;
        let entries: fs.Dirent[];
        try {
          entries = await fs.promises.readdir(current.dir, { withFileTypes: true });
        } catch {
          continue;
        }

        // Prefer files in the current folder first.
        for (const ent of entries) {
          if (ent.isFile() && ent.name.toLowerCase().endsWith('.als')) {
            return path.join(current.dir, ent.name);
          }
        }

        // Then enqueue subfolders (bounded by maxDepth).
        if (current.depth >= maxDepth) continue;
        for (const ent of entries) {
          if (!ent.isDirectory()) continue;
          if (skipDirs.has(ent.name)) continue;
          queue.push({ dir: path.join(current.dir, ent.name), depth: current.depth + 1 });
        }
      }

      return null;
    };

    return await findFirstAls(folderPath);
  }
  catch(e) {
    // Ignore errors
  }
  return null;
});

ipcMain.handle('get-als-content', async (_event: IpcMainInvokeEvent, alsPath) => {
  const projectJson = await parseAls(alsPath);
  return JSON.parse(projectJson);
});

ipcMain.handle('init-repo', async(_event: IpcMainInvokeEvent, folderPath: string, projectInfo?: any) => {
  return init(folderPath, projectInfo);
})

ipcMain.handle('show-project-setup', async (event: IpcMainInvokeEvent) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;
  return await createProjectSetupDialog(win);
});

ipcMain.handle('show-clone-url', async (event: IpcMainInvokeEvent) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;
  return await createCloneUrlDialog(win);
});

ipcMain.handle('clone-repo', async(_event: IpcMainInvokeEvent, cloneUrl: string, destinationPath: string) => {
  const allowedRemote = await getAllowedCloneRemote();
  if (!allowedRemote) {
    throw new Error('Allowed remote not configured. Please log in again.');
  }
  validateCloneUrlAgainstAllowedRemote(cloneUrl, allowedRemote);
  return await cloneRepo(cloneUrl, destinationPath);
});

ipcMain.handle('pull-repo', async(_event: IpcMainInvokeEvent, repoPath) => {
  const pullResult = await pull(repoPath);

  // Regenerate snapshot so changelog baseline matches the newly pulled ALS.
  const snap = await refreshSnapshot(repoPath);
  if (snap.error) {
    console.warn('[pull-repo] Post-pull snapshot refresh failed (non-fatal):', snap.error);
  } else if (snap.alsPath) {
    console.log('[pull-repo] Snapshot refreshed for', path.basename(snap.alsPath, '.als'));
  }

  return pullResult;
});

ipcMain.handle('commit-changes', async(_event: IpcMainInvokeEvent, repoPath) => {
  // Generate a semantic commit message from the current diff before committing
  let commitMessage: string | undefined;
  let alsPath: string | undefined;
  try {
    const findFirstAls = async (root: string, maxDepth = 6): Promise<string | null> => {
      const skipDirs = new Set([
        '.git',
        '.soundhaus',
        'node_modules',
        '.next',
        'dist',
        'build',
        'target',
      ]);
      type QueueItem = { dir: string; depth: number };
      const queue: QueueItem[] = [{ dir: root, depth: 0 }];
      while (queue.length > 0) {
        const current = queue.shift()!;
        let entries: fs.Dirent[];
        try {
          entries = await fs.promises.readdir(current.dir, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const ent of entries) {
          if (ent.isFile() && ent.name.toLowerCase().endsWith('.als')) {
            return path.join(current.dir, ent.name);
          }
        }
        if (current.depth >= maxDepth) continue;
        for (const ent of entries) {
          if (!ent.isDirectory()) continue;
          if (skipDirs.has(ent.name)) continue;
          queue.push({ dir: path.join(current.dir, ent.name), depth: current.depth + 1 });
        }
      }
      return null;
    };

    // Find the ALS file in the repo (can be nested)
    // TODO: Revamp file selection — the ALS session name is currently derived by
    // auto-discovering the first .als file in the project folder. In a future ticket,
    // the user will select a specific ALS file directly; all naming decisions
    // (e.g. .soundhaus/{als_session_name}/) will be based on that explicit selection.
    alsPath = await findFirstAls(repoPath);

    if (alsPath) {
      const alsFileName = path.basename(alsPath);

      // Check if HEAD exists — no commit message generation on first commit
      try {
        await execFileP(gitBin, ['-C', repoPath, 'rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' });

        // Diff current ALS against local snapshot (refreshed after pull/commit).
        // Falls back to HEAD copy when no working-tree file exists.
        const sessionName = path.basename(alsPath, '.als');
        const snapshotRelPath = `.soundhaus/${sessionName}/snapshot.json`;
        const snapshotAbsPath = path.join(repoPath, snapshotRelPath);
        let snapshotRaw: string;
        try {
          snapshotRaw = await fs.promises.readFile(snapshotAbsPath, 'utf8');
        } catch {
          const { stdout } = await execFileP(
            gitBin,
            ['-C', repoPath, 'show', `HEAD:${snapshotRelPath}`],
            { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
          );
          snapshotRaw = stdout;
        }
        const rawJson = await diffFromSnapshot(snapshotRaw, alsPath);
        commitMessage = await generateCommitMessage(rawJson);
      } catch (e) {
        // No HEAD yet, or no snapshot in HEAD (first commit / legacy repo)
        console.warn('[commit-changes] Falling back to initial snapshot message:', e);
        commitMessage = `Initial snapshot: ${alsFileName.replace(/\.als$/i, '')}`;
      }

      // Write snapshot before committing so git add . stages it alongside the .als file.
      const snapResult = await refreshSnapshot(repoPath);
      if (snapResult.error) {
        console.warn('[commit-changes] Snapshot refresh failed (non-fatal):', snapResult.error);
      }
    }
  } catch (e) {
    // If message generation fails, fall back to a generic but still reasonable message
    commitMessage = undefined;
  }

  return await commit(repoPath, commitMessage);
})

ipcMain.handle('push-repo', async(_event: IpcMainInvokeEvent, repoPath) => {
  const pushResult = await push(repoPath);

  // ── Best-effort diff upload after successful push ──
  try {
    // 1. Get current and parent commit SHAs
    const { stdout: headRaw } = await execFileP(gitBin, ['-C', repoPath, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
    const commitSha = headRaw.trim();

    let beforeSha: string | undefined;
    try {
      const { stdout: parentRaw } = await execFileP(gitBin, ['-C', repoPath, 'rev-parse', 'HEAD^'], { encoding: 'utf8' });
      beforeSha = parentRaw.trim();
    } catch {
      // First commit — no parent
    }

    // 2. Find ALS + compute diff
    const entries = await fs.promises.readdir(repoPath, { withFileTypes: true });
    const alsFile = entries.find(e => e.isFile() && e.name.toLowerCase().endsWith('.als'));
    if (!alsFile) throw new Error('No .als file found — skipping diff upload');

    const alsPath = path.join(repoPath, alsFile.name);
    const sessionName = path.basename(alsPath, '.als');
    const snapshotRelPath = `.soundhaus/${sessionName}/snapshot.json`;

    // Current snapshot (HEAD)
    const { stdout: currentSnapshot } = await execFileP(
      gitBin, ['-C', repoPath, 'show', `${commitSha}:${snapshotRelPath}`],
      { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
    );

    // Parent snapshot
    let parentSnapshot = '{"schema_version":1,"tracks":[]}';
    if (beforeSha) {
      try {
        const { stdout: parentRaw } = await execFileP(
          gitBin, ['-C', repoPath, 'show', `${beforeSha}:${snapshotRelPath}`],
          { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
        );
        parentSnapshot = parentRaw;
      } catch { /* first snapshot — keep empty baseline */ }
    }

    // 3. Compute diff via Rust and transform to ProjectDiff
    const rawJson = await diffSnapshots(parentSnapshot, currentSnapshot);
    const report = JSON.parse(rawJson);
    const summaryLines = buildTextSummary(report.changes || []);
    const projectDiff = changesToProjectDiff(report, summaryLines.join('\n'));

    // 4. Extract owner/repo from git remote
    const { stdout: remoteUrl } = await execFileP(gitBin, ['-C', repoPath, 'remote', 'get-url', 'origin'], { encoding: 'utf8' });
    const remoteMatch = remoteUrl.trim().match(/\/([^/]+)\/([^/.]+?)(?:\.git)?$/);
    if (!remoteMatch) throw new Error('Could not parse owner/repo from remote URL');
    const [, owner, repo] = remoteMatch;

    // 5. Upload diff to backend
    const pat = await getSoundHausCredentials();
    if (!pat) throw new Error('No SoundHaus PAT — skipping diff upload');

    const diffPayload = {
      commit_sha: commitSha,
      before_sha: beforeSha,
      diff_data: projectDiff,
      diff_summary: summaryLines.join('\n'),
      diff_type: 'semantic',
      desktop_version: app.getVersion(),
    };

    const res = await fetch(`${desktopEnv.supabasePublicUrl}/repos/${owner}/${repo}/diff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `token ${pat}`,
      },
      body: JSON.stringify(diffPayload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[push-repo] Diff upload failed (${res.status}): ${body.slice(0, 300)}`);
    } else {
      console.log(`[push-repo] Diff uploaded for ${commitSha.slice(0, 8)}`);
    }
  } catch (e: any) {
    // Diff upload is non-blocking — push already succeeded
    console.warn('[push-repo] Diff upload skipped:', e?.message || String(e));
  }

  return pushResult;
});

// TODO: Revamp file selection — the ALS session name is currently derived by auto-discovering
// the first .als file in the project folder. In a future ticket, the user will select a
// specific ALS file directly; all naming decisions (e.g. .soundhaus/{als_session_name}/)
// will be based on that explicit selection rather than auto-discovery.
ipcMain.handle('get-changes', async(_event: IpcMainInvokeEvent, alsPath: string) => {
  try {
    const startDir = path.dirname(alsPath);
    const { stdout: rootStdout } = await execFileP(gitBin, ['-C', startDir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    const repoRoot = rootStdout.trim();

    // Check if any commits exist
    try {
      await execFileP(gitBin, ['-C', repoRoot, 'rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' });
    } catch {
      // No commits yet — return a no-commits baseline built from the current file
      const projectJson = await parseAls(alsPath);
      const project = JSON.parse(projectJson);
      const legacyTracks = (project.tracks || []).map((t: any) => ({
        Type: t.track_type,
        Id: t.id,
        EffectiveName: t.effective_name,
        UserName: t.user_name || null,
      }));
      const summary = legacyTracks.map((t: any) => `New track: ${t.EffectiveName}`).join('\n');
      return { ok: true, baselineStatus: 'no-commits', summary, project: { Tracks: legacyTracks } };
    }

    // Diff current ALS against the local snapshot.json on disk (refreshed after
    // every pull and commit).  Falls back to the committed HEAD copy when no
    // working-tree file exists yet.
    const sessionName = path.basename(alsPath, '.als');
    const snapshotRelPath = `.soundhaus/${sessionName}/snapshot.json`;
    const snapshotAbsPath = path.join(repoRoot, snapshotRelPath);
    let snapshotRaw: string;
    try {
      snapshotRaw = await fs.promises.readFile(snapshotAbsPath, 'utf8');
    } catch {
      const { stdout } = await execFileP(
        gitBin,
        ['-C', repoRoot, 'show', `HEAD:${snapshotRelPath}`],
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
      );
      snapshotRaw = stdout;
    }
    const rawJson = await diffFromSnapshot(snapshotRaw, alsPath);
    const report = JSON.parse(rawJson);

    // Build a flat summary string for the Changes panel
    // TODO (Phase 5): move this formatting into Rust via generate_commit_message / format_changes_summary export
    const summaryLines = buildTextSummary(report.changes || []);

    // Map tracks to legacy field names for the Track Information panel
    const legacyTracks = (report.project?.tracks || []).map((t: any) => ({
      Type: t.track_type,
      Id: t.id,
      EffectiveName: t.effective_name,
      UserName: t.user_name || null,
    }));

    return {
      ok: true,
      summary: summaryLines.join('\n'),
      diffStatus: summaryLines.length > 0 ? 'has-changes' : 'in-sync',
      project: { Tracks: legacyTracks },
      report,
    };
  } catch (e: any) {
    console.error('[get-changes]', e);
    return { ok: false, reason: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle('get-commit-history', async (_event: IpcMainInvokeEvent, repoPath: string): Promise<CommitMeta[]> => {
  try {
    const { stdout } = await execFileP(
      gitBin,
      ['-C', repoPath, 'log', '--pretty=format:%H\x1f%h\x1f%an\x1f%aI\x1f%s', '-n', '50'],
      { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 }
    );

    return stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, shortHash, author, timestamp, subject] = line.split('\x1f');
        return {
          hash,
          shortHash,
          author,
          timestamp,
          subject,
        };
      })
      .filter((item) => item.hash && item.subject);
  } catch {
    return [];
  }
});

ipcMain.handle('get-commit-diff', async (_event: IpcMainInvokeEvent, repoPath: string, commitHash: string, alsPath: string) => {
  try {
    const sessionName = path.basename(alsPath, '.als');
    const snapshotRelPath = `.soundhaus/${sessionName}/snapshot.json`;

    const { stdout: currentSnapshot } = await execFileP(
      gitBin,
      ['-C', repoPath, 'show', `${commitHash}:${snapshotRelPath}`],
      { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
    );

    let parentSnapshot = '{}';
    try {
      const { stdout: parentCommit } = await execFileP(
        gitBin,
        ['-C', repoPath, 'rev-parse', `${commitHash}^`],
        { encoding: 'utf8' }
      );
      const parentHash = parentCommit.trim();
      const { stdout: parentRaw } = await execFileP(
        gitBin,
        ['-C', repoPath, 'show', `${parentHash}:${snapshotRelPath}`],
        { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
      );
      parentSnapshot = parentRaw;
    } catch {
      parentSnapshot = '{"schema_version":1,"tracks":[]}';
    }

    // Get the full semantic diff from Rust (including track/device/clip structure)
    const rawJson = await diffSnapshots(parentSnapshot, currentSnapshot);
    const report = JSON.parse(rawJson);
    const summaryLines = buildTextSummary(report.changes || []);

    const trackOrder = Array.isArray(report?.project?.tracks)
      ? report.project.tracks
          .map((track: any) => (typeof track?.id === 'string' ? track.id : null))
          .filter((id: string | null): id is string => id !== null)
      : [];
    const noteDiff = extractNoteDiffFromChanges(report.changes || [], trackOrder);

    return {
      ok: true,
      summary: summaryLines.length > 0 ? summaryLines.join('\n') : 'No semantic changes detected',
      noteDiff,
    };
  } catch (e: any) {
    return {
      ok: false,
      reason: e && e.message ? e.message : String(e),
    };
  }
});

ipcMain.handle('get-soundhaus-credentials', async(_event: IpcMainInvokeEvent) => {
  return await getSoundHausCredentials();
})

ipcMain.handle('set-soundhaus-credentials', async(_event: IpcMainInvokeEvent, token: string) => {
  return await setSoundHausCredentials(token);
});

ipcMain.handle('get-gitea-credentials', async(_event: IpcMainInvokeEvent) => {
  return await getGiteaCredentials();
})

ipcMain.handle('set-gitea-credentials', async(_event: IpcMainInvokeEvent, token: string) => {
  return await setGiteaCredentials(token);
});

ipcMain.handle('get-allowed-clone-remote', async(_event: IpcMainInvokeEvent) => {
  return await getAllowedCloneRemote();
})

ipcMain.handle('set-allowed-clone-remote', async(_event: IpcMainInvokeEvent, remote: string) => {
  return await setAllowedCloneRemote(remote);
});

ipcMain.handle('auto-login', async () => {
  const token = await getSoundHausCredentials();
  if (!token) return { success: false, reason: 'no-token' };

  const existingGiteaToken = await getGiteaCredentials();
  const url = `${desktopEnv.supabasePublicUrl}/api/desktop/credentials`;
  const headers: Record<string, string> = { Authorization: `token ${token}` };
  if (existingGiteaToken) headers['X-Cached-Gitea-Token'] = existingGiteaToken;

  try {
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { success: false, reason: 'invalid-token', status: res.status, body: body.slice(0, 300) };
    }
    const data = await res.json() as Record<string, any>;
    if (!existingGiteaToken || existingGiteaToken !== data.token) {
      await setGiteaCredentials(data.token);
    }
    if (data.gitea_url) await setAllowedCloneRemote(data.gitea_url);
    return { success: true };
  } catch (err) {
    return { success: false, reason: 'fetch-error', error: String(err) };
  }
});

ipcMain.handle('manual-login', async (_event: IpcMainInvokeEvent, email: string, password: string) => {
  const base = desktopEnv.supabasePublicUrl;
  try {
    const loginRes = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!loginRes.ok) {
      const body = await loginRes.text().catch(() => '');
      return { success: false, reason: 'login-failed', status: loginRes.status, body: body.slice(0, 300) };
    }
    const loginData = await loginRes.json() as Record<string, any>;
    const accessToken: string | undefined = loginData.session?.access_token;
    if (!accessToken) return { success: false, reason: 'no-access-token' };

    const patRes = await fetch(`${base}/api/auth/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ token_name: 'Gitea Token', expires_in_days: 90 }),
    });
    if (!patRes.ok) {
      const body = await patRes.text().catch(() => '');
      return { success: false, reason: 'pat-failed', status: patRes.status, body: body.slice(0, 300) };
    }
    const patData = await patRes.json() as Record<string, any>;
    const pat: string = patData.token;
    await setSoundHausCredentials(pat);

    const credRes = await fetch(`${base}/api/desktop/credentials`, {
      method: 'GET',
      headers: { Authorization: `token ${pat}` },
    });
    if (credRes.ok) {
      const credData = await credRes.json() as Record<string, any>;
      if (credData.token) await setGiteaCredentials(credData.token);
      if (credData.gitea_url) await setAllowedCloneRemote(credData.gitea_url);
    } else {
      console.warn('[manual-login] Desktop credentials fetch failed:', credRes.status);
    }

    return { success: true };
  } catch (err) {
    return { success: false, reason: 'fetch-error', error: String(err) };
  }
});

ipcMain.handle('set-last-project-path', async(_event: IpcMainInvokeEvent, projectPath: string | null) => {
  if (projectPath !== null && typeof projectPath !== 'string') return;
  lastSelectedProjectPath = projectPath;
  updateProjectViewMenuEnabled();
  updateProjectGitMenuEnabled();
});

ipcMain.handle('set-current-route', async(_event: IpcMainInvokeEvent, route: string) => {
  if (typeof route !== 'string') return;
  isOnProjectRoute = route === '/project';
  updateMenuForRoute(route);
});

ipcMain.handle('add-recent-project', async(_event: IpcMainInvokeEvent, projectPath: string, projectName: string) => {
  if (typeof projectPath !== 'string' || typeof projectName !== 'string') return;
  try {
    await recentProjectsManager.addProject(projectPath, projectName);
  } catch (error) {
    console.error('[add-recent-project] Error:', error);
    // Don't throw - this is a non-critical operation
  }
});

ipcMain.handle('get-recent-projects', async(_event: IpcMainInvokeEvent) => {
  try {
    return await recentProjectsManager.getAllProjects();
  } catch (error) {
    console.error('[get-recent-projects] Error:', error);
    return [];
  }
});

ipcMain.handle('remove-recent-project', async(_event: IpcMainInvokeEvent, projectPath: string) => {
  if (typeof projectPath !== 'string') return;
  try {
    await recentProjectsManager.removeProject(projectPath);
  } catch (error) {
    console.error('[remove-recent-project] Error:', error);
    // Don't throw - this is a non-critical operation
  }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          id: 'import-ableton',
          label: 'Import Ableton Project',
          click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu-action', 'import-ableton')
        },
        {
          id: 'import-soundhaus',
          label: 'Open SoundHaus Project',
          click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu-action', 'import-soundhaus')
        },
        {
          id: 'browse-public',
          label: 'Browse Public Projects',
          click: () => shell.openExternal('http://www.rickleinecker.com/')
        },
        { type: 'separator' },
        { label: 'Options' },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          id: 'view-home',
          label: 'Home',
          click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu-action', 'view-home')
        },
        {
          id: 'view-project',
          label: 'Project View',
          enabled: false,
          click: () => {
            if (!lastSelectedProjectPath) return;
            BrowserWindow.getFocusedWindow()?.webContents.send('menu-action', 'view-project', { projectPath: lastSelectedProjectPath });
          }
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Project',
      submenu: [
        {
          id: 'project-pull',
          label: 'Download Snapshots',
          enabled: false,
          click: () => {
            if (!lastSelectedProjectPath) return;
            BrowserWindow.getFocusedWindow()?.webContents.send('menu-action', 'project-pull', { projectPath: lastSelectedProjectPath });
          }
        },
        {
          id: 'project-commit',
          label: 'Save Snapshot',
          enabled: false,
          click: () => {
            if (!lastSelectedProjectPath) return;
            BrowserWindow.getFocusedWindow()?.webContents.send('menu-action', 'project-commit', { projectPath: lastSelectedProjectPath });
          }
        },
        {
          id: 'project-push',
          label: 'Upload Snapshots',
          enabled: false,
          click: () => {
            if (!lastSelectedProjectPath) return;
            BrowserWindow.getFocusedWindow()?.webContents.send('menu-action', 'project-push', { projectPath: lastSelectedProjectPath });
          }
        },
        { type: 'separator' },
        { 
          id: 'view-on-soundhaus',
          label: 'View On SoundHaus',
          click: () => shell.openExternal('http://www.rickleinecker.com/')
        },
        { label: 'Project Settings' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          id: 'help-search',
          label: 'Search',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => {
            BrowserWindow.getFocusedWindow()?.webContents.send('menu-action', 'open-search-palette');
          }
        },
        {
          id: 'help-about',
          label: 'About',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) createAboutDialog(win);
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  updateProjectGitMenuEnabled();

  // Build the searchable menu index on demand (reflects current enabled state)
  ipcMain.handle('search-menu-get-entries', () => {
    return buildSearchableIndex(template, (action) => {
      if (['project-pull', 'project-commit', 'project-push', 'view-project'].includes(action) && lastSelectedProjectPath) {
        return { projectPath: lastSelectedProjectPath };
      }
      if (['browse-public', 'view-on-soundhaus'].includes(action)) {
        return { url: 'http://www.rickleinecker.com/' };
      }
      return undefined;
    }).filter(e => e.action !== 'help-search'); // Exclude search itself (circular)
  });

  // Allow the renderer to open external URLs (for search palette results)
  ipcMain.handle('open-external', (_event: IpcMainInvokeEvent, url: string) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      shell.openExternal(url);
    }
  });

  app.on("activate", () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
