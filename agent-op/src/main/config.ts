import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import type { Workspace, AppConfig, AppState, AppPreferences } from '../shared/types'

const CONFIG_DIR_NAME = '.agent-operator'

export function getConfigDir(): string {
  const homeDir = app?.getPath('home') || process.env.HOME || ''
  return path.join(homeDir, CONFIG_DIR_NAME)
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json')
}

export function getStatePath(): string {
  return path.join(getConfigDir(), 'state.json')
}

export function ensureConfigDirExists(): void {
  const configDir = getConfigDir()
  const dirs = [
    configDir,
    path.join(configDir, 'sockets'),
    path.join(configDir, 'hooks'),
  ]

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  // Create default config.json if it doesn't exist
  const configPath = getConfigPath()
  if (!fs.existsSync(configPath)) {
    const defaultConfig: AppConfig = {
      workspaces: [],
    }
    writeConfigAtomic(configPath, defaultConfig)
  }

  // Create default state.json if it doesn't exist
  const statePath = getStatePath()
  if (!fs.existsSync(statePath)) {
    const defaultState: AppState = {
      activeWorkspaceIds: [],
      tabs: [],
      activeTabId: null,
      preferences: getDefaultPreferences(),
    }
    writeConfigAtomic(statePath, defaultState)
  }
}

export function getDefaultPreferences(): AppPreferences {
  return {
    attentionMode: 'focus',
  }
}

// Atomic write to prevent corruption
function writeConfigAtomic(filePath: string, data: unknown): void {
  const tempPath = `${filePath}.tmp`
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2))
  fs.renameSync(tempPath, filePath)
}

// Config operations
export function loadConfig(): AppConfig {
  const configPath = getConfigPath()
  try {
    const content = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(content) as AppConfig
  } catch {
    return { workspaces: [] }
  }
}

export function saveConfig(config: AppConfig): void {
  writeConfigAtomic(getConfigPath(), config)
}

// Workspace operations
export function getWorkspaces(): Workspace[] {
  const config = loadConfig()
  return config.workspaces
}

export function saveWorkspace(workspace: Workspace): Workspace {
  const config = loadConfig()
  const existingIndex = config.workspaces.findIndex((w) => w.id === workspace.id)

  if (existingIndex >= 0) {
    config.workspaces[existingIndex] = workspace
  } else {
    config.workspaces.push(workspace)
  }

  saveConfig(config)
  return workspace
}

export function deleteWorkspace(id: string): void {
  const config = loadConfig()
  config.workspaces = config.workspaces.filter((w) => w.id !== id)
  saveConfig(config)
}

export function getWorkspaceById(id: string): Workspace | undefined {
  const workspaces = getWorkspaces()
  return workspaces.find((w) => w.id === id)
}

// State operations
export function loadState(): AppState {
  const statePath = getStatePath()
  try {
    const content = fs.readFileSync(statePath, 'utf-8')
    const state = JSON.parse(content) as AppState
    // Ensure preferences exist (migration for existing state files)
    if (!state.preferences) {
      state.preferences = getDefaultPreferences()
    }
    return state
  } catch {
    return { activeWorkspaceIds: [], tabs: [], activeTabId: null, preferences: getDefaultPreferences() }
  }
}

export function saveState(state: AppState): void {
  writeConfigAtomic(getStatePath(), state)
}
