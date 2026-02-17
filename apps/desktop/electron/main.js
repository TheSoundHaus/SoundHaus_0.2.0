import { app, BrowserWindow, ipcMain, dialog, Menu, screen, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { chooseFolder, cloneRepo, getStatus, pull, push } from './gitCommands.js';
import { chooseFile, getAlsContent } from './alsViewer.js';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;

function createWindow() {
  // compute window size as ~50% of the usable work area (excludes taskbars/docks)
  let winWidth = 800;
  let winHeight = 600;
  try {
    const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
    winWidth = Math.floor(screenW * 0.6);
    winHeight = Math.floor(screenH * 0.6);
  } catch (e) {
    // fallback to defaults above if screen API fails
  }

  const win = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    useContentSize: true,
    center: true,
    // leave the native title empty so the menu sits on the same bar as the window controls
    title: '',
    // keep the menu bar visible for the main window (we'll set a per-window menu)
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });
  mainWindow = win;

  // ensure the menu bar is visible for the main window (menu sits in the title bar)
  try { win.setMenuBarVisibility(true); } catch (e) {}
  // clear any native window title so no label appears next to the menus
  try { win.setTitle(''); } catch (e) {}

  // Build a per-window menu (File / Edit / View) and set it only on the main window.
  // This keeps other windows (popups) menu-less while showing the menu bar here.
  try {
    const menuTemplate = [
      {
        label: 'File',
        submenu: [
          { role: 'quit', label: 'Quit' }
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
          { role: 'selectAll' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'toggledevtools' },
          { type: 'separator' },
          { role: 'resetzoom' },
          { role: 'zoomin' },
          { role: 'zoomout' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(menuTemplate);
    // set a window-specific menu so other windows don't get it
    win.setMenu(menu);
  } catch (e) {
    // ignore menu build errors
  }

  // Load from Vite dev server in development, or built files in production
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    win.loadURL('http://localhost:5173');
    // Open DevTools in development
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function createExistingProjectWindow() {
  // create a dedicated popup for adding an existing project
  const existingWin = new BrowserWindow({
    width: 520,
    height: 360,
    useContentSize: true,
    center: true,
    resizable: false,
    movable: true,
    frame: true,
    autoHideMenuBar: true,
    title: 'Add Existing Project',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // secure preload usage for popup windows so electronAPI is available
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // load the new popup page
  existingWin.loadFile(path.join(__dirname, 'existingProjectPopup.html'));
  // Resize to fit content after load
  existingWin.webContents.once('did-finish-load', async () => {
    try {
      const dimensions = await existingWin.webContents.executeJavaScript(
        `(() => {
          const body = document.body;
          const children = Array.from(body.children);
          let maxW = 0;
          let totalH = 0;
          children.forEach(c => {
            const r = c.getBoundingClientRect();
            const style = window.getComputedStyle(c);
            const marginLR = parseFloat(style.marginLeft || 0) + parseFloat(style.marginRight || 0);
            const marginTB = parseFloat(style.marginTop || 0) + parseFloat(style.marginBottom || 0);
            maxW = Math.max(maxW, Math.ceil(r.width + marginLR));
            totalH += Math.ceil(r.height + marginTB);
          });
          if (children.length === 0) {
            maxW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
            totalH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
          }
          return { w: Math.max(0, Math.ceil(maxW)), h: Math.max(0, Math.ceil(totalH)) };
        })()`
      );

  const padding = 40;
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  const maxW = Math.floor(screenW * 0.9);
  const maxH = Math.floor(screenH * 0.9);

  const targetW = Math.min(maxW, Math.ceil(dimensions.w + padding));
  const targetH = Math.min(maxH, Math.ceil(dimensions.h + padding));

      try { existingWin.setContentSize(targetW, targetH); existingWin.center(); } catch (e) {}
    } catch (e) {
      // ignore
    }
  });

  try { existingWin.setTitle('Add Existing SoundHaus Project'); } catch (e) {}
  try { existingWin.setMenuBarVisibility(false); } catch (e) {}

  existingWin.on('closed', () => {
    // nothing to keep globally for now
  });
}

function createServerProjectWindow() {
  const serverWin = new BrowserWindow({
    width: 520,
    height: 360,
    resizable: false,
    movable: true,
    frame: true,
    autoHideMenuBar: true,
    title: 'Create from Server',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  serverWin.loadFile(path.join(__dirname, 'createFromServerPopup.html'));
  // Resize to fit content after load
  serverWin.webContents.once('did-finish-load', async () => {
    try {
      const dimensions = await serverWin.webContents.executeJavaScript(
        `(() => {
          const body = document.body;
          const children = Array.from(body.children);
          let maxW = 0;
          let totalH = 0;
          children.forEach(c => {
            const r = c.getBoundingClientRect();
            const style = window.getComputedStyle(c);
            const marginLR = parseFloat(style.marginLeft || 0) + parseFloat(style.marginRight || 0);
            const marginTB = parseFloat(style.marginTop || 0) + parseFloat(style.marginBottom || 0);
            maxW = Math.max(maxW, Math.ceil(r.width + marginLR));
            totalH += Math.ceil(r.height + marginTB);
          });
          if (children.length === 0) {
            maxW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
            totalH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
          }
          return { w: Math.max(0, Math.ceil(maxW)), h: Math.max(0, Math.ceil(totalH)) };
        })()`
      );

  const padding = 40;
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  const maxW = Math.floor(screenW * 0.9);
  const maxH = Math.floor(screenH * 0.9);

  const targetW = Math.min(maxW, Math.ceil(dimensions.w + padding));
  const targetH = Math.min(maxH, Math.ceil(dimensions.h + padding));

      try { serverWin.setContentSize(targetW, targetH); serverWin.center(); } catch (e) {}
    } catch (e) {
      // ignore
    }
  });

  try { serverWin.setTitle('Create SoundHaus Project (Server)'); } catch (e) {}
  try { serverWin.setMenuBarVisibility(false); } catch (e) {}

  serverWin.on('closed', () => {
    // no global state kept
  });
}

ipcMain.handle('choose-folder', async (event) => {
  const win = BrowserWindow.getFocusedWindow();
  const repoPath = await chooseFolder(win);
  return repoPath;
});

ipcMain.handle('choose-file', async (event) => {
  const win = BrowserWindow.getFocusedWindow();
  const alsPath = await chooseFile(win);
  return alsPath;
})

ipcMain.on('clone-repo', (event, { url, repoPath }) => {
  if (!url || !repoPath) return;
  const win = BrowserWindow.getFocusedWindow();
  cloneRepo(url, repoPath, win);
});

ipcMain.handle('get-status', async (event, repoPath) => {
  return await getStatus(repoPath);
});

ipcMain.handle('get-als-content', async (event, alsPath) => {
  return await getAlsContent(alsPath);
});

// Find a .als file in the provided folder
ipcMain.handle('find-als', async (event, folderPath) => {
  if (!folderPath) return null;
  try {
    // Only check the root of the provided folder for a .als file.
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isFile() && ent.name.toLowerCase().endsWith('.als')) {
        return path.join(folderPath, ent.name);
      }
    }
  } catch (e) {
    // ignore read errors
  }
  return null;
});

ipcMain.handle('pull-repo', async (event, repoPath) => {
  return await pull(repoPath);
});

ipcMain.handle('push-repo', async (event, repoPath) => {
  return await push(repoPath);
});

ipcMain.handle('forward-project-path', (event, projectPath) => {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('open-project', projectPath)
  }
});
ipcMain.on('open-existing-project-popup', () => {
  createExistingProjectWindow();
});

ipcMain.on('open-create-from-server-popup', () => {
  createServerProjectWindow();
});

ipcMain.on('open-create-from-ableton-popup', () => {
  // create a popup similar to the existing-project popup but specialized for ALS folders
  const abletonWin = new BrowserWindow({
    width: 520,
    height: 320,
    useContentSize: true,
    center: true,
    resizable: false,
    movable: true,
    frame: true,
    autoHideMenuBar: true,
    title: 'Create from Ableton ALS folder',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  abletonWin.loadFile(path.join(__dirname, 'createFromAbletonPopup.html'));
  abletonWin.webContents.once('did-finish-load', async () => {
    try {
      const dimensions = await abletonWin.webContents.executeJavaScript(
        `(() => {
          const body = document.body;
          const children = Array.from(body.children);
          let maxW = 0;
          let totalH = 0;
          children.forEach(c => {
            const r = c.getBoundingClientRect();
            const style = window.getComputedStyle(c);
            const marginLR = parseFloat(style.marginLeft || 0) + parseFloat(style.marginRight || 0);
            const marginTB = parseFloat(style.marginTop || 0) + parseFloat(style.marginBottom || 0);
            maxW = Math.max(maxW, Math.ceil(r.width + marginLR));
            totalH += Math.ceil(r.height + marginTB);
          });
          if (children.length === 0) {
            maxW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
            totalH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
          }
          return { w: Math.max(0, Math.ceil(maxW)), h: Math.max(0, Math.ceil(totalH)) };
        })()`
      );

      const padding = 40;
      const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
      const maxW = Math.floor(screenW * 0.9);
      const maxH = Math.floor(screenH * 0.9);
      const targetW = Math.min(maxW, Math.ceil(dimensions.w + padding));
      const targetH = Math.min(maxH, Math.ceil(dimensions.h + padding));
      try { abletonWin.setContentSize(targetW, targetH); abletonWin.center(); } catch (e) {}
    } catch (e) {
      // ignore measurement errors
    }
  });

  try { abletonWin.setMenuBarVisibility(false); } catch (e) {}
  abletonWin.on('closed', () => {});
});

// open a URL in the user's default browser on request from renderer
ipcMain.on('open-external', (event, url) => {
  try {
    if (typeof url === 'string' && url.length > 0) {
      shell.openExternal(url);
    }
  } catch (e) {
    // ignore
  }
});

app.whenReady().then(() => {
  // remove the default application menu so File/Edit/View/etc. do not appear
  try { Menu.setApplicationMenu(null); } catch (e) {}
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})