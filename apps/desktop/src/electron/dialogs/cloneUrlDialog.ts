import { BrowserWindow, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import * as path from 'path';

export interface CloneUrlData {
  url: string;
  path: string;
}

export interface CloneUrlDialogOptions {
  initialCloneUrl?: string;
}

const isDev = process.env.DEV !== undefined;
const isPreview = process.env.PREVIEW !== undefined;

export function createCloneUrlDialog(
  parentWindow: BrowserWindow,
  options?: CloneUrlDialogOptions,
): Promise<CloneUrlData | null> {
  return new Promise((resolve) => {
    const dialog = new BrowserWindow({
      width: 540,
      height: 420,
      parent: parentWindow,
      modal: true,
      show: false,
      resizable: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
        spellcheck: false,
      },
    });

    dialog.setMenuBarVisibility(false);

    const prefill = options?.initialCloneUrl?.trim();
    const hashPath =
      prefill !== undefined && prefill.length > 0
        ? `/clone-url?cloneUrl=${encodeURIComponent(prefill)}`
        : '/clone-url';

    if (isDev) {
      dialog.loadURL(`http://localhost:5173/#${hashPath}`);
    } else if (isPreview) {
      dialog.loadFile(path.join(__dirname, '../../index.html'), { hash: hashPath });
    } else {
      dialog.loadFile(path.join(__dirname, '../../index.html'), { hash: hashPath });
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
