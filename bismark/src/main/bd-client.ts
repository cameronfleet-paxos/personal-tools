import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// All bd commands run with cwd = ~/.bismark/plans/
const PLANS_DIR = path.join(os.homedir(), '.bismark', 'plans')

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
 * Ensure the beads repository exists at ~/.bismark/plans/
 * Auto-initializes on first Team Mode use
 */
export async function ensureBeadsRepo(): Promise<void> {
  if (!fs.existsSync(PLANS_DIR)) {
    fs.mkdirSync(PLANS_DIR, { recursive: true })

    // Initialize git repo
    await execAsync('git init', { cwd: PLANS_DIR })

    // Initialize beads with bismark prefix
    await execAsync('bd --sandbox init --prefix bismark', { cwd: PLANS_DIR })
  }
}

/**
 * Create a new bd task or epic
 */
export async function bdCreate(opts: {
  title: string
  type?: 'epic' | 'task'
  parent?: string
  assignee?: string
  labels?: string[]
}): Promise<string> {
  await ensureBeadsRepo()

  let cmd = `bd --sandbox create`

  if (opts.type === 'epic') {
    cmd += ' --type epic'
  }

  if (opts.parent) {
    cmd += ` --parent ${opts.parent}`
  }

  cmd += ` "${opts.title.replace(/"/g, '\\"')}"`

  const { stdout } = await execAsync(cmd, { cwd: PLANS_DIR })

  // Parse task ID from output (typically format: "Created task: <id>")
  const match = stdout.match(/([a-zA-Z0-9-]+)\s*$/m)
  const taskId = match ? match[1].trim() : stdout.trim()

  // Apply assignee and labels if provided
  if (opts.assignee || (opts.labels && opts.labels.length > 0)) {
    await bdUpdate(taskId, { assignee: opts.assignee, addLabels: opts.labels })
  }

  return taskId
}

/**
 * List bd tasks with optional filters
 */
export async function bdList(opts?: {
  parent?: string
  status?: 'open' | 'closed' | 'all'
  labels?: string[]
}): Promise<BeadTask[]> {
  await ensureBeadsRepo()

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
    const { stdout } = await execAsync(cmd, { cwd: PLANS_DIR })

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
export async function bdUpdate(id: string, opts: {
  assignee?: string
  addLabels?: string[]
  removeLabels?: string[]
  title?: string
}): Promise<void> {
  await ensureBeadsRepo()

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

  await execAsync(cmd, { cwd: PLANS_DIR })
}

/**
 * Close a bd task
 */
export async function bdClose(id: string): Promise<void> {
  await ensureBeadsRepo()
  await execAsync(`bd --sandbox close ${id}`, { cwd: PLANS_DIR })
}

/**
 * Get a single task by ID
 */
export async function bdGet(id: string): Promise<BeadTask | null> {
  await ensureBeadsRepo()

  try {
    const { stdout } = await execAsync(`bd --sandbox show ${id} --json`, { cwd: PLANS_DIR })
    return JSON.parse(stdout)
  } catch {
    return null
  }
}

/**
 * Get the plans directory path
 */
export function getPlansDir(): string {
  return PLANS_DIR
}
