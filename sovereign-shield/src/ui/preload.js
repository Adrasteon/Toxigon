const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sovereignAPI', {
  getPolicy: (userId) => ipcRenderer.invoke('get-policy', userId),
  setPolicy: (userId, policy) => ipcRenderer.invoke('set-policy', userId, policy),
  filterContent: (userId, content, type, context) => ipcRenderer.invoke('filter-content', userId, content, type, context),
  getSystemStatus: () => ipcRenderer.invoke('get-system-status')
});
