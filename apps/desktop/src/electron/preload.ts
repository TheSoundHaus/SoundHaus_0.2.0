import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
	isElectron: () => true,
	chooseFolder: (): Promise<string | null> => ipcRenderer.invoke('choose-folder'),
    hasGitFile: (folderPath: string): Promise<boolean> => ipcRenderer.invoke('check-git', folderPath),
	getAlsContent: (alsPath: string): Promise<string | null> => ipcRenderer.invoke('get-als-content', alsPath),
	getAlsStruct: (alsPath: string): Promise<any> => ipcRenderer.invoke('find-instrument-changes', alsPath),
	findAls: (folderPath: string) => ipcRenderer.invoke('find-als', folderPath)
});

contextBridge.exposeInMainWorld('gitService', {
	initRepo: (folderPath: string, projectInfo?: any): Promise<string> => ipcRenderer.invoke('init-repo', folderPath, projectInfo),
	pullRepo: (repoPath: string): Promise<string> => ipcRenderer.invoke('pull-repo', repoPath),
	commitChange: (repoPath: string): Promise<string> => ipcRenderer.invoke('commit-changes', repoPath),
	pushRepo: (repoPath: string): Promise<string> => ipcRenderer.invoke('push-repo', repoPath)
});

contextBridge.exposeInMainWorld('patService', {
	getSoundHausCredentials: (): Promise<string | null> => ipcRenderer.invoke('get-soundhaus-credentials'),
	setSoundHausCredentials: (token: string): Promise<string> => ipcRenderer.invoke('set-soundhaus-credentials', token),
	getGiteaCredentials: (): Promise<string | null> => ipcRenderer.invoke('get-gitea-credentials'),
	setGiteaCredentials: (token: string): Promise<string> => ipcRenderer.invoke('set-gitea-credentials', token)
});

contextBridge.exposeInMainWorld('electron', {
	showProjectSetup: () => ipcRenderer.invoke('show-project-setup'),
	submitProjectSetup: (data: any) => ipcRenderer.send('project-setup-submit', data),
	cancelProjectSetup: () => ipcRenderer.send('project-setup-cancel')
});