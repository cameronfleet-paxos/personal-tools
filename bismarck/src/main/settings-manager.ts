import * as fs from 'fs'
import * as path from 'path'
import { getConfigDir, writeConfigAtomic } from './config'

// Settings file path
function getSettingsPath(): string {
  return path.join(getConfigDir(), 'settings.json')
}

// Settings types
export interface ProxiedTool {
  id: string
  name: string
  hostPath: string
  description?: string
}

export interface AppSettings {
  paths: {
    bd: string | null
    gh: string | null
    git: string | null
  }
  docker: {
    images: string[]
    resourceLimits: {
      cpu: string
      memory: string
    }
    proxiedTools: ProxiedTool[]
  }
}

// Default settings
export function getDefaultSettings(): AppSettings {
  return {
    paths: {
      bd: null,
      gh: null,
      git: null,
    },
    docker: {
      images: [],
      resourceLimits: {
        cpu: '2',
        memory: '4g',
      },
      proxiedTools: [],
    },
  }
}

// Load settings from disk
export function loadSettings(): AppSettings {
  const settingsPath = getSettingsPath()
  try {
    const content = fs.readFileSync(settingsPath, 'utf-8')
    const settings = JSON.parse(content) as AppSettings

    // Merge with defaults to handle missing fields (for migration/backward compat)
    const defaults = getDefaultSettings()
    return {
      paths: { ...defaults.paths, ...settings.paths },
      docker: {
        images: settings.docker?.images || defaults.docker.images,
        resourceLimits: {
          ...defaults.docker.resourceLimits,
          ...(settings.docker?.resourceLimits || {}),
        },
        proxiedTools: settings.docker?.proxiedTools || defaults.docker.proxiedTools,
      },
    }
  } catch {
    // File doesn't exist or is invalid, return defaults
    return getDefaultSettings()
  }
}

// Save settings to disk
export function saveSettings(settings: AppSettings): void {
  const settingsPath = getSettingsPath()
  writeConfigAtomic(settingsPath, settings)
}

// Update partial settings (merge with existing)
export function updateSettings(updates: Partial<AppSettings>): AppSettings {
  const current = loadSettings()
  const updated: AppSettings = {
    paths: { ...current.paths, ...(updates.paths || {}) },
    docker: {
      images: updates.docker?.images !== undefined ? updates.docker.images : current.docker.images,
      resourceLimits: {
        ...current.docker.resourceLimits,
        ...(updates.docker?.resourceLimits || {}),
      },
      proxiedTools:
        updates.docker?.proxiedTools !== undefined
          ? updates.docker.proxiedTools
          : current.docker.proxiedTools,
    },
  }
  saveSettings(updated)
  return updated
}

// Proxied tool operations
export function addProxiedTool(tool: Omit<ProxiedTool, 'id'>): ProxiedTool {
  const settings = loadSettings()
  const newTool: ProxiedTool = {
    id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    ...tool,
  }
  settings.docker.proxiedTools.push(newTool)
  saveSettings(settings)
  return newTool
}

export function updateProxiedTool(id: string, updates: Partial<Omit<ProxiedTool, 'id'>>): ProxiedTool | null {
  const settings = loadSettings()
  const toolIndex = settings.docker.proxiedTools.findIndex((t) => t.id === id)
  if (toolIndex === -1) {
    return null
  }
  settings.docker.proxiedTools[toolIndex] = {
    ...settings.docker.proxiedTools[toolIndex],
    ...updates,
  }
  saveSettings(settings)
  return settings.docker.proxiedTools[toolIndex]
}

export function deleteProxiedTool(id: string): boolean {
  const settings = loadSettings()
  const initialLength = settings.docker.proxiedTools.length
  settings.docker.proxiedTools = settings.docker.proxiedTools.filter((t) => t.id !== id)
  if (settings.docker.proxiedTools.length < initialLength) {
    saveSettings(settings)
    return true
  }
  return false
}

export function getProxiedToolById(id: string): ProxiedTool | null {
  const settings = loadSettings()
  return settings.docker.proxiedTools.find((t) => t.id === id) || null
}
