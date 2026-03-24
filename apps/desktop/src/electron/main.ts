import { app, BrowserWindow, shell, ipcMain, Menu } from "electron";
import type { IpcMainInvokeEvent, MenuItemConstructorOptions } from 'electron';
import './env';
import { chooseFolder, hasGitFile, init, cloneRepo, validateCloneUrlAgainstAllowedRemote } from './home'
import { getSoundHausCredentials, setSoundHausCredentials, getGiteaCredentials, setGiteaCredentials, getAllowedCloneRemote, setAllowedCloneRemote } from "./login"; 
import { gitBin, pull, commit, push } from "./project";
import { createProjectSetupDialog } from './dialogs/projectSetupDialog';
import { createCloneUrlDialog } from './dialogs/cloneUrlDialog';
import { createAboutDialog } from './dialogs/aboutDialog';
import { buildSearchableIndex } from './menuIndexer';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from "path";
import { parseXmlFromBuffer, parseAls, diffFromSnapshot, generateCommitMessage } from '../../native/semantic-diff/index.js'

const isDev = process.env.DEV != undefined;
const isPreview = process.env.PREVIEW != undefined;

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

function createWindow() {
    const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
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
  return await pull(repoPath);
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
        await execFileP(gitBin, ['-C', repoPath, 'rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' });

        // Read HEAD bytes and current ALS bytes entirely in-memory — no temp files
        const relPath = path.relative(repoPath, alsPath);
        const { stdout: headRaw } = (await execFileP(gitBin, ['-C', repoPath, 'show', `HEAD:${relPath}`], { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 })) as any;
        const headBuf = Buffer.from(headRaw);
        const currentBuf = await fs.promises.readFile(alsPath);

        const rawJson = await parseXmlFromBuffer(currentBuf, headBuf);
        commitMessage = await generateCommitMessage(rawJson);
      } catch {
        // No HEAD yet — first commit
        commitMessage = `Initial snapshot: ${alsFile.name.replace(/\.als$/i, '')}`;
      }

      // Write the Minimal Project Description snapshot before committing so
      // git add . stages it alongside the .als file.
      // Path: .soundhaus/{als_session_name}/snapshot.json
      try {
        const sessionName = path.basename(alsPath, '.als');
        const snapshotDir = path.join(repoPath, '.soundhaus', sessionName);
        await fs.promises.mkdir(snapshotDir, { recursive: true });
        const snapshotJson = await parseAls(alsPath);
        await fs.promises.writeFile(path.join(snapshotDir, 'snapshot.json'), snapshotJson, 'utf8');
      } catch (snapshotErr) {
        // Non-fatal — commit proceeds without the snapshot if something goes wrong
        console.warn('[commit-changes] Failed to write snapshot:', snapshotErr);
      }
    }
  } catch (e) {
    // If message generation fails, fall back to a generic but still reasonable message
    commitMessage = undefined;
  }

  return await commit(repoPath, commitMessage);
})

ipcMain.handle('push-repo', async(_event: IpcMainInvokeEvent, repoPath) => {
  return await push(repoPath);
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
    const relPath = path.relative(repoRoot, alsPath);

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

    // Fast path: if the previous commit already contains a snapshot.json, use it
    // to skip re-parsing the HEAD ALS blob entirely.
    const sessionName = path.basename(alsPath, '.als');
    const snapshotRelPath = `.soundhaus/${sessionName}/snapshot.json`;
    let rawJson: string;
    try {
      const { stdout: snapshotRaw } = (await execFileP(gitBin, ['-C', repoRoot, 'show', `HEAD:${snapshotRelPath}`], { encoding: 'utf8' })) as any;
      // Snapshot found in HEAD — diff from JSON, no ALS parsing needed
      rawJson = await diffFromSnapshot(snapshotRaw, alsPath);
    } catch {
      // No snapshot in HEAD (first commit or pre-Phase-2 history) — full buffer diff
      const { stdout: headRaw } = (await execFileP(gitBin, ['-C', repoRoot, 'show', `HEAD:${relPath}`], { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 })) as any;
      const headBuf = Buffer.from(headRaw);
      const currentBuf = await fs.promises.readFile(alsPath);
      rawJson = await parseXmlFromBuffer(currentBuf, headBuf);
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
          label: 'Import SoundHaus Project',
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
