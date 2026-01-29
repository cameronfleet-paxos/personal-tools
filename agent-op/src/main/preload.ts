import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Workspace management
  getWorkspaces: () => ipcRenderer.invoke('get-workspaces'),
  saveWorkspace: (workspace: unknown) => ipcRenderer.invoke('save-workspace', workspace),
  deleteWorkspace: (id: string) => ipcRenderer.invoke('delete-workspace', id),

  // Terminal management
  createTerminal: (workspaceId: string) => ipcRenderer.invoke('create-terminal', workspaceId),
  writeTerminal: (terminalId: string, data: string) => ipcRenderer.invoke('write-terminal', terminalId, data),
  resizeTerminal: (terminalId: string, cols: number, rows: number) => ipcRenderer.invoke('resize-terminal', terminalId, cols, rows),
  closeTerminal: (terminalId: string) => ipcRenderer.invoke('close-terminal', terminalId),

  // Terminal events
  onTerminalData: (callback: (terminalId: string, data: string) => void) => {
    ipcRenderer.on('terminal-data', (_event, terminalId, data) => callback(terminalId, data))
  },
  onTerminalExit: (callback: (terminalId: string, code: number) => void) => {
    ipcRenderer.on('terminal-exit', (_event, terminalId, code) => callback(terminalId, code))
  },
})
