import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

/**
 * Settings Manager for Claude Code settings.json
 * Provides utilities to load, save, and manage default settings
 * for Claude Code configuration at ~/.claude/settings.json
 */

// Claude settings structure
export interface ClaudeSettings {
  hooks?: {
    Stop?: HookConfig[]
    Notification?: HookConfig[]
    SessionStart?: HookConfig[]
    [key: string]: HookConfig[] | undefined
  }
  [key: string]: unknown
}

export interface HookCommand {
  type: 'command'
  command: string
}

export interface HookConfig {
  matcher?: string
  hooks: HookCommand[]
}

/**
 * Get the path to Claude Code settings file
 */
export function getClaudeSettingsPath(): string {
  const homeDir = app?.getPath('home') || process.env.HOME || ''
  return path.join(homeDir, '.claude', 'settings.json')
}

/**
 * Load Claude Code settings from ~/.claude/settings.json
 * Returns empty settings object if file doesn't exist or is invalid
 */
export function loadClaudeSettings(): ClaudeSettings {
  const settingsPath = getClaudeSettingsPath()

  if (!fs.existsSync(settingsPath)) {
    return getDefaultClaudeSettings()
  }

  try {
    const content = fs.readFileSync(settingsPath, 'utf-8')
    return JSON.parse(content) as ClaudeSettings
  } catch (error) {
    console.error('Failed to load Claude settings:', error)
    return getDefaultClaudeSettings()
  }
}

/**
 * Save Claude Code settings to ~/.claude/settings.json
 * Creates the .claude directory if it doesn't exist
 */
export function saveClaudeSettings(settings: ClaudeSettings): void {
  const settingsPath = getClaudeSettingsPath()
  const claudeDir = path.dirname(settingsPath)

  // Ensure .claude directory exists
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true })
  }

  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
  } catch (error) {
    console.error('Failed to save Claude settings:', error)
    throw error
  }
}

/**
 * Get default Claude Code settings structure
 */
export function getDefaultClaudeSettings(): ClaudeSettings {
  return {
    hooks: {},
  }
}

/**
 * Check if Claude settings file exists
 */
export function claudeSettingsExist(): boolean {
  const settingsPath = getClaudeSettingsPath()
  return fs.existsSync(settingsPath)
}

/**
 * Update Claude settings with partial changes
 * Merges new settings with existing ones
 */
export function updateClaudeSettings(updates: Partial<ClaudeSettings>): ClaudeSettings {
  const currentSettings = loadClaudeSettings()
  const updatedSettings = { ...currentSettings, ...updates }
  saveClaudeSettings(updatedSettings)
  return updatedSettings
}

/**
 * Atomic write to prevent corruption
 * Writes to a temporary file first, then renames
 */
export function saveClaudeSettingsAtomic(settings: ClaudeSettings): void {
  const settingsPath = getClaudeSettingsPath()
  const claudeDir = path.dirname(settingsPath)

  // Ensure .claude directory exists
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true })
  }

  const tempPath = `${settingsPath}.tmp`
  try {
    fs.writeFileSync(tempPath, JSON.stringify(settings, null, 2))
    fs.renameSync(tempPath, settingsPath)
  } catch (error) {
    // Clean up temp file if it exists
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath)
    }
    console.error('Failed to save Claude settings atomically:', error)
    throw error
  }
}
