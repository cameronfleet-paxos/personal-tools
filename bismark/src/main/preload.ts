import { contextBridge, ipcRenderer } from 'electron'
import type { Workspace, AppState, AgentTab, AppPreferences } from '../shared/types'

contextBridge.exposeInMainWorld('electronAPI', {
  // Workspace management
  getWorkspaces: (): Promise<Workspace[]> =>
    ipcRenderer.invoke('get-workspaces'),
  saveWorkspace: (workspace: Workspace): Promise<Workspace> =>
    ipcRenderer.invoke('save-workspace', workspace),
  deleteWorkspace: (id: string): Promise<void> =>
    ipcRenderer.invoke('delete-workspace', id),

  // Terminal management
  createTerminal: (
    workspaceId: string,
    resumeSessionId?: string
  ): Promise<string> =>
    ipcRenderer.invoke('create-terminal', workspaceId, resumeSessionId),
  writeTerminal: (terminalId: string, data: string): Promise<void> =>
    ipcRenderer.invoke('write-terminal', terminalId, data),
  resizeTerminal: (
    terminalId: string,
    cols: number,
    rows: number
  ): Promise<void> =>
    ipcRenderer.invoke('resize-terminal', terminalId, cols, rows),
  closeTerminal: (terminalId: string): Promise<void> =>
    ipcRenderer.invoke('close-terminal', terminalId),
  stopWorkspace: (workspaceId: string): Promise<void> =>
    ipcRenderer.invoke('stop-workspace', workspaceId),

  // State management
  getState: (): Promise<AppState> => ipcRenderer.invoke('get-state'),
  setFocusedWorkspace: (workspaceId: string | undefined): Promise<void> =>
    ipcRenderer.invoke('set-focused-workspace', workspaceId),

  // Tab management
  createTab: (name?: string): Promise<AgentTab> =>
    ipcRenderer.invoke('create-tab', name),
  renameTab: (tabId: string, name: string): Promise<void> =>
    ipcRenderer.invoke('rename-tab', tabId, name),
  deleteTab: (
    tabId: string
  ): Promise<{ success: boolean; workspaceIds: string[] }> =>
    ipcRenderer.invoke('delete-tab', tabId),
  setActiveTab: (tabId: string): Promise<void> =>
    ipcRenderer.invoke('set-active-tab', tabId),
  getTabs: (): Promise<AgentTab[]> => ipcRenderer.invoke('get-tabs'),
  reorderWorkspaceInTab: (
    tabId: string,
    workspaceId: string,
    newPosition: number
  ): Promise<boolean> =>
    ipcRenderer.invoke('reorder-workspace-in-tab', tabId, workspaceId, newPosition),
  moveWorkspaceToTab: (
    workspaceId: string,
    targetTabId: string,
    position?: number
  ): Promise<boolean> =>
    ipcRenderer.invoke('move-workspace-to-tab', workspaceId, targetTabId, position),

  // Waiting queue management
  getWaitingQueue: (): Promise<string[]> =>
    ipcRenderer.invoke('get-waiting-queue'),
  acknowledgeWaiting: (workspaceId: string): Promise<void> =>
    ipcRenderer.invoke('acknowledge-waiting', workspaceId),

  // Preferences management
  getPreferences: (): Promise<AppPreferences> =>
    ipcRenderer.invoke('get-preferences'),
  setPreferences: (preferences: Partial<AppPreferences>): Promise<AppPreferences> =>
    ipcRenderer.invoke('set-preferences', preferences),

  // Terminal events - use removeAllListeners before adding to prevent duplicates
  onTerminalData: (
    callback: (terminalId: string, data: string) => void
  ): void => {
    ipcRenderer.removeAllListeners('terminal-data')
    ipcRenderer.on('terminal-data', (_event, terminalId, data) =>
      callback(terminalId, data)
    )
  },
  onTerminalExit: (
    callback: (terminalId: string, code: number) => void
  ): void => {
    ipcRenderer.removeAllListeners('terminal-exit')
    ipcRenderer.on('terminal-exit', (_event, terminalId, code) =>
      callback(terminalId, code)
    )
  },

  // Agent waiting events
  onAgentWaiting: (callback: (workspaceId: string) => void): void => {
    ipcRenderer.on('agent-waiting', (_event, workspaceId) =>
      callback(workspaceId)
    )
  },
  onFocusWorkspace: (callback: (workspaceId: string) => void): void => {
    ipcRenderer.on('focus-workspace', (_event, workspaceId) =>
      callback(workspaceId)
    )
  },
  onWaitingQueueChanged: (callback: (queue: string[]) => void): void => {
    ipcRenderer.on('waiting-queue-changed', (_event, queue) => callback(queue))
  },
  onInitialState: (callback: (state: AppState) => void): void => {
    ipcRenderer.on('initial-state', (_event, state) => callback(state))
  },

  // Tray updates
  updateTray: (count: number): void => {
    ipcRenderer.send('update-tray', count)
  },

  // Cleanup
  removeAllListeners: (): void => {
    ipcRenderer.removeAllListeners('terminal-data')
    ipcRenderer.removeAllListeners('terminal-exit')
    ipcRenderer.removeAllListeners('agent-waiting')
    ipcRenderer.removeAllListeners('focus-workspace')
    ipcRenderer.removeAllListeners('waiting-queue-changed')
    ipcRenderer.removeAllListeners('initial-state')
  },
})
