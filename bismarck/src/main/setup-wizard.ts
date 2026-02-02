/**
 * Setup Wizard - First-time user experience for Bismarck
 *
 * Provides functionality to:
 * - Show native folder picker dialog
 * - Scan directories for git repositories (2 levels deep)
 * - Get suggested common repository paths
 * - Bulk create agents from discovered repositories
 */

import { dialog } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { randomUUID } from 'crypto'
import type { DiscoveredRepo, Workspace, ThemeName } from '../shared/types'
import type { AgentIconName } from '../shared/constants'
import { themes } from '../shared/constants'
import { getRandomUniqueIcon, getWorkspaces, saveWorkspace } from './config'
import { isGitRepo, getRepoRoot, getRemoteUrl } from './git-utils'
import { detectRepository } from './repository-manager'
import { updateWizardSettings } from './settings-manager'

/**
 * Show native folder picker dialog
 * @returns Selected directory path or null if cancelled
 */
export async function showFolderPicker(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Repository Parent Folder',
    buttonLabel: 'Select Folder',
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
}

/**
 * Get common repository paths that exist on the system
 * @returns Array of suggested paths that exist
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

  for (const candidatePath of candidates) {
    try {
      const stat = await fs.stat(candidatePath)
      if (stat.isDirectory()) {
        existingPaths.push(candidatePath)
      }
    } catch {
      // Path doesn't exist, skip it
    }
  }

  return existingPaths
}

/**
 * Scan a directory for git repositories up to a specified depth
 * @param parentPath - The parent directory to scan
 * @param maxDepth - Maximum depth to scan (default: 2)
 * @returns Array of discovered repositories
 */
export async function scanForRepositories(
  parentPath: string,
  maxDepth: number = 2
): Promise<DiscoveredRepo[]> {
  const discovered: DiscoveredRepo[] = []
  const visited = new Set<string>() // Prevent infinite loops from symlinks

  async function scanDirectory(dirPath: string, currentDepth: number): Promise<void> {
    // Resolve real path to handle symlinks
    let realPath: string
    try {
      realPath = await fs.realpath(dirPath)
    } catch (error) {
      // Permission denied or path doesn't exist
      return
    }

    // Skip if already visited (symlink loop prevention)
    if (visited.has(realPath)) {
      return
    }
    visited.add(realPath)

    // Check if this directory is a git repository
    if (await isGitRepo(dirPath)) {
      const repoRoot = await getRepoRoot(dirPath)
      if (repoRoot) {
        // Make sure we haven't already discovered this repo
        const alreadyDiscovered = discovered.some(r => r.path === repoRoot)
        if (!alreadyDiscovered) {
          const name = path.basename(repoRoot)
          const remoteUrl = (await getRemoteUrl(repoRoot)) || undefined

          discovered.push({
            path: repoRoot,
            name,
            remoteUrl,
          })
        }
      }
      // Don't recurse into git repositories
      return
    }

    // If we haven't reached max depth, scan subdirectories
    if (currentDepth < maxDepth) {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true })

        for (const entry of entries) {
          if (entry.isDirectory()) {
            // Skip hidden directories (except .git which we check above)
            if (entry.name.startsWith('.')) {
              continue
            }

            // Skip common directories that won't contain repos
            const skipDirs = ['node_modules', 'vendor', 'target', 'build', 'dist', '.cache']
            if (skipDirs.includes(entry.name)) {
              continue
            }

            const subPath = path.join(dirPath, entry.name)
            await scanDirectory(subPath, currentDepth + 1)
          }
        }
      } catch (error) {
        // Permission denied or other error reading directory
        // Skip this directory silently
      }
    }
  }

  await scanDirectory(parentPath, 0)
  return discovered
}

/**
 * Get a random theme for a new agent
 */
function getRandomTheme(): ThemeName {
  const themeNames = Object.keys(themes) as ThemeName[]
  return themeNames[Math.floor(Math.random() * themeNames.length)]
}

/**
 * Bulk create agents from discovered repositories
 * Auto-generates name from folder, random theme/icon, empty purpose
 * Filters out repositories that already have agents configured
 * @param repos - Array of discovered repositories
 * @param parentPath - Optional parent directory path to save to settings
 * @returns Array of created workspace IDs
 */
export async function bulkCreateAgents(
  repos: DiscoveredRepo[],
  parentPath?: string
): Promise<string[]> {
  const existingWorkspaces = getWorkspaces()
  const existingDirectories = new Set(existingWorkspaces.map(w => w.directory))

  const createdIds: string[] = []

  for (const repo of repos) {
    // Skip if already has an agent
    if (existingDirectories.has(repo.path)) {
      continue
    }

    // Detect/register repository first (this creates the Repository entry)
    await detectRepository(repo.path)

    // Create workspace
    const workspace: Workspace = {
      id: randomUUID(),
      name: repo.name,
      directory: repo.path,
      purpose: '', // Empty purpose as specified
      theme: getRandomTheme(),
      icon: getRandomUniqueIcon(existingWorkspaces) as AgentIconName,
    }

    saveWorkspace(workspace)
    existingDirectories.add(repo.path) // Update set for next iteration
    createdIds.push(workspace.id)
  }

  // Save parent path to settings if provided
  if (parentPath) {
    await updateWizardSettings({ defaultReposPath: parentPath })
  }

  return createdIds
}
