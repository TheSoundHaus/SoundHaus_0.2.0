import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
	isElectron: () => true,
	chooseFolder: (): Promise<string | null> => ipcRenderer.invoke('choose-folder'),
    hasGitFile: (folderPath: string): Promise<boolean> => ipcRenderer.invoke('check-git', folderPath),
	getAlsContent: (alsPath: string): Promise<string | null> => ipcRenderer.invoke('get-als-content', alsPath),
	getAlsStruct: (alsPath: string): Promise<any> => ipcRenderer.invoke('get-als-content', alsPath),
	findAls: (folderPath: string) => ipcRenderer.invoke('find-als', folderPath),
	getChanges: (alsPath: string): Promise<any> => ipcRenderer.invoke('get-changes', alsPath),
	getCommitHistory: (repoPath: string): Promise<any[]> => ipcRenderer.invoke('get-commit-history', repoPath),
	getCommitDiff: (repoPath: string, commitHash: string, alsPath: string): Promise<any> => ipcRenderer.invoke('get-commit-diff', repoPath, commitHash, alsPath),
	checkIsCollaboration: (repoPath: string): Promise<any> => ipcRenderer.invoke('check-is-collaboration', repoPath),
});

contextBridge.exposeInMainWorld('gitService', {
	initRepo: (folderPath: string, projectInfo?: any): Promise<string> => ipcRenderer.invoke('init-repo', folderPath, projectInfo),
	cloneRepo: (cloneUrl: string, destinationPath: string): Promise<string> => ipcRenderer.invoke('clone-repo', cloneUrl, destinationPath),
	pullRepo: (repoPath: string, opts?: { skipMissingSampleCheck?: boolean }) =>
		ipcRenderer.invoke('pull-repo', repoPath, opts),
	commitChange: (repoPath: string): Promise<string> => ipcRenderer.invoke('commit-changes', repoPath),
	pushRepo: (repoPath: string, opts?: { skipMissingSampleCheck?: boolean }) =>
		ipcRenderer.invoke('push-repo', repoPath, opts),
	getProjectReadiness: (repoPath: string) => ipcRenderer.invoke('get-project-readiness', repoPath),
	checkMissingSamples: (repoPath: string) => ipcRenderer.invoke('check-missing-samples', repoPath),
	completeAlsMerge: (pendingPath: string, resolutions: Record<string, string>) =>
		ipcRenderer.invoke('complete-als-merge', pendingPath, resolutions),
	clearMergePendingFlag: (repoPath: string) => ipcRenderer.invoke('clear-merge-pending', repoPath),
	getAlsMergePending: (pendingPath: string) => ipcRenderer.invoke('get-als-merge-pending', pendingPath),
});

contextBridge.exposeInMainWorld('patService', {
	getSoundHausCredentials: (): Promise<string | null> => ipcRenderer.invoke('get-soundhaus-credentials'),
	setSoundHausCredentials: (token: string): Promise<string> => ipcRenderer.invoke('set-soundhaus-credentials', token),
	getGiteaCredentials: (): Promise<string | null> => ipcRenderer.invoke('get-gitea-credentials'),
	setGiteaCredentials: (token: string): Promise<string> => ipcRenderer.invoke('set-gitea-credentials', token),
	getAllowedCloneRemote: (): Promise<string | null> => ipcRenderer.invoke('get-allowed-clone-remote'),
	setAllowedCloneRemote: (remote: string): Promise<string> => ipcRenderer.invoke('set-allowed-clone-remote', remote),
	autoLogin: (): Promise<unknown> => ipcRenderer.invoke('auto-login'),
	manualLogin: (email: string, password: string): Promise<unknown> => ipcRenderer.invoke('manual-login', email, password),
	logout: (): Promise<{ success: boolean }> => ipcRenderer.invoke('logout'),
});

contextBridge.exposeInMainWorld('electron', {
	showProjectSetup: () => ipcRenderer.invoke('show-project-setup'),
	submitProjectSetup: (data: any) => ipcRenderer.send('project-setup-submit', data),
	cancelProjectSetup: () => ipcRenderer.send('project-setup-cancel'),
	showCloneUrl: () => ipcRenderer.invoke('show-clone-url'),
	submitCloneUrl: (data: any) => ipcRenderer.send('clone-url-submit', data),
	cancelCloneUrl: () => ipcRenderer.send('clone-url-cancel'),

	onMenuAction: (callback: (action: string, payload?: any) => void) => {
		ipcRenderer.on('menu-action', (_event, action, payload) => callback(action, payload));
	},
	removeMenuActionListener: () => {
		ipcRenderer.removeAllListeners('menu-action');
	},
	setLastProjectPath: (projectPath: string | null) => ipcRenderer.invoke('set-last-project-path', projectPath),
	setCurrentRoute: (route: string) => ipcRenderer.invoke('set-current-route', route),
	addRecentProject: (projectPath: string, projectName: string) => ipcRenderer.invoke('add-recent-project', projectPath, projectName),
	getRecentProjects: (): Promise<unknown[]> => ipcRenderer.invoke('get-recent-projects'),
	removeRecentProject: (projectPath: string) => ipcRenderer.invoke('remove-recent-project', projectPath),

	getSearchMenuEntries: () => ipcRenderer.invoke('search-menu-get-entries'),
	openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
	openAlsFile: (projectPath: string) => ipcRenderer.invoke('open-als-file', projectPath),
});