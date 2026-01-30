import { BrowserWindow } from 'electron'
import {
  loadPlans,
  savePlan,
  getPlanById,
  loadTaskAssignments,
  saveTaskAssignment,
  saveWorkspace,
  deleteWorkspace,
  getRandomUniqueIcon,
  getWorkspaces,
} from './config'
import { bdCreate, bdList, bdUpdate, BeadTask, ensureBeadsRepo, getPlanDir } from './bd-client'
import { injectTextToTerminal, injectPromptToTerminal, getTerminalForWorkspace, waitForTerminalOutput, createTerminal, closeTerminal, getTerminalEmitter } from './terminal'
import { createTab, addWorkspaceToTab, addActiveWorkspace, removeActiveWorkspace, removeWorkspaceFromTab, setActiveTab, deleteTab, getState } from './state-manager'
import type { Plan, TaskAssignment, PlanStatus, Agent, PlanActivity, PlanActivityType, Workspace } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let pollInterval: NodeJS.Timeout | null = null

const POLL_INTERVAL_MS = 5000 // Poll bd every 5 seconds

// In-memory activity storage per plan
const planActivities: Map<string, PlanActivity[]> = new Map()

// In-memory guard to prevent duplicate plan execution (React StrictMode double-invocation)
const executingPlans: Set<string> = new Set()

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
    referenceAgentId: null,
    beadEpicId: null,
    orchestratorWorkspaceId: null,
    orchestratorTabId: null,
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
 * Get task assignments for a specific plan
 */
export function getTaskAssignments(planId: string): TaskAssignment[] {
  return loadTaskAssignments(planId)
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
 * Execute a plan using a reference agent's working directory
 */
export async function executePlan(planId: string, referenceAgentId: string): Promise<Plan | null> {
  const plan = getPlanById(planId)
  if (!plan) return null

  // Guard against duplicate execution (can happen due to React StrictMode double-invocation)
  // Use in-memory set because status check alone isn't fast enough - the second call
  // arrives before the first call has persisted the status change
  if (executingPlans.has(planId) || plan.status === 'delegating' || plan.status === 'in_progress') {
    console.log(`[PlanManager] Plan ${planId} already executing, skipping duplicate call`)
    return plan
  }

  // Mark as executing immediately to block any concurrent calls
  executingPlans.add(planId)

  // Clear any previous activities for this plan
  clearPlanActivities(planId)

  // Get reference agent name for logging
  const allAgents = getWorkspaces()
  const referenceAgent = allAgents.find(a => a.id === referenceAgentId)
  const referenceName = referenceAgent?.name || referenceAgentId
  const referenceWorkspace = allAgents.find(a => a.id === referenceAgentId)

  if (!referenceWorkspace) {
    addPlanActivity(planId, 'error', `Reference agent not found: ${referenceAgentId}`)
    return null
  }

  addPlanActivity(planId, 'info', `Plan execution started with reference: ${referenceName}`)

  // Ensure beads repo exists for this plan (creates ~/.bismark/plans/{plan_id}/)
  const planDir = await ensureBeadsRepo(plan.id)

  // Update plan with reference agent and set status to delegating
  plan.referenceAgentId = referenceAgentId
  plan.status = 'delegating'
  plan.updatedAt = new Date().toISOString()
  savePlan(plan)
  emitPlanUpdate(plan)

  // Create a dedicated tab for the orchestrator
  const orchestratorTab = createTab(`Orchestrator: ${plan.title.substring(0, 20)}`)
  plan.orchestratorTabId = orchestratorTab.id

  // Create orchestrator workspace (runs in plan directory to work with bd tasks)
  const orchestratorWorkspace: Workspace = {
    id: `orchestrator-${planId}`,
    name: `Orchestrator (${plan.title})`,
    directory: planDir, // Orchestrator runs in plan directory
    purpose: 'Plan orchestration - monitors task completion',
    theme: 'gray',
    icon: getRandomUniqueIcon(allAgents),
    isOrchestrator: true, // Mark as orchestrator for filtering in processReadyTask
  }
  saveWorkspace(orchestratorWorkspace)
  plan.orchestratorWorkspaceId = orchestratorWorkspace.id
  savePlan(plan)

  // Create terminal for orchestrator and add to its dedicated tab
  console.log(`[PlanManager] mainWindow is: ${mainWindow ? 'defined' : 'NULL'}`)
  if (mainWindow) {
    try {
      // Build the orchestrator prompt and pass it to createTerminal
      // Claude will automatically process it when it's ready
      // Pass --add-dir flag so orchestrator has permission to access plan directory without prompts
      const claudeFlags = `--add-dir "${planDir}"`
      const orchestratorPrompt = buildOrchestratorPrompt(plan, allAgents)
      console.log(`[PlanManager] Creating terminal for orchestrator ${orchestratorWorkspace.id}`)
      const orchestratorTerminalId = createTerminal(orchestratorWorkspace.id, mainWindow, orchestratorPrompt, claudeFlags)
      console.log(`[PlanManager] Created terminal: ${orchestratorTerminalId}`)
      addActiveWorkspace(orchestratorWorkspace.id)
      addWorkspaceToTab(orchestratorWorkspace.id, orchestratorTab.id)
      addPlanActivity(planId, 'info', 'Orchestrator agent started')
      addPlanActivity(planId, 'success', 'Orchestrator monitoring started')

      // Notify renderer about the new terminal
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal-created', {
          terminalId: orchestratorTerminalId,
          workspaceId: orchestratorWorkspace.id,
        })
      }

      // Create plan agent workspace (runs in reference agent's directory to analyze codebase)
      const planAgentWorkspace: Workspace = {
        id: `plan-agent-${planId}`,
        name: `Plan Agent (${plan.title})`,
        directory: referenceWorkspace.directory, // Plan agent runs in codebase directory
        purpose: 'Initial discovery and task creation',
        theme: 'blue',
        icon: getRandomUniqueIcon(allAgents),
        isPlanAgent: true,
      }
      saveWorkspace(planAgentWorkspace)
      plan.planAgentWorkspaceId = planAgentWorkspace.id
      savePlan(plan)

      // Create terminal with plan agent prompt
      // Pass --add-dir flag so plan agent has permission to access plan directory without prompts
      const planAgentPrompt = buildPlanAgentPrompt(plan, allAgents)
      console.log(`[PlanManager] Creating terminal for plan agent ${planAgentWorkspace.id}`)
      const planAgentTerminalId = createTerminal(planAgentWorkspace.id, mainWindow, planAgentPrompt, claudeFlags)
      console.log(`[PlanManager] Created plan agent terminal: ${planAgentTerminalId}`)
      addActiveWorkspace(planAgentWorkspace.id)
      addWorkspaceToTab(planAgentWorkspace.id, orchestratorTab.id)
      addPlanActivity(planId, 'info', 'Plan agent started')

      // Notify renderer about the plan agent terminal
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal-created', {
          terminalId: planAgentTerminalId,
          workspaceId: planAgentWorkspace.id,
        })
      }

      // Set up listener for plan agent exit
      const planAgentEmitter = getTerminalEmitter(planAgentTerminalId)
      if (planAgentEmitter) {
        const exitHandler = (data: string) => {
          // Claude shows "Goodbye!" when /exit is used
          if (data.includes('Goodbye') || data.includes('Session ended')) {
            planAgentEmitter.removeListener('data', exitHandler)
            cleanupPlanAgent(plan)
          }
        }
        planAgentEmitter.on('data', exitHandler)
      }

      // Emit state update so renderer knows about the new tab
      emitStateUpdate()
    } catch (error) {
      console.error(`[PlanManager] Failed to create orchestrator terminal:`, error)
      addPlanActivity(planId, 'error', 'Failed to start orchestrator', error instanceof Error ? error.message : 'Unknown error')
    }
  } else {
    console.error(`[PlanManager] Cannot create orchestrator terminal - mainWindow is null`)
    addPlanActivity(planId, 'error', 'Cannot start orchestrator - window not available')
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

  // Cleanup plan agent (if still running)
  cleanupPlanAgentSilent(plan)

  // Cleanup orchestrator
  cleanupOrchestrator(plan)

  plan.status = 'failed'
  plan.updatedAt = new Date().toISOString()
  savePlan(plan)
  emitPlanUpdate(plan)
  addPlanActivity(planId, 'error', 'Plan cancelled', 'Execution was stopped by user')

  // Remove from executing set
  executingPlans.delete(planId)

  return plan
}

/**
 * Cleanup orchestrator workspace, terminal, and tab for a plan
 */
function cleanupOrchestrator(plan: Plan): void {
  // Also cleanup plan agent if it's still running
  cleanupPlanAgentSilent(plan)

  if (plan.orchestratorWorkspaceId) {
    // Close terminal
    const terminalId = getTerminalForWorkspace(plan.orchestratorWorkspaceId)
    if (terminalId) {
      closeTerminal(terminalId)
    }

    // Remove from active workspaces
    removeActiveWorkspace(plan.orchestratorWorkspaceId)

    // Delete workspace
    deleteWorkspace(plan.orchestratorWorkspaceId)
    plan.orchestratorWorkspaceId = null
  }

  // Delete the dedicated orchestrator tab
  if (plan.orchestratorTabId) {
    deleteTab(plan.orchestratorTabId)
    plan.orchestratorTabId = null

    // Emit state update so renderer knows the tab was removed
    emitStateUpdate()
  }
}

/**
 * Build the prompt to inject into the reference agent's terminal
 * Returns only instructions with trailing newline (no /clear - handled separately)
 * NOTE: This function is currently unused but kept for reference
 */
function buildReferencePrompt(plan: Plan, agents: Agent[]): string {
  // Filter out orchestrator agents from available agents
  const availableAgents = agents.filter(a => !a.isOrchestrator)

  const agentList = availableAgents
    .map((a) => `- ${a.name} (id: ${a.id}): ${a.purpose || 'General purpose agent'}`)
    .join('\n')

  const planDir = getPlanDir(plan.id)

  const instructions = `[BISMARK PLAN REQUEST]
Plan ID: ${plan.id}
Title: ${plan.title}
Description: ${plan.description}

Available Agents:
${agentList}

Instructions:
IMPORTANT: All bd commands must run in ${planDir} directory.

1. Create bd epic: cd ${planDir} && bd --sandbox create --type epic "${plan.title}"
2. Create tasks: cd ${planDir} && bd --sandbox create --parent <epic-id> "task title"
3. Set dependencies: cd ${planDir} && bd --sandbox dep <blocking-task-id> --blocks <blocked-task-id>
4. Assign: cd ${planDir} && bd --sandbox update <task-id> --assignee <agent-name>
5. Mark FIRST task ready: cd ${planDir} && bd --sandbox update <first-task-id> --add-label bismark-ready

The orchestrator will automatically mark dependent tasks ready when their blockers complete.
After marking a task with 'bismark-ready', Bismark will automatically send it to the assigned agent.`

  return instructions
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

  // If no active plan, nothing to sync
  if (!activePlan) {
    return
  }

  try {
    // Get tasks marked as ready for Bismark (from the active plan's directory)
    const readyTasks = await bdList(activePlan.id, { labels: ['bismark-ready'], status: 'open' })

    for (const task of readyTasks) {
      await processReadyTask(activePlan.id, task)
    }

    // Check for completed tasks and update assignments
    const allAssignments = loadTaskAssignments(activePlan.id)
    for (const assignment of allAssignments) {
      if (assignment.status === 'sent' || assignment.status === 'in_progress') {
        // Check if task is now closed in bd
        const tasks = await bdList(activePlan.id, { status: 'closed' })
        const closedTask = tasks.find((t) => t.id === assignment.beadId)
        if (closedTask) {
          assignment.status = 'completed'
          assignment.completedAt = new Date().toISOString()
          saveTaskAssignment(activePlan.id, assignment)
          emitTaskAssignmentUpdate(assignment)

          // Log completion
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

    // Update plan statuses based on task completion
    await updatePlanStatuses()
  } catch (error) {
    console.error('Error syncing tasks from bd:', error)
    addPlanActivity(
      activePlan.id,
      'error',
      'Failed to sync tasks',
      error instanceof Error ? error.message : 'bd command failed'
    )
  }
}

/**
 * Process a task that's ready to be sent to an agent
 */
async function processReadyTask(planId: string, task: BeadTask): Promise<void> {
  if (!task.assignee) {
    console.warn(`Task ${task.id} is ready but has no assignee`)
    addPlanActivity(planId, 'warning', `Task ${task.id} has no assignee`, 'Task is marked ready but no agent is assigned')
    return
  }

  // Check if we already have an assignment for this task
  const existingAssignments = loadTaskAssignments(planId)
  const existing = existingAssignments.find((a) => a.beadId === task.id)
  if (existing) {
    return // Already processing or processed
  }

  // Find the agent by name
  const agents = getWorkspaces()
  const agent = agents.find(
    (a) => a.name.toLowerCase() === task.assignee?.toLowerCase() || a.id === task.assignee
  )

  if (!agent) {
    console.warn(`Task ${task.id} assigned to unknown agent: ${task.assignee}`)
    addPlanActivity(planId, 'warning', `Unknown agent: ${task.assignee}`, `Task ${task.id} cannot be dispatched`)
    return
  }

  // Log task discovery
  addPlanActivity(planId, 'success', `Found task: ${task.id} -> ${agent.name}`, task.title)

  // Create assignment immediately to prevent duplicate dispatches during async wait
  const assignment: TaskAssignment = {
    beadId: task.id,
    agentId: agent.id,
    status: 'pending',
    assignedAt: new Date().toISOString(),
  }
  saveTaskAssignment(planId, assignment)
  emitTaskAssignmentUpdate(assignment)

  // Try to send to agent terminal
  const terminalId = getTerminalForWorkspace(agent.id)
  if (terminalId) {
    const taskPrompt = buildTaskPrompt(planId, task)
    // Send /clear first, wait for it to complete (indicated by "(no content)" output), then send prompt
    // Use 120s timeout since an existing prompt may need to finish first
    await injectTextToTerminal(terminalId, '/clear\r')
    await waitForTerminalOutput(terminalId, '(no content)', 120000)
    await injectPromptToTerminal(terminalId, taskPrompt)
    assignment.status = 'sent'
    saveTaskAssignment(planId, assignment)
    emitTaskAssignmentUpdate(assignment)

    // Remove the bismark-ready label since we've sent it
    await bdUpdate(planId, task.id, { removeLabels: ['bismark-ready'], addLabels: ['bismark-sent'] })

    addPlanActivity(planId, 'success', `Task ${task.id} sent to ${agent.name}`)
  } else {
    addPlanActivity(planId, 'warning', `No terminal for ${agent.name}`, `Task ${task.id} queued until agent starts`)
  }
}

/**
 * Build the prompt to inject into a worker agent's terminal for a task
 * Returns only instructions with trailing newline (no /clear - handled separately)
 */
function buildTaskPrompt(planId: string, task: BeadTask): string {
  const planDir = getPlanDir(planId)

  const instructions = `[BISMARK TASK ASSIGNMENT]
Task ID: ${task.id}
Title: ${task.title}

=== COMPLETION REQUIREMENTS ===
1. Complete the work described in the task
2. Create a PR: gh pr create
3. Close task with PR URL: cd ${planDir} && bd --sandbox close ${task.id} --message "PR: <url>"

DO NOT close the task without creating a PR first.`

  return instructions
}

/**
 * Build the prompt to inject into the orchestrator agent's terminal
 * Returns only instructions with trailing newline (no /clear - handled separately)
 * Note: Orchestrator runs in the plan directory, so no 'cd' needed for bd commands
 */
function buildOrchestratorPrompt(plan: Plan, agents: Agent[]): string {
  // Filter out orchestrator and plan agents from available agents
  const availableAgents = agents.filter(a => !a.isOrchestrator && !a.isPlanAgent)
  const agentList = availableAgents
    .map(a => `- ${a.name}: ${a.purpose || 'General purpose'}`)
    .join('\n')

  const instructions = `[BISMARK ORCHESTRATOR]
Plan ID: ${plan.id}
Title: ${plan.title}

You are the orchestrator. Your job is to:
1. Wait for Plan Agent to finish creating tasks
2. Assign unassigned tasks to appropriate agents
3. Mark first task(s) as ready
4. Monitor task completion and unblock dependents

=== AVAILABLE AGENTS ===
${agentList}

=== RULES ===
1. DO NOT pick up or work on tasks yourself
2. Assign tasks based on agent purpose/expertise
3. Mark tasks as ready ONLY when their dependencies are complete

=== COMMANDS ===
List all tasks:
  bd --sandbox list --json

Assign a task:
  bd --sandbox update <task-id> --assignee "<agent-name>"

Mark task ready for pickup:
  bd --sandbox update <task-id> --add-label bismark-ready

Check task dependencies:
  bd --sandbox dep list <task-id> --direction=down

=== WORKFLOW ===
Phase 1 - Initial Setup (after Plan Agent exits):
1. List all tasks: bd --sandbox list --json
2. For each unassigned task, assign to an appropriate agent
3. Mark first task(s) (those with no blockers) as ready

Phase 2 - Monitoring (every 30 seconds):
1. Check for closed tasks: bd --sandbox list --closed --json
2. For each newly closed task, find dependents: bd --sandbox dep list <task-id> --direction=up
3. Check if dependent's blockers are all closed, then mark ready

Begin by waiting for the Plan Agent to create tasks, then start assigning.`

  return instructions
}

/**
 * Build the prompt for the plan agent that creates tasks
 * Note: Plan agent runs in the reference agent's codebase directory but
 * bd commands need to be run in the plan-specific directory
 *
 * The Plan Agent is responsible for:
 * - Analyzing the codebase
 * - Creating epic + tasks
 * - Setting up dependencies
 *
 * The Orchestrator handles:
 * - Assigning tasks to agents
 * - Marking tasks as ready
 */
function buildPlanAgentPrompt(plan: Plan, _agents: Agent[]): string {
  const planDir = getPlanDir(plan.id)

  return `[BISMARK PLAN AGENT]
Plan ID: ${plan.id}
Title: ${plan.title}

${plan.description}

=== YOUR TASK ===
You are the Plan Agent. Your job is to:
1. Understand the problem/feature described above
2. Break it down into discrete tasks
3. Create those tasks in bd with proper dependencies
4. EXIT when done (type /exit)

NOTE: The Orchestrator will handle task assignment and marking tasks as ready.

=== COMMANDS ===
IMPORTANT: All bd commands must run in the plan directory: ${planDir}

Create an epic:
  cd ${planDir} && bd --sandbox create --type epic "${plan.title}"

Create a task under the epic:
  cd ${planDir} && bd --sandbox create --parent <epic-id> "<task title>"

Add dependency (task B depends on task A completing first):
  cd ${planDir} && bd --sandbox dep <task-A-id> --blocks <task-B-id>

=== WORKFLOW ===
1. Analyze the problem
2. Create an epic for the plan
3. Create tasks with clear descriptions
4. Set up dependencies between tasks
5. Type /exit to complete your job

Begin planning now.`
}

/**
 * Cleanup plan agent workspace, terminal for a plan
 */
function cleanupPlanAgent(plan: Plan): void {
  if (!plan.planAgentWorkspaceId) return

  // Close terminal
  const terminalId = getTerminalForWorkspace(plan.planAgentWorkspaceId)
  if (terminalId) {
    closeTerminal(terminalId)
  }

  // Remove from active workspaces
  removeActiveWorkspace(plan.planAgentWorkspaceId)

  // Remove from tab
  removeWorkspaceFromTab(plan.planAgentWorkspaceId)

  // Delete workspace config
  deleteWorkspace(plan.planAgentWorkspaceId)
  plan.planAgentWorkspaceId = null
  savePlan(plan)

  addPlanActivity(plan.id, 'success', 'Plan agent completed task creation')
  emitStateUpdate()
}

/**
 * Cleanup plan agent without logging success (used for cancellation)
 */
function cleanupPlanAgentSilent(plan: Plan): void {
  if (!plan.planAgentWorkspaceId) return

  // Close terminal
  const terminalId = getTerminalForWorkspace(plan.planAgentWorkspaceId)
  if (terminalId) {
    closeTerminal(terminalId)
  }

  // Remove from active workspaces
  removeActiveWorkspace(plan.planAgentWorkspaceId)

  // Remove from tab
  removeWorkspaceFromTab(plan.planAgentWorkspaceId)

  // Delete workspace config
  deleteWorkspace(plan.planAgentWorkspaceId)
  plan.planAgentWorkspaceId = null
  savePlan(plan)

  emitStateUpdate()
}

/**
 * Update plan statuses based on task completion
 */
async function updatePlanStatuses(): Promise<void> {
  const plans = loadPlans()

  for (const plan of plans) {
    if (plan.status === 'delegating' || plan.status === 'in_progress') {
      if (plan.beadEpicId) {
        // Check if all child tasks are complete (using plan-specific directory)
        const childTasks = await bdList(plan.id, { parent: plan.beadEpicId })
        const allClosed = childTasks.length > 0 && childTasks.every((t) => t.status === 'closed')
        const hasOpenTasks = childTasks.some((t) => t.status === 'open')

        if (allClosed) {
          // Cleanup orchestrator on plan completion
          cleanupOrchestrator(plan)
          plan.status = 'completed'
          plan.updatedAt = new Date().toISOString()
          savePlan(plan)
          emitPlanUpdate(plan)
          addPlanActivity(plan.id, 'success', 'All tasks completed', `Plan "${plan.title}" finished successfully`)
          // Remove from executing set
          executingPlans.delete(plan.id)
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

/**
 * Emit state update event to renderer (for tab changes)
 */
function emitStateUpdate(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const state = getState()
    mainWindow.webContents.send('state-update', state)
  }
}
