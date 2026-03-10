const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sovereignAPI', {
  getPolicy: (userId) => ipcRenderer.invoke('get-policy', userId),
  setPolicy: (userId, policy) => ipcRenderer.invoke('set-policy', userId, policy),
  filterContent: (userId, content, type, context) => ipcRenderer.invoke('filter-content', userId, content, type, context),
  getSystemStatus: () => ipcRenderer.invoke('get-system-status'),
  enableAutostart: () => ipcRenderer.invoke('autostart-enable'),
  disableAutostart: () => ipcRenderer.invoke('autostart-disable'),
  startBackgroundService: () => ipcRenderer.invoke('background-start'),
  stopBackgroundService: () => ipcRenderer.invoke('background-stop'),

  // CA helpers for developer workflow
  checkCA: (certPath) => ipcRenderer.invoke('check-ca', certPath),
  installCA: (certPath) => ipcRenderer.invoke('install-ca', certPath),
  uninstallCA: (nameOrPath) => ipcRenderer.invoke('uninstall-ca', nameOrPath)
});
