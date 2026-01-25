// Preload script for Electron
// This runs in a sandboxed context before the web page loads

const { contextBridge } = require('electron');

// Expose a minimal API to the renderer process if needed
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
});
