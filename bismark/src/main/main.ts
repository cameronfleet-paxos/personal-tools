import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import { randomUUID } from 'crypto'
import {
  ensureConfigDirExists,
  getWorkspaces,
  saveWorkspace,
  deleteWorkspace,
} from './config'
import {
  createTerminal,
  writeTerminal,
  resizeTerminal,
  closeTerminal,
  closeAllTerminals,
} from './terminal'
import {
  createSocketServer,
  closeSocketServer,
  closeAllSocketServers,
  setMainWindow,
  getWaitingQueue,
  removeFromWaitingQueue,
  setInstanceId,
} from './socket-server'
import { configureClaudeHook, createHookScript } from './hook-manager'
import { createTray, updateTray, destroyTray } from './tray'
import {
  initializeState,
  getState,
  addActiveWorkspace,
  removeActiveWorkspace,
  setFocusedWorkspace,
  createTab,
  renameTab,
  deleteTab,
  setActiveTab,
  addWorkspaceToTab,
  removeWorkspaceFromTab,
  getOrCreateTabForWorkspace,
  getPreferences,
  setPreferences,
  reorderWorkspaceInTab,
  moveWorkspaceToTab,
  getTabs,
  setPlanSidebarOpen,
  setActivePlanId,
} from './state-manager'
import {
  createPlan,
  getPlans,
  executePlan,
  cancelPlan,
  getTaskAssignments,
  getPlanActivities,
  setPlanManagerWindow,
  startTaskPolling,
  stopTaskPolling,
  completePlan,
  cleanupPlanManager,
  setHeadlessMode,
  isHeadlessModeEnabled,
  checkHeadlessModeAvailable,
  getHeadlessAgentInfo,
  getHeadlessAgentInfoForPlan,
  stopHeadlessTaskAgent,
} from './plan-manager'
import {
  detectRepository,
  getAllRepositories,
  updateRepository,
} from './repository-manager'
import { initializeDockerEnvironment } from './docker-sandbox'
import {
  setDevHarnessWindow,
  runMockFlow,
  startMockAgent,
  stopMockFlow,
  getMockAgentInfo,
  getMockAgentsForPlan,
  cleanupDevHarness,
} from './dev-test-harness'
import type { Workspace, AppPreferences, Repository } from '../shared/types'

// Generate unique instance ID for socket isolation
const instanceId = randomUUID()

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  // Set the main window reference for socket server, plan manager, and dev harness
  setMainWindow(mainWindow)
  setPlanManagerWindow(mainWindow)
  setDevHarnessWindow(mainWindow)

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    setMainWindow(null)
    setPlanManagerWindow(null)
    setDevHarnessWindow(null)
  })

  // Create system tray
  createTray(mainWindow)

  // Listen for waiting count changes to update tray
  mainWindow.webContents.on('did-finish-load', () => {
    // Send initial state to renderer
    const state = getState()
    mainWindow?.webContents.send('initial-state', state)
  })
}

// Register IPC handlers
function registerIpcHandlers() {
  // Workspace management
  ipcMain.handle('get-workspaces', () => {
    return getWorkspaces()
  })

  ipcMain.handle('save-workspace', (_event, workspace: Workspace) => {
    return saveWorkspace(workspace)
  })

  ipcMain.handle('delete-workspace', (_event, id: string) => {
    deleteWorkspace(id)
    removeActiveWorkspace(id)
    closeSocketServer(id)
  })

  // Terminal management
  ipcMain.handle('create-terminal', (_event, workspaceId: string) => {
    // Create socket server for this workspace
    createSocketServer(workspaceId)

    // Add to active workspaces
    addActiveWorkspace(workspaceId)

    // Auto-place workspace in a tab with space (or create new tab)
    const tab = getOrCreateTabForWorkspace(workspaceId)
    addWorkspaceToTab(workspaceId, tab.id)
    setActiveTab(tab.id)

    return createTerminal(workspaceId, mainWindow)
  })

  ipcMain.handle('write-terminal', (_event, terminalId: string, data: string) => {
    writeTerminal(terminalId, data)
  })

  ipcMain.handle(
    'resize-terminal',
    (_event, terminalId: string, cols: number, rows: number) => {
      resizeTerminal(terminalId, cols, rows)
    }
  )

  ipcMain.handle('close-terminal', (_event, terminalId: string) => {
    closeTerminal(terminalId)
  })

  // State management
  ipcMain.handle('get-state', () => {
    return getState()
  })

  ipcMain.handle('set-focused-workspace', (_event, workspaceId: string | undefined) => {
    setFocusedWorkspace(workspaceId)
  })

  ipcMain.handle('stop-workspace', (_event, workspaceId: string) => {
    removeWorkspaceFromTab(workspaceId)
    removeActiveWorkspace(workspaceId)
    closeSocketServer(workspaceId)
  })

  // Tab management
  ipcMain.handle('create-tab', (_event, name?: string) => {
    return createTab(name)
  })

  ipcMain.handle('rename-tab', (_event, tabId: string, name: string) => {
    renameTab(tabId, name)
  })

  ipcMain.handle('delete-tab', (_event, tabId: string) => {
    const tab = getState().tabs.find((t) => t.id === tabId)
    if (tab) {
      // Return workspace IDs that need to be stopped
      const workspaceIds = [...tab.workspaceIds]
      const success = deleteTab(tabId)
      return { success, workspaceIds }
    }
    return { success: false, workspaceIds: [] }
  })

  ipcMain.handle('set-active-tab', (_event, tabId: string) => {
    setActiveTab(tabId)
  })

  ipcMain.handle('get-tabs', () => {
    return getTabs()
  })

  ipcMain.handle(
    'reorder-workspace-in-tab',
    (_event, tabId: string, workspaceId: string, newPosition: number) => {
      return reorderWorkspaceInTab(tabId, workspaceId, newPosition)
    }
  )

  ipcMain.handle(
    'move-workspace-to-tab',
    (_event, workspaceId: string, targetTabId: string, position?: number) => {
      return moveWorkspaceToTab(workspaceId, targetTabId, position)
    }
  )

  // Waiting queue management
  ipcMain.handle('get-waiting-queue', () => {
    return getWaitingQueue()
  })

  ipcMain.handle('acknowledge-waiting', (_event, workspaceId: string) => {
    removeFromWaitingQueue(workspaceId)
    updateTray(getWaitingQueue().length)
  })

  // Update tray when waiting count changes
  ipcMain.on('update-tray', (_event, count: number) => {
    updateTray(count)
  })

  // Preferences management
  ipcMain.handle('get-preferences', () => {
    return getPreferences()
  })

  ipcMain.handle('set-preferences', (_event, preferences: Partial<AppPreferences>) => {
    const updated = setPreferences(preferences)
    // Start/stop task polling based on operating mode
    if (preferences.operatingMode === 'team') {
      startTaskPolling()
    } else if (preferences.operatingMode === 'solo') {
      stopTaskPolling()
    }
    return updated
  })

  // Plan management (Team Mode)
  ipcMain.handle('create-plan', (_event, title: string, description: string, maxParallelAgents?: number) => {
    return createPlan(title, description, maxParallelAgents)
  })

  ipcMain.handle('get-plans', () => {
    return getPlans()
  })

  ipcMain.handle('execute-plan', async (_event, planId: string, referenceAgentId: string) => {
    return executePlan(planId, referenceAgentId)
  })

  ipcMain.handle('cancel-plan', async (_event, planId: string) => {
    return cancelPlan(planId)
  })

  ipcMain.handle('complete-plan', async (_event, planId: string) => {
    return completePlan(planId)
  })

  ipcMain.handle('get-task-assignments', (_event, planId: string) => {
    return getTaskAssignments(planId)
  })

  ipcMain.handle('get-plan-activities', (_event, planId: string) => {
    return getPlanActivities(planId)
  })

  ipcMain.handle('set-plan-sidebar-open', (_event, open: boolean) => {
    setPlanSidebarOpen(open)
  })

  ipcMain.handle('set-active-plan-id', (_event, planId: string | null) => {
    setActivePlanId(planId)
  })

  // Headless mode management
  ipcMain.handle('set-headless-mode', (_event, enabled: boolean) => {
    setHeadlessMode(enabled)
    return enabled
  })

  ipcMain.handle('get-headless-mode', () => {
    return isHeadlessModeEnabled()
  })

  ipcMain.handle('check-headless-mode-available', async () => {
    return checkHeadlessModeAvailable()
  })

  ipcMain.handle('get-headless-agent-info', (_event, taskId: string) => {
    return getHeadlessAgentInfo(taskId)
  })

  ipcMain.handle('get-headless-agents-for-plan', (_event, planId: string) => {
    return getHeadlessAgentInfoForPlan(planId)
  })

  ipcMain.handle('stop-headless-agent', async (_event, taskId: string) => {
    return stopHeadlessTaskAgent(taskId)
  })

  // External URL handling
  ipcMain.handle('open-external', (_event, url: string) => {
    return shell.openExternal(url)
  })

  // Git repository management
  ipcMain.handle('detect-git-repository', async (_event, directory: string) => {
    return detectRepository(directory)
  })

  ipcMain.handle('get-repositories', async () => {
    return getAllRepositories()
  })

  ipcMain.handle('update-repository', async (_event, id: string, updates: Partial<Pick<Repository, 'prFlow' | 'name'>>) => {
    return updateRepository(id, updates)
  })

  // Dev test harness (development mode only)
  if (process.env.NODE_ENV === 'development') {
    ipcMain.handle('dev-run-mock-flow', async () => {
      return runMockFlow()
    })

    ipcMain.handle('dev-start-mock-agent', async (_event, taskId: string, planId?: string, worktreePath?: string) => {
      return startMockAgent(taskId, planId, worktreePath)
    })

    ipcMain.handle('dev-stop-mock', async () => {
      return stopMockFlow()
    })

    ipcMain.handle('dev-get-mock-agent-info', (_event, taskId: string) => {
      return getMockAgentInfo(taskId)
    })

    ipcMain.handle('dev-get-mock-agents-for-plan', (_event, planId: string) => {
      return getMockAgentsForPlan(planId)
    })
  }
}

app.whenReady().then(async () => {
  // Set instance ID for socket isolation
  setInstanceId(instanceId)

  // Initialize config directory structure
  ensureConfigDirExists()

  // Initialize state
  initializeState()

  // Create hook script and configure Claude settings
  createHookScript()
  configureClaudeHook()

  // Register IPC handlers before creating window
  registerIpcHandlers()

  createWindow()

  // Initialize Docker environment for headless mode (async, non-blocking)
  // This builds the Docker image if it doesn't exist
  initializeDockerEnvironment().then((result) => {
    if (result.success) {
      console.log('[Main] Docker environment ready:', result.message)
      if (result.imageBuilt) {
        // Notify renderer that image was built
        mainWindow?.webContents.send('docker-image-built', result)
      }
    } else {
      console.warn('[Main] Docker environment not ready:', result.message)
      // Headless mode will fall back to interactive mode
    }
  }).catch((err) => {
    console.error('[Main] Docker initialization error:', err)
  })
})

app.on('window-all-closed', async () => {
  closeAllTerminals()
  closeAllSocketServers()
  await cleanupPlanManager()
  await cleanupDevHarness()
  destroyTray()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

app.on('before-quit', async () => {
  closeAllTerminals()
  closeAllSocketServers()
  await cleanupPlanManager()
  await cleanupDevHarness()
  destroyTray()
})
