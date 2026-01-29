import type { Workspace, AppState } from '../shared/types'

export interface ElectronAPI {
  // Workspace management
  getWorkspaces: () => Promise<Workspace[]>
  saveWorkspace: (workspace: Workspace) => Promise<Workspace>
  deleteWorkspace: (id: string) => Promise<void>

  // Terminal management
  createTerminal: (
    workspaceId: string,
    resumeSessionId?: string
  ) => Promise<string>
  writeTerminal: (terminalId: string, data: string) => Promise<void>
  resizeTerminal: (
    terminalId: string,
    cols: number,
    rows: number
  ) => Promise<void>
  closeTerminal: (terminalId: string) => Promise<void>
  stopWorkspace: (workspaceId: string) => Promise<void>

  // State management
  getState: () => Promise<AppState>
  setLayout: (layout: 'grid' | 'tabs') => Promise<void>
  setFocusedWorkspace: (workspaceId: string | undefined) => Promise<void>

  // Waiting queue management
  getWaitingQueue: () => Promise<string[]>
  acknowledgeWaiting: (workspaceId: string) => Promise<void>

  // Terminal events
  onTerminalData: (
    callback: (terminalId: string, data: string) => void
  ) => void
  onTerminalExit: (callback: (terminalId: string, code: number) => void) => void

  // Agent waiting events
  onAgentWaiting: (callback: (workspaceId: string) => void) => void
  onFocusWorkspace: (callback: (workspaceId: string) => void) => void
  onWaitingQueueChanged: (callback: (queue: string[]) => void) => void
  onInitialState: (callback: (state: AppState) => void) => void

  // Tray updates
  updateTray: (count: number) => void

  // Cleanup
  removeAllListeners: () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
