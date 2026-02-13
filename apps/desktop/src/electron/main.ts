import { app, BrowserWindow, shell, ipcMain, Menu } from "electron";
import type { IpcMainInvokeEvent, MenuItemConstructorOptions } from 'electron';
import { chooseFolder, hasGitFile, init } from './home'
import { getSoundHausCredentials, setSoundHausCredentials, getGiteaCredentials, setGiteaCredentials } from "./login"; 
import { decompressAls, getAlsFromGitHead, structuralCompareAls, getAlsContent, pull, commit, push } from "./project";
import { createProjectSetupDialog } from './dialogs/projectSetupDialog';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from "path";
import { diffXml } from '@napi-rs/parser'; 

const isDev = process.env.DEV != undefined;
const isPreview = process.env.PREVIEW != undefined;

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

ipcMain.handle('find-instrument-changes', async (_event: IpcMainInvokeEvent, alsPath) => {
  try {
    const local = await decompressAls(alsPath);
    const startDir = path.dirname(alsPath);

    const { stdout } = await execFileP('git', ['-C', startDir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    const repoRoot = stdout.trim();
    const relPath = path.relative(repoRoot, alsPath);
    const head = await getAlsFromGitHead(repoRoot, relPath);
    const struct = structuralCompareAls(local.text, head.text, { allowTrackNameFallback: false });
    return struct;
  }
  catch(e: any) {
    return { ok: false, reason: e && e.message ? e.message : String(e) };
  }
});

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
  return await getAlsContent(alsPath);
});

ipcMain.handle('init-repo', async(_event: IpcMainInvokeEvent, folderPath: string, projectInfo?: any) => {
  return init(folderPath, projectInfo);
})

ipcMain.handle('show-project-setup', async (event: IpcMainInvokeEvent) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;
  return await createProjectSetupDialog(win);
});

ipcMain.handle('pull-repo', async(_event: IpcMainInvokeEvent, repoPath) => {
  return await pull(repoPath);
});

ipcMain.handle('commit-changes', async(_event: IpcMainInvokeEvent, repoPath) => {
  return await commit(repoPath);
})

ipcMain.handle('push-repo', async(_event: IpcMainInvokeEvent, repoPath) => {
  return await push(repoPath);
});

ipcMain.handle('diff-xml', async(_event: IpcMainInvokeEvent, curAlsPath: string, oldAlsPath: string) => {
  try {
    return await diffXml(curAlsPath, oldAlsPath);
  } catch (e: any) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
});

ipcMain.handle('get-remote-head-als', async(_event: IpcMainInvokeEvent, alsPath: string) => {
  try {
    const startDir = path.dirname(alsPath);
    const { stdout } = await execFileP('git', ['-C', startDir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    const repoRoot = stdout.trim();
    const relPath = path.relative(repoRoot, alsPath);
    
    // Get the remote HEAD version
    const head = await getAlsFromGitHead(repoRoot, relPath);
    
    // Save to a temporary file
    const tmpPath = path.join(path.dirname(alsPath), `.${path.basename(alsPath)}.remote-head.tmp`);
    await fs.promises.writeFile(tmpPath, head.buffer);
    
    return { ok: true, tmpPath };
  } catch (e: any) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
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
        { label: 'New SoundHaus Project' },
        { type: 'separator' },
        { label: 'Import Ableton Project' },
        { label: 'Browse Public Projects' },
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
        { type: 'separator' },
        { label: 'Find' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Project List' },
        { label: 'Branches List' },
        { type: 'separator' },
        { label: 'Go To Summary' },
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
        { label: 'Push' },
        { label: 'Pull' },
        { type: 'separator' },
        { label: 'View On SoundHaus'},
        { label: 'Project Settings' }
      ]
    },
    {
      label: 'Branch',
      submenu: [
        { label: 'TODO' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Search' },
        { label: 'About' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

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
