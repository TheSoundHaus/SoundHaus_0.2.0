import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
	isElectron: () => true,
	chooseFolder: (): Promise<string | null> => ipcRenderer.invoke('choose-folder'),
    hasGitFile: (folderPath: string): Promise<boolean> => ipcRenderer.invoke('check-git', folderPath),
	getAlsContent: (alsPath: string): Promise<string | null> => ipcRenderer.invoke('get-als-content', alsPath),
	getAlsStruct: (alsPath: string): Promise<any> => ipcRenderer.invoke('find-instrument-changes', alsPath),
	findAls: (folderPath: string) => ipcRenderer.invoke('find-als', folderPath)
});