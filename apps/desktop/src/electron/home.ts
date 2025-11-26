import { dialog, BrowserWindow } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'

async function chooseFolder(mainWindow?: BrowserWindow): Promise<string | null> {
    const options: OpenDialogOptions = {
        properties: ['openDirectory'],
        title: 'Choose SoundHaus project directory'
    };

    const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, options)
        : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }

    return result.filePaths[0];
}

async function hasGitFile(folderPath: string): Promise<boolean> {
    const gitPath = join(folderPath, '.git');
    try {
        const stat = await fs.stat(gitPath);
        return stat.isDirectory() || stat.isFile();
    }
    catch(err) {
        return false;
    }
}

export {
    chooseFolder,
    hasGitFile
};