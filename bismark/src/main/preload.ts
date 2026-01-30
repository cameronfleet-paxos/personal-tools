import { contextBridge, ipcRenderer } from 'electron'
import type { Workspace, AppState, AgentTab, AppPreferences, Plan, TaskAssignment, PlanActivity } from '../shared/types'

contextBridge.exposeInMainWorld('electronAPI', {
  // Workspace management
  getWorkspaces: (): Promise<Workspace[]> =>
    ipcRenderer.invoke('get-workspaces'),
  saveWorkspace: (workspace: Workspace): Promise<Workspace> =>
    ipcRenderer.invoke('save-workspace', workspace),
  deleteWorkspace: (id: string): Promise<void> =>
    ipcRenderer.invoke('delete-workspace', id),

  // Terminal management
  createTerminal: (workspaceId: string): Promise<string> =>
    ipcRenderer.invoke('create-terminal', workspaceId),
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

  // Plan management (Team Mode)
  createPlan: (title: string, description: string): Promise<Plan> =>
    ipcRenderer.invoke('create-plan', title, description),
  getPlans: (): Promise<Plan[]> =>
    ipcRenderer.invoke('get-plans'),
  executePlan: (planId: string, referenceAgentId: string): Promise<Plan | null> =>
    ipcRenderer.invoke('execute-plan', planId, referenceAgentId),
  cancelPlan: (planId: string): Promise<Plan | null> =>
    ipcRenderer.invoke('cancel-plan', planId),
  getTaskAssignments: (planId: string): Promise<TaskAssignment[]> =>
    ipcRenderer.invoke('get-task-assignments', planId),
  getPlanActivities: (planId: string): Promise<PlanActivity[]> =>
    ipcRenderer.invoke('get-plan-activities', planId),
  setPlanSidebarOpen: (open: boolean): Promise<void> =>
    ipcRenderer.invoke('set-plan-sidebar-open', open),
  setActivePlanId: (planId: string | null): Promise<void> =>
    ipcRenderer.invoke('set-active-plan-id', planId),

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

  // Plan events (Team Mode)
  onPlanUpdate: (callback: (plan: Plan) => void): void => {
    ipcRenderer.on('plan-update', (_event, plan) => callback(plan))
  },
  onTaskAssignmentUpdate: (callback: (assignment: TaskAssignment) => void): void => {
    ipcRenderer.on('task-assignment-update', (_event, assignment) => callback(assignment))
  },
  onPlanActivity: (callback: (activity: PlanActivity) => void): void => {
    ipcRenderer.on('plan-activity', (_event, activity) => callback(activity))
  },
  onStateUpdate: (callback: (state: AppState) => void): void => {
    ipcRenderer.on('state-update', (_event, state) => callback(state))
  },
  onTerminalCreated: (callback: (data: { terminalId: string; workspaceId: string }) => void): void => {
    ipcRenderer.on('terminal-created', (_event, data) => callback(data))
  },

  // External URL handling
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('open-external', url),

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
    ipcRenderer.removeAllListeners('plan-update')
    ipcRenderer.removeAllListeners('task-assignment-update')
    ipcRenderer.removeAllListeners('plan-activity')
    ipcRenderer.removeAllListeners('state-update')
    ipcRenderer.removeAllListeners('terminal-created')
  },
})
