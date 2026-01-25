// Preload script for Electron
// This runs in a sandboxed context before the web page loads

const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),
});
