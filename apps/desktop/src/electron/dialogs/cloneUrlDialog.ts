import { BrowserWindow, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import * as path from 'path';

export interface CloneUrlData {
  url: string;
  path: string;
}

const isDev = process.env.DEV !== undefined;
const isPreview = process.env.PREVIEW !== undefined;

export function createCloneUrlDialog(parentWindow: BrowserWindow): Promise<CloneUrlData | null> {
  return new Promise((resolve) => {
    const dialog = new BrowserWindow({
      width: 500,
      height: 400,
      parent: parentWindow,
      modal: true,
      show: false,
      resizable: false,
      backgroundColor: '#18181B',
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
      },
    });

    if (isDev) {
      dialog.loadURL('http://localhost:5173/#/clone-url');
    } else if (isPreview) {
      dialog.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: '/clone-url' });
    } else {
      dialog.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: '/clone-url' });
    }

    dialog.once('ready-to-show', () => {
      dialog.show();
    });

    // Handle dialog result
    const handleSubmit = (_event: IpcMainInvokeEvent, data: CloneUrlData) => {
      resolve(data);
      dialog.close();
    };

    const handleCancel = () => {
      resolve(null);
      dialog.close();
    };

    ipcMain.once('clone-url-submit', handleSubmit);
    ipcMain.once('clone-url-cancel', handleCancel);

    dialog.on('closed', () => {
      ipcMain.removeListener('clone-url-submit', handleSubmit);
      ipcMain.removeListener('clone-url-cancel', handleCancel);
      resolve(null);
    });
  });
}
