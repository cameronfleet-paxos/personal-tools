/**
 * Setup Wizard - First-time user onboarding
 *
 * Helps new users discover and import their existing repositories as agents
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { dialog } from 'electron'
import type { DiscoveredRepo, ThemeName, Agent } from '../shared/types'
import { agentIcons, themes, type AgentIconName } from '../shared/constants'
import { saveWorkspace, getWorkspaces } from './config'
import { detectRepository } from './repository-manager'
import { updateSettings } from './settings-manager'
import { isGitRepo, getRemoteUrl } from './git-utils'

/**
 * Show native folder picker dialog
 * Returns selected directory path or null if cancelled
 */
export async function showFolderPicker(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Parent Directory for Your Repositories',
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
}

/**
 * Get common repository parent paths that exist on the system
 * Returns suggested paths like ~/dev, ~/projects, ~/code, ~/src
 */
export async function getCommonRepoPaths(): Promise<string[]> {
  const homeDir = os.homedir()
  const candidates = [
    path.join(homeDir, 'dev'),
    path.join(homeDir, 'projects'),
    path.join(homeDir, 'code'),
    path.join(homeDir, 'src'),
  ]

  const existingPaths: string[] = []
  for (const candidate of candidates) {
    try {
      const stats = await fs.stat(candidate)
      if (stats.isDirectory()) {
        existingPaths.push(candidate)
      }
    } catch {
      // Directory doesn't exist, skip it
    }
  }

  return existingPaths
}

/**
 * Recursively scan a directory for git repositories
 *
 * @param parentPath - Directory to scan
 * @param maxDepth - Maximum recursion depth (default: 2)
 * @returns Array of discovered repositories
 */
export async function scanForRepositories(
  parentPath: string,
  maxDepth: number = 2
): Promise<DiscoveredRepo[]> {
  const discovered: DiscoveredRepo[] = []
  const visited = new Set<string>() // Track visited real paths to prevent symlink loops
  const MAX_VISITED_PATHS = 10000 // Safety limit

  async function scan(dirPath: string, depth: number): Promise<void> {
    if (depth > maxDepth || visited.size >= MAX_VISITED_PATHS) {
      return
    }

    try {
      // Resolve symlinks to detect loops
      const realPath = await fs.realpath(dirPath)
      if (visited.has(realPath)) {
        return // Skip if we've already visited this path
      }
      visited.add(realPath)

      // Check if this directory is a git repository
      if (await isGitRepo(dirPath)) {
        const name = path.basename(dirPath)
        const remoteUrl = await getRemoteUrl(dirPath)
        discovered.push({
          path: dirPath,
          name,
          remoteUrl: remoteUrl || undefined,
        })
        // Don't scan subdirectories of git repos
        return
      }

      // Scan subdirectories
      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue
        }

        // Skip hidden directories and common non-repo directories
        const skipDirs = ['node_modules', 'vendor', 'target', 'build', 'dist', '.cache']
        if (entry.name.startsWith('.') || skipDirs.includes(entry.name)) {
          continue
        }

        const subPath = path.join(dirPath, entry.name)
        await scan(subPath, depth + 1)
      }
    } catch (error) {
      // Handle permission errors gracefully
      console.warn(`Failed to scan directory: ${dirPath}`, error)
    }
  }

  await scan(parentPath, 0)
  return discovered
}

/**
 * Create agents from discovered repositories
 * Auto-generates names, themes, and icons
 *
 * @param repos - Array of discovered repositories to create agents for
 * @param parentPath - Optional parent directory path to save to settings
 * @returns Array of created agent IDs
 */
export async function bulkCreateAgents(
  repos: DiscoveredRepo[],
  parentPath?: string
): Promise<string[]> {
  // Validate input
  if (!Array.isArray(repos)) {
    throw new Error('repos must be an array')
  }

  const createdIds: string[] = []
  const errors: string[] = []
  const existingWorkspaces = getWorkspaces()

  // Get list of repositories that already have agents
  const existingRepoPaths = new Set(
    existingWorkspaces.map(w => w.directory)
  )

  // Track agent names to detect collisions
  const existingNames = new Set(existingWorkspaces.map(w => w.name))

  // Get available themes and icons
  const themeNames = Object.keys(themes) as ThemeName[]
  const iconNames = [...agentIcons]

  for (const repo of repos) {
    try {
      // Validate repo object
      if (!repo?.path || typeof repo.path !== 'string') {
        errors.push(`Invalid repo object: ${JSON.stringify(repo)}`)
        continue
      }

      // Skip if this repository already has an agent
      if (existingRepoPaths.has(repo.path)) {
        continue
      }

      // Detect and register the repository
      const repository = await detectRepository(repo.path)
      if (!repository) {
        errors.push(`Failed to detect repository at: ${repo.path}`)
        continue
      }

      // Generate agent name from directory basename
      let agentName = repo.name

      // Handle duplicate names by appending parent directory
      if (existingNames.has(agentName)) {
        const parentDir = path.basename(path.dirname(repo.path))
        agentName = `${agentName} (${parentDir})`
      }
      existingNames.add(agentName)

      // Pick random theme and icon
      const theme = themeNames[Math.floor(Math.random() * themeNames.length)]
      const icon = iconNames[Math.floor(Math.random() * iconNames.length)]

      // Create agent
      const agent: Agent = {
        id: generateAgentId(),
        name: agentName,
        directory: repo.path,
        purpose: '', // Empty purpose - user can fill in later
        theme,
        icon,
        repositoryId: repository.id,
      }

      // Save agent
      saveWorkspace(agent)
      createdIds.push(agent.id)

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      errors.push(`Failed to create agent for ${repo.path}: ${errorMsg}`)
    }
  }

  // Save parent path to settings if provided
  if (parentPath) {
    await updateSettings({
      wizard: { defaultReposPath: parentPath },
    } as any)
  }

  // Log errors if any occurred
  if (errors.length > 0) {
    console.warn('Errors during bulk agent creation:', errors)
  }

  return createdIds
}

/**
 * Generate a unique agent ID
 */
function generateAgentId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}
