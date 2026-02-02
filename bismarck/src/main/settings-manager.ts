import * as fs from 'fs'
import * as path from 'path'
import { getConfigDir, writeConfigAtomic } from './config'
import type { AppSettings } from '../shared/types'

export function getSettingsPath(): string {
  return path.join(getConfigDir(), 'settings.json')
}

export function getDefaultSettings(): AppSettings {
  return {
    paths: {
      bd: null,
      gh: null,
      git: null,
    },
    docker: {
      images: ['bismarck-agent:latest'],
      resourceLimits: {
        cpu: '2',
        memory: '4g',
      },
      proxiedTools: [],
    },
  }
}

/**
 * Load settings from ~/.bismarck/settings.json
 * Creates file with defaults if it doesn't exist
 */
export function loadSettings(): AppSettings {
  const settingsPath = getSettingsPath()
  try {
    const content = fs.readFileSync(settingsPath, 'utf-8')
    const settings = JSON.parse(content) as AppSettings

    // Ensure all required fields exist (migration/defaults)
    const defaultSettings = getDefaultSettings()
    const merged: AppSettings = {
      paths: { ...defaultSettings.paths, ...settings.paths },
      docker: {
        images: settings.docker?.images || defaultSettings.docker.images,
        resourceLimits: {
          ...defaultSettings.docker.resourceLimits,
          ...settings.docker?.resourceLimits,
        },
        proxiedTools: settings.docker?.proxiedTools || defaultSettings.docker.proxiedTools,
      },
    }

    return merged
  } catch {
    // File doesn't exist or is invalid, create with defaults
    const defaultSettings = getDefaultSettings()
    writeConfigAtomic(settingsPath, defaultSettings)
    return defaultSettings
  }
}

/**
 * Save settings to ~/.bismarck/settings.json
 */
export function saveSettings(settings: AppSettings): void {
  writeConfigAtomic(getSettingsPath(), settings)
}

/**
 * Update partial settings (merge with existing)
 */
export function updateSettings(updates: Partial<AppSettings>): AppSettings {
  const current = loadSettings()
  const updated: AppSettings = {
    paths: { ...current.paths, ...updates.paths },
    docker: {
      images: updates.docker?.images ?? current.docker.images,
      resourceLimits: {
        ...current.docker.resourceLimits,
        ...updates.docker?.resourceLimits,
      },
      proxiedTools: updates.docker?.proxiedTools ?? current.docker.proxiedTools,
    },
  }
  saveSettings(updated)
  return updated
}
