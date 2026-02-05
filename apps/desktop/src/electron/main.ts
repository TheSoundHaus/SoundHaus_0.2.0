import { app, BrowserWindow, shell, ipcMain } from "electron";
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { chooseFolder, hasGitFile, init } from './home'
import { getSoundHausCredentials, setSoundHausCredentials, getGiteaCredentials, setGiteaCredentials } from "./login"; 
import { decompressAls, getAlsFromGitHead, structuralCompareAls, getAlsContent, pull, commit, push } from "./project";
import { createProjectSetupDialog } from './dialogs/projectSetupDialog';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from "path";

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
