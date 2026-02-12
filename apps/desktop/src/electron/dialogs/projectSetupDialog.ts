import { BrowserWindow, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import * as path from 'path';

export interface ProjectSetupData {
  name: string;
  description: string;
  isPublic: boolean;
}

const isDev = process.env.DEV !== undefined;
const isPreview = process.env.PREVIEW !== undefined;

export function createProjectSetupDialog(parentWindow: BrowserWindow): Promise<ProjectSetupData | null> {
  return new Promise((resolve) => {
    const dialog = new BrowserWindow({
      width: 500,
      height: 450,
      parent: parentWindow,
      modal: true,
      show: false,
      resizable: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
      },
    });

    if (isDev) {
      dialog.loadURL('http://localhost:5173/#/project-setup');
    } else if (isPreview) {
      dialog.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: '/project-setup' });
    } else {
      dialog.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: '/project-setup' });
    }

    dialog.once('ready-to-show', () => {
      dialog.show();
    });

    // Handle dialog result
    const handleSubmit = (_event: IpcMainInvokeEvent, data: ProjectSetupData) => {
      resolve(data);
      dialog.close();
    };

    const handleCancel = () => {
      resolve(null);
      dialog.close();
    };

    ipcMain.once('project-setup-submit', handleSubmit);
    ipcMain.once('project-setup-cancel', handleCancel);

    dialog.on('closed', () => {
      ipcMain.removeListener('project-setup-submit', handleSubmit);
      ipcMain.removeListener('project-setup-cancel', handleCancel);
      resolve(null);
    });
  });
}
