const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  chooseFile: () => ipcRenderer.invoke('choose-file'),
  findAls: (folderPath) => ipcRenderer.invoke('find-als', folderPath),
  cloneRepo: (url, repoPath) => ipcRenderer.send('clone-repo', { url, repoPath }),
  getStatus: (repoPath) => ipcRenderer.invoke('get-status', repoPath),
  getAlsContent: (alsPath) => ipcRenderer.invoke('get-als-content', alsPath),
  pullRepo: (repoPath) => ipcRenderer.invoke('pull-repo', repoPath),
  pushRepo: (repoPath) => ipcRenderer.invoke('push-repo', repoPath),
  onOpenProject: (callback) => ipcRenderer.on('open-project', (event, projectPath) => callback(projectPath)),
  forwardProjectPath: (projectPath) => ipcRenderer.invoke('forward-project-path', projectPath),
  openExistingProjectPopup: () => ipcRenderer.send('open-existing-project-popup'),
  openCreateFromServerPopup: () => ipcRenderer.send('open-create-from-server-popup'),
  openCreateFromAbletonPopup: () => ipcRenderer.send('open-create-from-ableton-popup'),
  openExternal: (url) => ipcRenderer.send('open-external', url)
});
