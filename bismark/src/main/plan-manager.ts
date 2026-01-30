import { BrowserWindow } from 'electron'
import {
  loadPlans,
  savePlan,
  getPlanById,
  loadTaskAssignments,
  saveTaskAssignment,
} from './config'
import { bdCreate, bdList, bdUpdate, BeadTask, ensureBeadsRepo, getPlansDir } from './bd-client'
import { getWorkspaces } from './config'
import { injectTextToTerminal, getTerminalForWorkspace } from './terminal'
import type { Plan, TaskAssignment, PlanStatus, Agent, PlanActivity, PlanActivityType } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let pollInterval: NodeJS.Timeout | null = null

const POLL_INTERVAL_MS = 5000 // Poll bd every 5 seconds

// In-memory activity storage per plan
const planActivities: Map<string, PlanActivity[]> = new Map()

/**
 * Generate a unique activity ID
 */
function generateActivityId(): string {
  return `act-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Add an activity to a plan's activity log
 */
export function addPlanActivity(
  planId: string,
  type: PlanActivityType,
  message: string,
  details?: string
): PlanActivity {
  const activity: PlanActivity = {
    id: generateActivityId(),
    planId,
    timestamp: new Date().toISOString(),
    type,
    message,
    details,
  }

  // Store in memory
  if (!planActivities.has(planId)) {
    planActivities.set(planId, [])
  }
  planActivities.get(planId)!.push(activity)

  // Emit to renderer
  emitPlanActivity(activity)

  return activity
}

/**
 * Get all activities for a plan
 */
export function getPlanActivities(planId: string): PlanActivity[] {
  return planActivities.get(planId) || []
}

/**
 * Clear activities for a plan
 */
export function clearPlanActivities(planId: string): void {
  planActivities.delete(planId)
}

/**
 * Set the main window reference for sending IPC events
 */
export function setPlanManagerWindow(window: BrowserWindow | null): void {
  mainWindow = window
}

/**
 * Generate a unique plan ID
 */
function generatePlanId(): string {
  return `plan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Create a new plan in draft status
 */
export function createPlan(title: string, description: string): Plan {
  const now = new Date().toISOString()
  const plan: Plan = {
    id: generatePlanId(),
    title,
    description,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    leaderAgentId: null,
    beadEpicId: null,
  }

  savePlan(plan)
  emitPlanUpdate(plan)
  return plan
}

/**
 * Get all plans
 */
export function getPlans(): Plan[] {
  return loadPlans()
}

/**
 * Get task assignments
 */
export function getTaskAssignments(): TaskAssignment[] {
  return loadTaskAssignments()
}

/**
 * Update a plan's status
 */
export function updatePlanStatus(planId: string, status: PlanStatus): Plan | null {
  const plan = getPlanById(planId)
  if (!plan) return null

  plan.status = status
  plan.updatedAt = new Date().toISOString()
  savePlan(plan)
  emitPlanUpdate(plan)
  return plan
}

/**
 * Execute a plan by sending it to the leader agent
 */
export async function executePlan(planId: string, leaderAgentId: string): Promise<Plan | null> {
  const plan = getPlanById(planId)
  if (!plan) return null

  // Clear any previous activities for this plan
  clearPlanActivities(planId)

  // Get leader agent name for logging
  const allAgents = getWorkspaces()
  const leaderAgent = allAgents.find(a => a.id === leaderAgentId)
  const leaderName = leaderAgent?.name || leaderAgentId

  addPlanActivity(planId, 'info', `Plan execution started with leader: ${leaderName}`)

  // Ensure beads repo exists
  await ensureBeadsRepo()

  // Update plan with leader and set status to delegating
  plan.leaderAgentId = leaderAgentId
  plan.status = 'delegating'
  plan.updatedAt = new Date().toISOString()
  savePlan(plan)
  emitPlanUpdate(plan)

  // Build the leader prompt
  const leaderPrompt = buildLeaderPrompt(plan, allAgents)

  // Inject the prompt into the leader's terminal
  const terminalId = getTerminalForWorkspace(leaderAgentId)
  console.log(`[PlanManager] Looking for terminal for agent ${leaderAgentId}, found: ${terminalId}`)
  if (terminalId) {
    console.log(`[PlanManager] Injecting prompt to terminal ${terminalId}`)
    // Send /clear first, then prompt after delay to ensure /clear executes
    injectTextToTerminal(terminalId, '/clear\r')
    setTimeout(() => {
      injectTextToTerminal(terminalId, leaderPrompt)
    }, 500)
    addPlanActivity(planId, 'success', `Delegation prompt sent to ${leaderName}`)
  } else {
    console.warn(`[PlanManager] No terminal found for leader agent ${leaderAgentId}`)
    addPlanActivity(planId, 'error', `No terminal found for agent: ${leaderName}`, 'Make sure the agent is running before executing the plan')
  }

  // Start polling for task updates
  startTaskPolling()
  addPlanActivity(planId, 'info', 'Watching for tasks...')

  return plan
}

/**
 * Cancel a plan
 */
export function cancelPlan(planId: string): Plan | null {
  const plan = getPlanById(planId)
  if (!plan) return null

  plan.status = 'failed'
  plan.updatedAt = new Date().toISOString()
  savePlan(plan)
  emitPlanUpdate(plan)
  addPlanActivity(planId, 'error', 'Plan cancelled', 'Execution was stopped by user')
  return plan
}

/**
 * Build the prompt to inject into the leader agent's terminal
 * Returns only instructions with trailing newline (no /clear - handled separately)
 */
function buildLeaderPrompt(plan: Plan, agents: Agent[]): string {
  const agentList = agents
    .map((a) => `- ${a.name} (id: ${a.id}): ${a.purpose || 'General purpose agent'}`)
    .join('\n')

  const plansDir = getPlansDir()

  const instructions = `[BISMARK PLAN REQUEST]
Plan ID: ${plan.id}
Title: ${plan.title}
Description: ${plan.description}

Available Agents:
${agentList}

Instructions:
IMPORTANT: All bd commands must run in ${plansDir} directory.

1. Create bd epic: cd ${plansDir} && bd --sandbox create --type epic "${plan.title}"
2. Create tasks: cd ${plansDir} && bd --sandbox create --parent <epic-id> "task title"
3. Assign: cd ${plansDir} && bd --sandbox update <task-id> --assignee <agent-name>
4. Mark ready: cd ${plansDir} && bd --sandbox update <task-id> --add-label bismark-ready

After marking a task with 'bismark-ready', Bismark will automatically send it to the assigned agent.`

  return `${instructions}\r`
}

/**
 * Start polling bd for task updates
 */
export function startTaskPolling(): void {
  if (pollInterval) return // Already polling

  pollInterval = setInterval(async () => {
    await syncTasksFromBd()
  }, POLL_INTERVAL_MS)

  // Do an immediate sync
  syncTasksFromBd()
}

/**
 * Stop polling bd for task updates
 */
export function stopTaskPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}

/**
 * Sync tasks from bd and dispatch to agents
 */
async function syncTasksFromBd(): Promise<void> {
  // Get active plan for logging
  const plans = loadPlans()
  const activePlan = plans.find(p => p.status === 'delegating' || p.status === 'in_progress')

  try {
    // Get tasks marked as ready for Bismark
    const readyTasks = await bdList({ labels: ['bismark-ready'], status: 'open' })

    for (const task of readyTasks) {
      await processReadyTask(task, activePlan?.id)
    }

    // Check for completed tasks and update assignments
    const allAssignments = loadTaskAssignments()
    for (const assignment of allAssignments) {
      if (assignment.status === 'sent' || assignment.status === 'in_progress') {
        // Check if task is now closed in bd
        const tasks = await bdList({ status: 'closed' })
        const closedTask = tasks.find((t) => t.id === assignment.beadId)
        if (closedTask) {
          assignment.status = 'completed'
          assignment.completedAt = new Date().toISOString()
          saveTaskAssignment(assignment)
          emitTaskAssignmentUpdate(assignment)

          // Log completion
          if (activePlan) {
            const agent = getWorkspaces().find(a => a.id === assignment.agentId)
            addPlanActivity(
              activePlan.id,
              'success',
              `Task ${closedTask.id} completed`,
              agent ? `Completed by ${agent.name}` : undefined
            )
          }
        }
      }
    }

    // Update plan statuses based on task completion
    await updatePlanStatuses()
  } catch (error) {
    console.error('Error syncing tasks from bd:', error)
    if (activePlan) {
      addPlanActivity(
        activePlan.id,
        'error',
        'Failed to sync tasks',
        error instanceof Error ? error.message : 'bd command failed'
      )
    }
  }
}

/**
 * Process a task that's ready to be sent to an agent
 */
async function processReadyTask(task: BeadTask, planId?: string): Promise<void> {
  if (!task.assignee) {
    console.warn(`Task ${task.id} is ready but has no assignee`)
    if (planId) {
      addPlanActivity(planId, 'warning', `Task ${task.id} has no assignee`, 'Task is marked ready but no agent is assigned')
    }
    return
  }

  // Check if we already have an assignment for this task
  const existingAssignments = loadTaskAssignments()
  const existing = existingAssignments.find((a) => a.beadId === task.id)
  if (existing && existing.status !== 'pending') {
    return // Already processed
  }

  // Find the agent by name
  const agents = getWorkspaces()
  const agent = agents.find(
    (a) => a.name.toLowerCase() === task.assignee?.toLowerCase() || a.id === task.assignee
  )

  if (!agent) {
    console.warn(`Task ${task.id} assigned to unknown agent: ${task.assignee}`)
    if (planId) {
      addPlanActivity(planId, 'warning', `Unknown agent: ${task.assignee}`, `Task ${task.id} cannot be dispatched`)
    }
    return
  }

  // Log task discovery
  if (planId) {
    addPlanActivity(planId, 'success', `Found task: ${task.id} -> ${agent.name}`, task.title)
  }

  // Create or update assignment
  const assignment: TaskAssignment = {
    beadId: task.id,
    agentId: agent.id,
    status: 'pending',
    assignedAt: new Date().toISOString(),
  }

  // Try to send to agent terminal
  const terminalId = getTerminalForWorkspace(agent.id)
  if (terminalId) {
    const taskPrompt = buildTaskPrompt(task)
    // Send /clear first, then prompt after delay to ensure /clear executes
    injectTextToTerminal(terminalId, '/clear\r')
    setTimeout(() => {
      injectTextToTerminal(terminalId, taskPrompt)
    }, 500)
    assignment.status = 'sent'

    // Remove the bismark-ready label since we've sent it
    await bdUpdate(task.id, { removeLabels: ['bismark-ready'], addLabels: ['bismark-sent'] })

    if (planId) {
      addPlanActivity(planId, 'success', `Task ${task.id} sent to ${agent.name}`)
    }
  } else {
    if (planId) {
      addPlanActivity(planId, 'warning', `No terminal for ${agent.name}`, `Task ${task.id} queued until agent starts`)
    }
  }

  saveTaskAssignment(assignment)
  emitTaskAssignmentUpdate(assignment)
}

/**
 * Build the prompt to inject into a worker agent's terminal for a task
 * Returns only instructions with trailing newline (no /clear - handled separately)
 */
function buildTaskPrompt(task: BeadTask): string {
  const plansDir = getPlansDir()

  const instructions = `[BISMARK TASK ASSIGNMENT]
Task ID: ${task.id}
Title: ${task.title}

Please complete this task. When finished, close it with:
cd ${plansDir} && bd --sandbox close ${task.id}`

  return `${instructions}\r`
}

/**
 * Update plan statuses based on task completion
 */
async function updatePlanStatuses(): Promise<void> {
  const plans = loadPlans()

  for (const plan of plans) {
    if (plan.status === 'delegating' || plan.status === 'in_progress') {
      if (plan.beadEpicId) {
        // Check if all child tasks are complete
        const childTasks = await bdList({ parent: plan.beadEpicId })
        const allClosed = childTasks.length > 0 && childTasks.every((t) => t.status === 'closed')
        const hasOpenTasks = childTasks.some((t) => t.status === 'open')

        if (allClosed) {
          plan.status = 'completed'
          plan.updatedAt = new Date().toISOString()
          savePlan(plan)
          emitPlanUpdate(plan)
          addPlanActivity(plan.id, 'success', 'All tasks completed', `Plan "${plan.title}" finished successfully`)
        } else if (hasOpenTasks && plan.status === 'delegating') {
          plan.status = 'in_progress'
          plan.updatedAt = new Date().toISOString()
          savePlan(plan)
          emitPlanUpdate(plan)
          addPlanActivity(plan.id, 'info', 'Tasks are being worked on', `${childTasks.filter(t => t.status === 'open').length} task(s) in progress`)
        }
      }
    }
  }
}

/**
 * Emit plan update event to renderer
 */
function emitPlanUpdate(plan: Plan): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('plan-update', plan)
  }
}

/**
 * Emit task assignment update event to renderer
 */
function emitTaskAssignmentUpdate(assignment: TaskAssignment): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('task-assignment-update', assignment)
  }
}

/**
 * Emit plan activity event to renderer
 */
function emitPlanActivity(activity: PlanActivity): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('plan-activity', activity)
  }
}
