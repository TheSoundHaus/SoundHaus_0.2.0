import { app, BrowserWindow, shell, ipcMain, Menu, screen } from "electron";
import type { IpcMainInvokeEvent, MenuItemConstructorOptions } from 'electron';
import { updateElectronApp } from 'update-electron-app';
import { desktopEnv } from './env';

updateElectronApp({ repo: 'TheSoundHaus/SoundHaus_0.2.0' });
import { chooseFolder, hasGitFile, init, cloneRepo, validateCloneUrlAgainstAllowedRemote } from './home'
import { getSoundHausCredentials, setSoundHausCredentials, getGiteaCredentials, setGiteaCredentials, getAllowedCloneRemote, setAllowedCloneRemote } from "./login"; 
import { exec as gitExec } from 'dugite';
import { pull, commit, push } from "./project";
import { createProjectSetupDialog } from './dialogs/projectSetupDialog';
import { createCloneUrlDialog } from './dialogs/cloneUrlDialog';
import { createAboutDialog } from './dialogs/aboutDialog';
import { buildSearchableIndex } from './menuIndexer';
import { recentProjectsManager } from './recentProjectsManager';
import * as fs from 'fs';
import * as path from "path";
import { parseAls, parseXmlFromBuffer, diffFromSnapshot, diffSnapshots, generateCommitMessage } from 'semantic-differ'
import { changesToProjectDiff } from './diffTransformer'

const execFileP = promisify(execFile);

// Resolve the git binary path (bundled vendor or system fallback)
const platformMap: Partial<Record<NodeJS.Platform, string>> = { win32: 'windows', darwin: 'macos', linux: 'linux' };
const platformDir = platformMap[process.platform] || process.platform;
let gitBin = process.env.SOUNDHAUS_GIT_BIN || path.join(__dirname, '..', 'vendor', 'git', platformDir, process.platform === 'win32' ? 'git.exe' : 'git');
try {
  if (gitBin !== 'git' && !fs.existsSync(gitBin)) {
    console.warn('Configured git binary not found at', gitBin, '— falling back to system `git` in PATH');
    gitBin = 'git';
  }
} catch { gitBin = 'git'; }

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
  unchanged?: SnapshotNote[];
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

function isLikelyLegacySnapshotWithoutMidi(snapshotRaw: string): boolean {
  try {
    const parsed = JSON.parse(snapshotRaw);
    const tracks = Array.isArray(parsed?.tracks) ? parsed.tracks : [];
    let sawAnyClip = false;
    let sawMidiNotesField = false;

    for (const track of tracks) {
      const clips = Array.isArray(track?.clips) ? track.clips : [];
      for (const clip of clips) {
        sawAnyClip = true;
        if (clip && typeof clip === 'object' && Object.prototype.hasOwnProperty.call(clip, 'midi_notes')) {
          sawMidiNotesField = true;
          const notes = (clip as any).midi_notes;
          if (Array.isArray(notes) && notes.length > 0) {
            return false;
          }
        }
      }
    }

    return sawAnyClip && !sawMidiNotesField;
  } catch {
    return false;
  }
}

async function gitObjectExists(repoPath: string, objectSpec: string): Promise<boolean> {
  const result = await gitExec(['cat-file', '-e', objectSpec], repoPath);
  return result.exitCode === 0;
}

async function resolveAlsPathInRevision(
  repoPath: string,
  revision: string,
  preferredAlsPathAbs?: string,
): Promise<string | null> {
  const preferredRel = preferredAlsPathAbs
    ? path.relative(repoPath, preferredAlsPathAbs).split(path.sep).join('/')
    : null;

  if (preferredRel && preferredRel.length > 0 && !preferredRel.startsWith('..')) {
    const exists = await gitObjectExists(repoPath, `${revision}:${preferredRel}`);
    if (exists) return preferredRel;
  }

  const listResult = await gitExec(
    ['ls-tree', '-r', '--name-only', revision],
    repoPath,
    { maxBuffer: 20 * 1024 * 1024 },
  );

  if (listResult.exitCode !== 0) {
    throw new Error(listResult.stderr || `git ls-tree failed for ${revision}`);
  }

  const stdout = listResult.stdout;

  const alsFiles = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.toLowerCase().endsWith('.als'));

  if (alsFiles.length === 0) return null;
  if (alsFiles.length === 1) return alsFiles[0];

  if (preferredRel) {
    const preferredBase = path.basename(preferredRel).toLowerCase();
    const basenameMatch = alsFiles.find((candidate) => path.basename(candidate).toLowerCase() === preferredBase);
    if (basenameMatch) return basenameMatch;
  }

  return alsFiles[0];
}

async function getGitBlobBuffer(repoPath: string, revision: string, relPath: string): Promise<Buffer> {
  const showResult = await gitExec(
    ['show', `${revision}:${relPath}`],
    repoPath,
    { encoding: 'buffer', maxBuffer: 100 * 1024 * 1024 },
  );

  if (showResult.exitCode !== 0) {
    const stderr = Buffer.isBuffer(showResult.stderr)
      ? showResult.stderr.toString('utf8')
      : showResult.stderr;
    throw new Error(stderr || `git show failed for ${revision}:${relPath}`);
  }

  return Buffer.isBuffer(showResult.stdout)
    ? showResult.stdout
    : Buffer.from(showResult.stdout as string, 'utf8');
}

async function diffCurrentAlsAgainstRevision(
  repoPath: string,
  revision: string,
  alsPath: string,
): Promise<string | null> {
  const relAlsPath = await resolveAlsPathInRevision(repoPath, revision, alsPath);
  if (!relAlsPath) return null;

  const [currentAlsBuffer, oldAlsBuffer] = await Promise.all([
    fs.promises.readFile(alsPath),
    getGitBlobBuffer(repoPath, revision, relAlsPath),
  ]);

  return await parseXmlFromBuffer(currentAlsBuffer, oldAlsBuffer);
}

async function diffSnapshotsFromAlsBlobs(
  repoPath: string,
  oldRevision: string,
  newRevision: string,
  preferredAlsPathAbs: string,
): Promise<string | null> {
  const oldRel = await resolveAlsPathInRevision(repoPath, oldRevision, preferredAlsPathAbs);
  if (!oldRel) return null;

  let newRel = await resolveAlsPathInRevision(repoPath, newRevision, preferredAlsPathAbs);
  if (!newRel) newRel = oldRel;

  const [oldBuf, newBuf] = await Promise.all([
    getGitBlobBuffer(repoPath, oldRevision, oldRel),
    getGitBlobBuffer(repoPath, newRevision, newRel),
  ]);

  return await parseXmlFromBuffer(newBuf, oldBuf);
}

/**
 * After a successful pull (fetch + rebase), restore the committed snapshot.json
 * so the working tree stays clean.  Without this, refreshSnapshot would re-parse
 * the (possibly dirty) ALS and leave an uncommitted snapshot.json that causes
 * autostash conflicts on the next pull.
 */
async function restoreSnapshotFromHead(repoPath: string): Promise<void> {
  try {
    const entries = await fs.promises.readdir(repoPath, { withFileTypes: true });
    const alsFile = entries.find(e => e.isFile() && e.name.toLowerCase().endsWith('.als'));
    if (!alsFile) return;

    const sessionName = path.basename(alsFile.name, '.als');
    const snapshotRelPath = `.soundhaus/${sessionName}/snapshot.json`;

    const checkoutResult = await gitExec(['checkout', 'HEAD', '--', snapshotRelPath], repoPath);
    if (checkoutResult.exitCode !== 0) {
      throw new Error(checkoutResult.stderr || checkoutResult.stdout || 'git checkout failed');
    }
    console.log('[restoreSnapshotFromHead] Restored', snapshotRelPath, 'from HEAD');
  } catch {
    // No HEAD or snapshot not tracked yet (first clone / legacy repo) — fall back
    // to generating one from the current ALS so downstream code has a baseline.
    const snap = await refreshSnapshot(repoPath);
    if (snap.error) {
      console.warn('[restoreSnapshotFromHead] Fallback refreshSnapshot also failed:', snap.error);
    }
  }
}

function createWindow() {
    const display = screen.getPrimaryDisplay();
    const { width: waW, height: waH } = display.workAreaSize;
    const { x: waX, y: waY } = display.workArea;
    const winW = Math.max(960, Math.round(waW * 0.92));
    const winH = Math.max(640, Math.round(waH * 0.92));
    const winX = waX + Math.round((waW - winW) / 2);
    const winY = waY + Math.round((waH - winH) / 2);

    mainWindow = new BrowserWindow({
    width: winW,
    height: winH,
    x: winX,
    y: winY,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    //mainWindow.webContents.openDevTools();
  } else if (isPreview) {
    //mainWindow.webContents.openDevTools();
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
    const entries = await fs.promises.readdir(folderPath, { withFileTypes:  true });
    for(const ent of entries) {
      if(ent.isFile() && ent.name.toLowerCase().endsWith('.als')) {
        return path.join(folderPath, ent.name);
      }
    }
  }
  catch(e) {
    // Ignore errors
  }
  return null;
});

ipcMain.handle('open-als-file', async (_event: IpcMainInvokeEvent, folderPath: string) => {
  if (!folderPath) {
    return { ok: false, error: 'No project path provided' };
  }
  try {
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isFile() && ent.name.toLowerCase().endsWith('.als')) {
        const alsPath = path.join(folderPath, ent.name);
        await shell.openPath(alsPath);
        return { ok: true };
      }
    }
    return { ok: false, error: 'No .als file found in this project' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to open file' };
  }
});

ipcMain.handle('get-als-content', async (_event: IpcMainInvokeEvent, alsPath) => {
  const projectJson = await parseAls(alsPath);
  return JSON.parse(projectJson);
});

ipcMain.handle('init-repo', async(_event: IpcMainInvokeEvent, folderPath: string, projectInfo?: any) => {
  const remoteUrl = await init(folderPath, projectInfo);

  // Create initial snapshot + commit so HEAD exists immediately.
  // Without this, commit-changes fails the HEAD check and get-commit-diff
  // cannot find a parent snapshot, causing deserialization errors.
  try {
    const snap = await refreshSnapshot(folderPath);
    if (snap.alsPath) {
      await gitExec(['add', '.'], folderPath);
      const sessionName = path.basename(snap.alsPath, '.als');
      await gitExec(['commit', '-m', `Initial snapshot: ${sessionName}`], folderPath);
      console.log('[init-repo] Initial commit created for', sessionName);
    } else {
      // No ALS file yet — create an empty initial commit so HEAD exists
      await gitExec(['commit', '--allow-empty', '-m', 'Initialize repository'], folderPath);
      console.log('[init-repo] Empty initial commit created (no ALS found)');
    }
  } catch (e: any) {
    console.warn('[init-repo] Initial commit failed (non-fatal):', e?.message || String(e));
  }

  return remoteUrl;
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
  try {
    return await pull(repoPath);
  } finally {
    // Restore the committed snapshot so the working tree stays clean.
    // refreshSnapshot would re-parse the (possibly dirty) ALS and leave an
    // uncommitted snapshot.json that causes pull/rebase churn on the next pull.
    await restoreSnapshotFromHead(repoPath);
  }
});

ipcMain.handle('commit-changes', async(_event: IpcMainInvokeEvent, repoPath) => {
  // Generate a semantic commit message from the current diff before committing
  let commitMessage: string | undefined;
  let alsPath: string | undefined;
  try {
    // Find the ALS file in the repo
    // TODO: Revamp file selection — the ALS session name is currently derived by
    // auto-discovering the first .als file in the project folder. In a future ticket,
    // the user will select a specific ALS file directly; all naming decisions
    // (e.g. .soundhaus/{als_session_name}/) will be based on that explicit selection.
    const entries = await fs.promises.readdir(repoPath, { withFileTypes: true });
    const alsFile = entries.find(e => e.isFile() && e.name.toLowerCase().endsWith('.als'));

    if (alsFile) {
      alsPath = path.join(repoPath, alsFile.name);

      // Check if HEAD exists — no commit message generation on first commit
      try {
        const headCheck = await gitExec(['rev-parse', '--verify', 'HEAD'], repoPath);
        if (headCheck.exitCode !== 0) throw new Error('No HEAD');

        // Diff current ALS against local snapshot (refreshed after pull/commit).
        // Falls back to HEAD copy when no working-tree file exists.
        const sessionName = path.basename(alsPath, '.als');
        const snapshotRelPath = `.soundhaus/${sessionName}/snapshot.json`;
        const snapshotAbsPath = path.join(repoPath, snapshotRelPath);
        let snapshotRaw: string;
        try {
          snapshotRaw = await fs.promises.readFile(snapshotAbsPath, 'utf8');
        } catch {
          const showResult = await gitExec(
            ['show', `HEAD:${snapshotRelPath}`],
            repoPath,
            { maxBuffer: 50 * 1024 * 1024 }
          );
          snapshotRaw = showResult.stdout;
        }
        let rawJson: string | null = null;

        if (isLikelyLegacySnapshotWithoutMidi(snapshotRaw)) {
          console.log('[commit-changes] Detected legacy snapshot baseline; using HEAD ALS blob fallback diff');
          rawJson = await diffCurrentAlsAgainstRevision(repoPath, 'HEAD', alsPath);
        }

        if (!rawJson) {
          rawJson = await diffFromSnapshot(snapshotRaw, alsPath);
        }

        commitMessage = await generateCommitMessage(rawJson);
      } catch (e) {
        // No HEAD yet, or no snapshot in HEAD (first commit / legacy repo)
        console.warn('[commit-changes] Falling back to initial snapshot message:', e);
        commitMessage = `Initial snapshot: ${alsFile.name.replace(/\.als$/i, '')}`;
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
    const { stdout: headRaw } = await gitExec(['rev-parse', 'HEAD'], repoPath);
    const commitSha = headRaw.trim();

    let beforeSha: string | undefined;
    try {
      const { stdout: parentRaw } = await gitExec(['rev-parse', 'HEAD^'], repoPath);
      beforeSha = parentRaw.trim();
    } catch { /* first commit — no parent */ }

    // Find ALS file
    const entries = await fs.promises.readdir(repoPath, { withFileTypes: true });
    const alsFile = entries.find(e => e.isFile() && e.name.toLowerCase().endsWith('.als'));
    if (!alsFile) throw new Error('No .als file found — skipping diff upload');
    const alsPath = path.join(repoPath, alsFile.name);
    const sessionName = path.basename(alsPath, '.als');
    const snapshotRelPath = `.soundhaus/${sessionName}/snapshot.json`;

    // Get parent snapshot (before state)
    let parentSnapshot = '{"schema_version":1,"tracks":[]}';
    if (beforeSha) {
      try {
        const { stdout: parentSnap } = await gitExec(
          ['show', `${beforeSha}:${snapshotRelPath}`],
          repoPath,
          { maxBuffer: 20 * 1024 * 1024 }
        );
        parentSnapshot = parentSnap;
      } catch { /* first snapshot */ }
    }

    // Diff parent snapshot vs current ALS file
    const rawJson = await diffFromSnapshot(parentSnapshot, alsPath);
    const report = JSON.parse(rawJson);

    // Build summary lines
    const summaryLines: string[] = [];
    for (const change of (report.changes || [])) {
      const prefix = change.action === 'added' ? '+ ' : change.action === 'removed' ? '- ' : '~ ';
      let line = `${prefix}${change.type}: ${change.label}`;
      if (change.from && change.to) line += ` (${change.from} \u2192 ${change.to})`;
      summaryLines.push(line);
    }
    const projectDiff = changesToProjectDiff(report, summaryLines.join('\n'));

    // Inject unchanged notes from the snapshot into the projectDiff so
    // the web piano roll can render the full track context.
    try {
      const snapshotPath = path.join(repoPath, '.soundhaus', sessionName, 'snapshot.json');
      const snapRaw = await fs.promises.readFile(snapshotPath, 'utf8');
      const snapshot = JSON.parse(snapRaw);
      if (Array.isArray(snapshot?.tracks)) {
        for (const diffTrack of projectDiff.tracks) {
          const snapTrack = snapshot.tracks.find((st: any) => st.id === diffTrack.trackId);
          if (!snapTrack?.clips?.length || !diffTrack.midiClips?.length) continue;
          const clip = diffTrack.midiClips[0];

          // Build signature set from changed notes (camelCase keys for ProjectDiff format)
          const changedSet = new Set<string>();
          for (const n of clip.addedNotes) {
            changedSet.add(`${n.pitch}:${n.startBeat}:${n.durationBeats}:${n.velocity}`);
          }
          for (const m of clip.modifiedNotes) {
            changedSet.add(`${m.after.pitch}:${m.after.startBeat}:${m.after.durationBeats}:${m.after.velocity}`);
          }

          // Collect unchanged = snapshot notes NOT in added/modified (convert snake_case → camelCase)
          const unchanged: { pitch: number; startBeat: number; durationBeats: number; velocity: number }[] = [];
          for (const snapClip of snapTrack.clips) {
            if (!Array.isArray(snapClip.midi_notes)) continue;
            for (const n of snapClip.midi_notes) {
              const vel = typeof n.velocity === 'number' ? n.velocity : 100;
              const sig = `${n.pitch}:${n.start_beat}:${n.duration_beats}:${vel}`;
              if (!changedSet.has(sig)) {
                unchanged.push({
                  pitch: n.pitch,
                  startBeat: n.start_beat,
                  durationBeats: n.duration_beats,
                  velocity: vel,
                });
              }
            }
          }

          if (unchanged.length > 0) {
            clip.unchangedNotes = unchanged;
            for (const n of unchanged) {
              clip.endBeat = Math.max(clip.endBeat, n.startBeat + n.durationBeats);
            }
          }
        }
      }
    } catch (unchErr: any) {
      console.warn('[push-repo] Failed to inject unchanged notes (non-fatal):', unchErr?.message || String(unchErr));
    }

    // Get owner/repo from git remote
    const remoteResult = await gitExec(['remote', 'get-url', 'origin'], repoPath);
    const remoteUrl = remoteResult.stdout.trim();
    const remoteMatch = remoteUrl.match(/\/([^/]+)\/([^/.]+?)(?:\.git)?$/);
    if (!remoteMatch) throw new Error('Could not parse owner/repo from remote URL');
    const [, owner, repo] = remoteMatch;

    const pat = await getSoundHausCredentials();
    if (!pat) throw new Error('No SoundHaus PAT — skipping diff upload');

    // Auto-register repo in SoundHaus DB (idempotent — handles repos created before registration was fixed)
    try {
      const regRes = await fetch(`${desktopEnv.supabasePublicUrl}/repos/register`, {
        method: 'POST',
        headers: { 'Authorization': `token ${pat}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: repo, description: '', private: false }),
      });
      const regBody = await regRes.text().catch(() => '');
      console.log(`[push-repo] Register response (${regRes.status}): ${regBody.slice(0, 200)}`);
    } catch (regErr: any) {
      console.warn('[push-repo] Register request failed (non-fatal):', regErr?.message || String(regErr));
    }

    // Upload diff
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
      headers: { 'Content-Type': 'application/json', Authorization: `token ${pat}` },
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
    const rootResult = await gitExec(['rev-parse', '--show-toplevel'], startDir);
    const repoRoot = rootResult.stdout.trim();

    // Check if any commits exist
    try {
      const headResult = await gitExec(['rev-parse', '--verify', 'HEAD'], repoRoot);
      if (headResult.exitCode !== 0) throw new Error('No HEAD');
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
      const showResult = await gitExec(
        ['show', `HEAD:${snapshotRelPath}`],
        repoRoot,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      snapshotRaw = showResult.stdout;
    }
    let rawJson: string | null = null;

    if (isLikelyLegacySnapshotWithoutMidi(snapshotRaw)) {
      console.log('[get-changes] Detected legacy snapshot baseline; using HEAD ALS blob fallback diff');
      rawJson = await diffCurrentAlsAgainstRevision(repoRoot, 'HEAD', alsPath);
    }

    if (!rawJson) {
      rawJson = await diffFromSnapshot(snapshotRaw, alsPath);
    }

    const report = JSON.parse(rawJson);

    // Build a flat summary string for the Changes panel
    // TODO (Phase 5): move this formatting into Rust via generate_commit_message / format_changes_summary export
    const summaryLines: string[] = [];
    for (const change of (report.changes || [])) {
      const prefix = change.action === 'added' ? '+ ' : change.action === 'removed' ? '- ' : '~ ';
      let line = `${prefix}${change.type}: ${change.label}`;
      if (change.from && change.to) line += ` (${change.from} \u2192 ${change.to})`;
      summaryLines.push(line);

      for (const child of (change.children || [])) {
        let childLine = `  ${child.action}: ${child.type} - ${child.label}`;
        if (child.from && child.to) childLine += ` (${child.from} \u2192 ${child.to})`;
        summaryLines.push(childLine);
      }
    }

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
    const logResult = await gitExec(
      ['log', '--pretty=format:%H\x1f%h\x1f%an\x1f%aI\x1f%s', '-n', '50'],
      repoPath,
      { maxBuffer: 5 * 1024 * 1024 }
    );

    if (logResult.exitCode !== 0) {
      return [];
    }

    const stdout = logResult.stdout;

    return stdout
      .split('\n')
      .filter(Boolean)
      .map((line: string) => {
        const [hash, shortHash, author, timestamp, subject] = line.split('\x1f');
        return {
          hash,
          shortHash,
          author,
          timestamp,
          subject,
        };
      })
      .filter((item: CommitMeta) => item.hash && item.subject);
  } catch {
    return [];
  }
});

ipcMain.handle('get-commit-diff', async (_event: IpcMainInvokeEvent, repoPath: string, commitHash: string, alsPath: string) => {
  try {
    const sessionName = path.basename(alsPath, '.als');
    const snapshotRelPath = `.soundhaus/${sessionName}/snapshot.json`;

    const currentSnapshotResult = await gitExec(
      ['show', `${commitHash}:${snapshotRelPath}`],
      repoPath,
      { maxBuffer: 20 * 1024 * 1024 }
    );
    if (currentSnapshotResult.exitCode !== 0) {
      throw new Error(currentSnapshotResult.stderr || `Unable to read snapshot for commit ${commitHash}`);
    }
    const currentSnapshot = currentSnapshotResult.stdout;

    let parentSnapshot = '{}';
    let parentHash: string | null = null;
    try {
      const parentCommitResult = await gitExec(['rev-parse', `${commitHash}^`], repoPath);
      if (parentCommitResult.exitCode !== 0) {
        throw new Error(parentCommitResult.stderr || 'No parent commit');
      }
      parentHash = parentCommitResult.stdout.trim();
      const parentSnapshotResult = await gitExec(
        ['show', `${parentHash}:${snapshotRelPath}`],
        repoPath,
        { maxBuffer: 20 * 1024 * 1024 }
      );
      if (parentSnapshotResult.exitCode !== 0) {
        throw new Error(parentSnapshotResult.stderr || 'Parent snapshot missing');
      }
      parentSnapshot = parentSnapshotResult.stdout;
    } catch {
      parentSnapshot = '{"schema_version":1,"tracks":[]}';
    }

    // Get the full semantic diff from Rust (including track/device/clip structure)
    let rawJson: string | null = null;

    if (parentHash && (isLikelyLegacySnapshotWithoutMidi(parentSnapshot) || isLikelyLegacySnapshotWithoutMidi(currentSnapshot))) {
      console.log('[get-commit-diff] Detected legacy snapshot(s); using commit ALS blob fallback diff');
      rawJson = await diffSnapshotsFromAlsBlobs(repoPath, parentHash, commitHash, alsPath);
    }

    if (!rawJson) {
      rawJson = await diffSnapshots(parentSnapshot, currentSnapshot);
    }

    const report = JSON.parse(rawJson);
    const summaryLines = buildTextSummary(report.changes || []);

    const trackOrder = Array.isArray(report?.project?.tracks)
      ? report.project.tracks
          .map((track: any) => (typeof track?.id === 'string' ? track.id : null))
          .filter((id: string | null): id is string => id !== null)
      : [];
    const noteDiff = extractNoteDiffFromChanges(report.changes || [], trackOrder);

    // Inject unchanged notes from the current snapshot so the piano roll
    // can render the full track context (not just the diff).
    try {
      const currentSnapshotObj = JSON.parse(currentSnapshot);
      if (Array.isArray(currentSnapshotObj?.tracks)) {
        for (const trackDiff of noteDiff.tracks) {
          const snapTrack = currentSnapshotObj.tracks.find((st: any) => st.id === trackDiff.trackId);
          if (!snapTrack || !Array.isArray(snapTrack.clips)) continue;

          // Build a signature set from changed notes (added + adjusted-to)
          const changedSet = new Set<string>();
          for (const n of trackDiff.added) {
            changedSet.add(`${n.pitch}:${n.start_beat}:${n.duration_beats}:${n.velocity}`);
          }
          for (const pair of trackDiff.adjusted) {
            changedSet.add(`${pair.to.pitch}:${pair.to.start_beat}:${pair.to.duration_beats}:${pair.to.velocity}`);
          }

          // Collect unchanged = snapshot notes NOT in the changed set
          const unchanged: SnapshotNote[] = [];
          for (const snapClip of snapTrack.clips) {
            if (!Array.isArray(snapClip.midi_notes)) continue;
            for (const n of snapClip.midi_notes) {
              const vel = typeof n.velocity === 'number' ? n.velocity : 100;
              const sig = `${n.pitch}:${n.start_beat}:${n.duration_beats}:${vel}`;
              if (!changedSet.has(sig)) {
                unchanged.push({
                  pitch: n.pitch,
                  start_beat: n.start_beat,
                  duration_beats: n.duration_beats,
                  velocity: vel,
                  note_id: typeof n.note_id === 'string' ? n.note_id : null,
                });
              }
            }
          }

          if (unchanged.length > 0) {
            trackDiff.unchanged = unchanged;
          }
        }
      }
    } catch (unchErr: any) {
      console.warn('[get-commit-diff] Failed to inject unchanged notes (non-fatal):', unchErr?.message || String(unchErr));
    }

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
          click: () => shell.openExternal('https://www.thesound.haus/')
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
          click: () => shell.openExternal('https://www.thesound.haus/')
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
        return { url: 'https://www.thesound.haus/' };
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
