import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * Get the plan-specific directory path
 */
export function getPlanDir(planId: string): string {
  return path.join(os.homedir(), '.bismark', 'plans', planId)
}

export interface BeadTask {
  id: string
  title: string
  status: 'open' | 'closed'
  type?: 'epic' | 'task'
  parent?: string
  assignee?: string
  labels?: string[]
}

/**
 * Ensure the beads repository exists for a specific plan
 * Auto-initializes on first use
 * Returns the plan directory path
 */
export async function ensureBeadsRepo(planId: string): Promise<string> {
  const planDir = getPlanDir(planId)
  if (!fs.existsSync(planDir)) {
    fs.mkdirSync(planDir, { recursive: true })

    // Initialize git repo
    await execAsync('git init', { cwd: planDir })

    // Initialize beads with bismark prefix
    await execAsync('bd --sandbox init --prefix bismark', { cwd: planDir })

    // Create .claude directory and settings.json to pre-allow bd commands
    const claudeDir = path.join(planDir, '.claude')
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true })
    }

    const settingsPath = path.join(claudeDir, 'settings.json')
    if (!fs.existsSync(settingsPath)) {
      const settings = {
        permissions: {
          allow: [
            'Bash(bd *)',
            'Bash(bd --sandbox *)',
            `Read(${planDir}/**)`,
            `Edit(${planDir}/**)`
          ]
        }
      }
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
    }
  }
  return planDir
}

/**
 * Create a new bd task or epic
 */
export async function bdCreate(planId: string, opts: {
  title: string
  type?: 'epic' | 'task'
  parent?: string
  assignee?: string
  labels?: string[]
}): Promise<string> {
  const planDir = await ensureBeadsRepo(planId)

  let cmd = `bd --sandbox create`

  if (opts.type === 'epic') {
    cmd += ' --type epic'
  }

  if (opts.parent) {
    cmd += ` --parent ${opts.parent}`
  }

  cmd += ` "${opts.title.replace(/"/g, '\\"')}"`

  const { stdout } = await execAsync(cmd, { cwd: planDir })

  // Parse task ID from output (typically format: "Created task: <id>")
  const match = stdout.match(/([a-zA-Z0-9-]+)\s*$/m)
  const taskId = match ? match[1].trim() : stdout.trim()

  // Apply assignee and labels if provided
  if (opts.assignee || (opts.labels && opts.labels.length > 0)) {
    await bdUpdate(planId, taskId, { assignee: opts.assignee, addLabels: opts.labels })
  }

  return taskId
}

/**
 * List bd tasks with optional filters
 */
export async function bdList(planId: string, opts?: {
  parent?: string
  status?: 'open' | 'closed' | 'all'
  labels?: string[]
}): Promise<BeadTask[]> {
  const planDir = await ensureBeadsRepo(planId)

  let cmd = 'bd --sandbox list --json'

  if (opts?.parent) {
    cmd += ` --parent ${opts.parent}`
  }

  if (opts?.status && opts.status !== 'all') {
    cmd += opts.status === 'closed' ? ' --closed' : ''
  }

  if (opts?.labels && opts.labels.length > 0) {
    for (const label of opts.labels) {
      cmd += ` --label ${label}`
    }
  }

  try {
    const { stdout } = await execAsync(cmd, { cwd: planDir })

    if (!stdout.trim()) {
      return []
    }

    // Parse JSON output from bd
    const tasks = JSON.parse(stdout)
    return Array.isArray(tasks) ? tasks : []
  } catch (error) {
    // If bd list fails (e.g., no tasks), return empty array
    console.error('bdList error:', error)
    return []
  }
}

/**
 * Update a bd task
 */
export async function bdUpdate(planId: string, id: string, opts: {
  assignee?: string
  addLabels?: string[]
  removeLabels?: string[]
  title?: string
}): Promise<void> {
  const planDir = await ensureBeadsRepo(planId)

  let cmd = `bd --sandbox update ${id}`

  if (opts.assignee) {
    cmd += ` --assignee "${opts.assignee.replace(/"/g, '\\"')}"`
  }

  if (opts.addLabels && opts.addLabels.length > 0) {
    for (const label of opts.addLabels) {
      cmd += ` --add-label ${label}`
    }
  }

  if (opts.removeLabels && opts.removeLabels.length > 0) {
    for (const label of opts.removeLabels) {
      cmd += ` --remove-label ${label}`
    }
  }

  if (opts.title) {
    cmd += ` --title "${opts.title.replace(/"/g, '\\"')}"`
  }

  await execAsync(cmd, { cwd: planDir })
}

/**
 * Close a bd task
 */
export async function bdClose(planId: string, id: string): Promise<void> {
  const planDir = await ensureBeadsRepo(planId)
  await execAsync(`bd --sandbox close ${id}`, { cwd: planDir })
}

/**
 * Get a single task by ID
 */
export async function bdGet(planId: string, id: string): Promise<BeadTask | null> {
  const planDir = await ensureBeadsRepo(planId)

  try {
    const { stdout } = await execAsync(`bd --sandbox show ${id} --json`, { cwd: planDir })
    return JSON.parse(stdout)
  } catch {
    return null
  }
}

/**
 * Add a dependency: taskId is blocked by blockedBy
 */
export async function bdAddDependency(planId: string, taskId: string, blockedBy: string): Promise<void> {
  const planDir = await ensureBeadsRepo(planId)
  await execAsync(`bd --sandbox dep ${blockedBy} --blocks ${taskId}`, { cwd: planDir })
}

/**
 * Get dependents of a task (tasks that depend on this one / are blocked by it)
 */
export async function bdGetDependents(planId: string, taskId: string): Promise<string[]> {
  const planDir = await ensureBeadsRepo(planId)

  try {
    const { stdout } = await execAsync(`bd --sandbox dep list ${taskId} --direction=up --json`, { cwd: planDir })

    if (!stdout.trim()) {
      return []
    }

    // Parse JSON output - expects array of task objects or IDs
    const result = JSON.parse(stdout)
    if (Array.isArray(result)) {
      // If it's an array of objects with id field, extract IDs
      return result.map((item: { id?: string } | string) =>
        typeof item === 'string' ? item : item.id || ''
      ).filter(Boolean)
    }
    return []
  } catch {
    // If command fails (no dependencies), return empty array
    return []
  }
}
