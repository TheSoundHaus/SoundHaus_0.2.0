import { BrowserWindow } from 'electron';
import * as path from 'path';

const isDev = process.env.DEV !== undefined;
const isPreview = process.env.PREVIEW !== undefined;

export function createAboutDialog(parentWindow: BrowserWindow): void {
  const dialog = new BrowserWindow({
    width: 480,
    height: 320,
    parent: parentWindow,
    modal: true,
    show: false,
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
    },
  });

  dialog.setMenuBarVisibility(false);

  if (isDev) {
    dialog.loadURL('http://localhost:5173/#/about');
  } else if (isPreview) {
    dialog.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: '/about' });
  } else {
    dialog.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: '/about' });
  }

  dialog.once('ready-to-show', () => {
    dialog.show();
  });
}
