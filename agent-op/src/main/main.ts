import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
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
} from './socket-server'
import { configureClaudeHook, createHookScript } from './hook-manager'
import { createTray, updateTray, destroyTray } from './tray'
import {
  initializeState,
  getState,
  addActiveWorkspace,
  removeActiveWorkspace,
  setLayout,
  setFocusedWorkspace,
} from './state-manager'
import type { Workspace } from '../shared/types'

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

  // Set the main window reference for socket server
  setMainWindow(mainWindow)

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    setMainWindow(null)
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
  ipcMain.handle(
    'create-terminal',
    (_event, workspaceId: string, resumeSessionId?: string) => {
      // Create socket server for this workspace
      createSocketServer(workspaceId)

      // Add to active workspaces
      addActiveWorkspace(workspaceId)

      return createTerminal(workspaceId, mainWindow, resumeSessionId)
    }
  )

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

  ipcMain.handle('set-layout', (_event, layout: 'grid' | 'tabs') => {
    setLayout(layout)
  })

  ipcMain.handle('set-focused-workspace', (_event, workspaceId: string | undefined) => {
    setFocusedWorkspace(workspaceId)
  })

  ipcMain.handle('stop-workspace', (_event, workspaceId: string) => {
    removeActiveWorkspace(workspaceId)
    closeSocketServer(workspaceId)
  })

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
}

app.whenReady().then(() => {
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
})

app.on('window-all-closed', () => {
  closeAllTerminals()
  closeAllSocketServers()
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

app.on('before-quit', () => {
  closeAllTerminals()
  closeAllSocketServers()
  destroyTray()
})
