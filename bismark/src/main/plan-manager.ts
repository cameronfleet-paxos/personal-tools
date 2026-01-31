import { BrowserWindow } from 'electron'
import * as fs from 'fs/promises'
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
  getWorktreePath,
  getPlanWorktreesPath,
  getClaudeOAuthToken,
  loadPlanActivities,
  savePlanActivities,
  loadHeadlessAgentInfo,
  saveHeadlessAgentInfo,
} from './config'
import { bdCreate, bdList, bdUpdate, BeadTask, ensureBeadsRepo, getPlanDir } from './bd-client'
import { injectTextToTerminal, injectPromptToTerminal, getTerminalForWorkspace, waitForTerminalOutput, createTerminal, closeTerminal, getTerminalEmitter, sendExitToTerminal } from './terminal'
import { createTab, addWorkspaceToTab, addActiveWorkspace, removeActiveWorkspace, removeWorkspaceFromTab, setActiveTab, deleteTab, getState } from './state-manager'
import type { Plan, TaskAssignment, PlanStatus, Agent, PlanActivity, PlanActivityType, Workspace, PlanWorktree, Repository, StreamEvent, HeadlessAgentInfo, HeadlessAgentStatus, BranchStrategy, PlanCommit, PlanPullRequest } from '../shared/types'
import {
  createWorktree,
  removeWorktree,
  pruneWorktrees,
  generateUniqueBranchName,
  pushBranch,
  pushBranchToRemoteBranch,
  getCommitsBetween,
  fetchAndRebase,
  getGitHubUrlFromRemote,
  createBranch,
  getHeadCommit,
} from './git-utils'
import {
  getRepositoryById,
  getAllRepositories,
} from './repository-manager'
import { HeadlessAgent, HeadlessAgentOptions } from './headless-agent'
import { runSetupToken } from './oauth-setup'
import { startToolProxy, stopToolProxy, isProxyRunning } from './tool-proxy'
import { checkDockerAvailable, checkImageExists, stopAllContainers } from './docker-sandbox'

let mainWindow: BrowserWindow | null = null
let pollInterval: NodeJS.Timeout | null = null

const POLL_INTERVAL_MS = 5000 // Poll bd every 5 seconds
const DEFAULT_MAX_PARALLEL_AGENTS = 4
const DOCKER_IMAGE_NAME = 'bismark-agent:latest'

// In-memory activity storage per plan
const planActivities: Map<string, PlanActivity[]> = new Map()

// In-memory guard to prevent duplicate plan execution (React StrictMode double-invocation)
const executingPlans: Set<string> = new Set()

// Track headless agents for cleanup and status
const headlessAgents: Map<string, HeadlessAgent> = new Map()

// Debounce timers for headless agent event persistence
const eventPersistTimers: Map<string, NodeJS.Timeout> = new Map()
const EVENT_PERSIST_DEBOUNCE_MS = 2000 // Persist events every 2 seconds max

// Track headless agent info for UI
const headlessAgentInfo: Map<string, HeadlessAgentInfo> = new Map()

/**
 * Register a headless agent info entry (for mock/test agents)
 */
export function registerHeadlessAgentInfo(info: HeadlessAgentInfo): void {
  headlessAgentInfo.set(info.taskId!, info)
}

/**
 * Emit headless agent update to renderer (exported for mock agents)
 */
export function emitHeadlessAgentUpdatePublic(info: HeadlessAgentInfo): void {
  emitHeadlessAgentUpdate(info)
}

/**
 * Emit headless agent event to renderer (exported for mock agents)
 */
export function emitHeadlessAgentEventPublic(planId: string, taskId: string, event: StreamEvent): void {
  emitHeadlessAgentEvent(planId, taskId, event)
}

// Feature flag for headless mode (can be made configurable later)
// Default to true to test Docker sandboxing
let useHeadlessMode = true

/**
 * Enable or disable headless Docker mode
 */
export function setHeadlessMode(enabled: boolean): void {
  useHeadlessMode = enabled
}

/**
 * Check if headless mode is enabled
 */
export function isHeadlessModeEnabled(): boolean {
  return useHeadlessMode
}

/**
 * Check if Docker is available for headless mode
 */
export async function checkHeadlessModeAvailable(): Promise<{
  available: boolean
  dockerAvailable: boolean
  imageExists: boolean
  message: string
}> {
  const dockerAvailable = await checkDockerAvailable()
  if (!dockerAvailable) {
    return {
      available: false,
      dockerAvailable: false,
      imageExists: false,
      message: 'Docker is not available. Install Docker to use headless mode.',
    }
  }

  const imageExists = await checkImageExists(DOCKER_IMAGE_NAME)
  if (!imageExists) {
    return {
      available: false,
      dockerAvailable: true,
      imageExists: false,
      message: `Docker image '${DOCKER_IMAGE_NAME}' not found. Run: cd bismark/docker && ./build.sh`,
    }
  }

  return {
    available: true,
    dockerAvailable: true,
    imageExists: true,
    message: 'Headless mode is available',
  }
}

/**
 * Get headless agent info for a task
 */
export function getHeadlessAgentInfo(taskId: string): HeadlessAgentInfo | undefined {
  return headlessAgentInfo.get(taskId)
}

/**
 * Get all headless agent info for a plan
 */
export function getHeadlessAgentInfoForPlan(planId: string): HeadlessAgentInfo[] {
  return Array.from(headlessAgentInfo.values()).filter(info => info.planId === planId)
}

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

  // Persist to disk
  savePlanActivities(planId, planActivities.get(planId)!)

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
  if (window) {
    initializePlanState()
  }
}

/**
 * Initialize plan state on startup - loads persisted activities and headless agent info
 */
function initializePlanState(): void {
  const plans = loadPlans()

  for (const plan of plans) {
    // Only load state for active plans
    if (plan.status === 'delegating' || plan.status === 'in_progress' || plan.status === 'ready_for_review') {
      // Load persisted activities into memory
      const activities = loadPlanActivities(plan.id)
      if (activities.length > 0) {
        planActivities.set(plan.id, activities)
        console.log(`[PlanManager] Loaded ${activities.length} activities for plan ${plan.id}`)
      }

      // Load persisted headless agent info into memory
      const agents = loadHeadlessAgentInfo(plan.id)
      for (const agent of agents) {
        if (agent.taskId) {
          headlessAgentInfo.set(agent.taskId, agent)
          console.log(`[PlanManager] Loaded headless agent info for task ${agent.taskId}`)
        }
      }
    }
  }
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
export function createPlan(
  title: string,
  description: string,
  options?: {
    maxParallelAgents?: number
    branchStrategy?: BranchStrategy
    baseBranch?: string
  }
): Plan {
  const now = new Date().toISOString()
  const planId = generatePlanId()
  const branchStrategy = options?.branchStrategy ?? 'feature_branch'
  const baseBranch = options?.baseBranch ?? 'main'

  const plan: Plan = {
    id: planId,
    title,
    description,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    referenceAgentId: null,
    beadEpicId: null,
    orchestratorWorkspaceId: null,
    orchestratorTabId: null,
    maxParallelAgents: options?.maxParallelAgents ?? DEFAULT_MAX_PARALLEL_AGENTS,
    worktrees: [],
    branchStrategy,
    baseBranch,
    // Generate feature branch name for feature_branch strategy
    featureBranch: branchStrategy === 'feature_branch'
      ? `bismark/${planId.split('-')[1]}/feature`
      : undefined,
    gitSummary: {
      commits: branchStrategy === 'feature_branch' ? [] : undefined,
      pullRequests: branchStrategy === 'raise_prs' ? [] : undefined,
    },
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

  // Create a dedicated tab for the orchestrator BEFORE emitting update
  // so renderer has the orchestratorTabId for headless agent lookup
  const orchestratorTab = createTab(plan.title.substring(0, 20), { isPlanTab: true, planId: plan.id })
  plan.orchestratorTabId = orchestratorTab.id

  savePlan(plan)
  emitPlanUpdate(plan)

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
      const orchestratorPrompt = await buildOrchestratorPrompt(plan, allAgents)
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

      // Create plan agent workspace (runs in plan directory so bd commands work without cd)
      const planAgentWorkspace: Workspace = {
        id: `plan-agent-${planId}`,
        name: `Plan Agent (${plan.title})`,
        directory: planDir, // Plan agent runs in plan directory for bd commands
        purpose: 'Initial discovery and task creation',
        theme: 'blue',
        icon: getRandomUniqueIcon(allAgents),
        isPlanAgent: true,
      }
      saveWorkspace(planAgentWorkspace)
      plan.planAgentWorkspaceId = planAgentWorkspace.id
      savePlan(plan)

      // Create terminal with plan agent prompt
      // Pass --add-dir flags so plan agent can access both plan directory and codebase
      const planAgentClaudeFlags = `--add-dir "${planDir}" --add-dir "${referenceWorkspace.directory}"`
      const planAgentPrompt = buildPlanAgentPrompt(plan, allAgents, referenceWorkspace.directory)
      console.log(`[PlanManager] Creating terminal for plan agent ${planAgentWorkspace.id}`)
      const planAgentTerminalId = createTerminal(planAgentWorkspace.id, mainWindow, planAgentPrompt, planAgentClaudeFlags)
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

  // Start polling for task updates for this plan
  startTaskPolling(plan.id)
  addPlanActivity(planId, 'info', 'Watching for tasks...')

  return plan
}

/**
 * Cancel a plan
 */
export async function cancelPlan(planId: string): Promise<Plan | null> {
  const plan = getPlanById(planId)
  if (!plan) return null

  // 1. Kill all agents immediately (closes terminals and stops containers)
  await killAllPlanAgents(plan)

  // 2. Cleanup worktrees (slow - git operations)
  await cleanupAllWorktreesOnly(planId)

  // 3. Update plan state
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
 * Kill all agents for a plan without cleaning up worktrees
 * This is fast because it just closes terminals/containers
 */
async function killAllPlanAgents(plan: Plan): Promise<void> {
  // Stop all headless agents for this plan first
  await stopAllHeadlessAgents(plan.id)

  // Kill task agents (interactive mode)
  if (plan.worktrees) {
    for (const worktree of plan.worktrees) {
      if (worktree.agentId) {
        const terminalId = getTerminalForWorkspace(worktree.agentId)
        if (terminalId) closeTerminal(terminalId)
        removeActiveWorkspace(worktree.agentId)
        removeWorkspaceFromTab(worktree.agentId)
        deleteWorkspace(worktree.agentId)
      }
    }
  }

  // Kill plan agent
  if (plan.planAgentWorkspaceId) {
    const terminalId = getTerminalForWorkspace(plan.planAgentWorkspaceId)
    if (terminalId) closeTerminal(terminalId)
    removeActiveWorkspace(plan.planAgentWorkspaceId)
    removeWorkspaceFromTab(plan.planAgentWorkspaceId)
    deleteWorkspace(plan.planAgentWorkspaceId)
    plan.planAgentWorkspaceId = null
  }

  // Kill orchestrator
  if (plan.orchestratorWorkspaceId) {
    const terminalId = getTerminalForWorkspace(plan.orchestratorWorkspaceId)
    if (terminalId) closeTerminal(terminalId)
    removeActiveWorkspace(plan.orchestratorWorkspaceId)
    deleteWorkspace(plan.orchestratorWorkspaceId)
    plan.orchestratorWorkspaceId = null
  }

  // Delete orchestrator tab
  if (plan.orchestratorTabId) {
    deleteTab(plan.orchestratorTabId)
    plan.orchestratorTabId = null
    emitStateUpdate()
  }
}

/**
 * Cleanup worktrees only (without killing agents - they should already be killed)
 * This is the slow part due to git operations
 */
async function cleanupAllWorktreesOnly(planId: string): Promise<void> {
  const plan = getPlanById(planId)
  if (!plan || !plan.worktrees) return

  for (const worktree of plan.worktrees) {
    if (worktree.status === 'cleaned') continue

    const repository = await getRepositoryById(worktree.repositoryId)
    if (repository) {
      try {
        await removeWorktree(repository.rootPath, worktree.path, true)
      } catch {
        // Ignore errors, continue cleanup
      }
    }
    worktree.status = 'cleaned'
  }

  savePlan(plan)

  // Prune stale worktree refs
  const repositories = await getAllRepositories()
  for (const repo of repositories) {
    try {
      await pruneWorktrees(repo.rootPath)
    } catch { /* ignore */ }
  }
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
 * Start polling bd for task updates for a specific plan
 * @param planId - The ID of the plan to poll for
 */
export function startTaskPolling(planId: string): void {
  if (pollInterval) return // Already polling

  pollInterval = setInterval(async () => {
    await syncTasksForPlan(planId)
  }, POLL_INTERVAL_MS)

  // Do an immediate sync
  syncTasksForPlan(planId)
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
 * Sync tasks from bd and dispatch to agents for a specific plan
 * Uses in-memory plan state via getPlanById instead of reading from disk
 * @param planId - The ID of the plan to sync tasks for
 */
async function syncTasksForPlan(planId: string): Promise<void> {
  // Get the plan from in-memory cache (via getPlanById which loads from disk only if not cached)
  const activePlan = getPlanById(planId)

  // If plan no longer exists or is no longer active, stop polling
  if (!activePlan || (activePlan.status !== 'delegating' && activePlan.status !== 'in_progress')) {
    stopTaskPolling()
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
    const closedTasks = await bdList(activePlan.id, { status: 'closed' })

    for (const assignment of allAssignments) {
      if (assignment.status === 'sent' || assignment.status === 'in_progress') {
        // Check if task is now closed in bd
        const closedTask = closedTasks.find((t) => t.id === assignment.beadId)
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

          // Auto-exit the task agent since its bd task is now closed
          // This triggers the exit handler which calls markWorktreeReadyForReview()
          console.log(`[PlanManager] Task ${closedTask.id} closed, looking for task agent`)
          console.log(`[PlanManager] Assignment beadId: ${assignment.beadId}`)
          const allWorkspaces = getWorkspaces()
          console.log(`[PlanManager] All workspaces with taskId:`, allWorkspaces.filter(a => a.taskId).map(a => ({ id: a.id, taskId: a.taskId })))

          const taskAgent = allWorkspaces.find(a => a.taskId === assignment.beadId)
          if (taskAgent) {
            const terminalId = getTerminalForWorkspace(taskAgent.id)
            console.log(`[PlanManager] Found task agent ${taskAgent.id}, terminal=${terminalId}`)
            if (terminalId) {
              sendExitToTerminal(terminalId)
              addPlanActivity(activePlan.id, 'info', `Sending exit to task agent for ${closedTask.id}`)
            } else {
              addPlanActivity(activePlan.id, 'warning', `No terminal found for task agent ${taskAgent.id}`)
            }
          } else {
            addPlanActivity(activePlan.id, 'warning', `No task agent found for closed task ${closedTask.id}`)
          }
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
 * New model: Creates a fresh task agent with a worktree
 */
async function processReadyTask(planId: string, task: BeadTask): Promise<void> {
  const plan = getPlanById(planId)
  if (!plan) return

  // Check if we already have an assignment for this task
  const existingAssignments = loadTaskAssignments(planId)
  const existing = existingAssignments.find((a) => a.beadId === task.id)
  if (existing) {
    return // Already processing or processed
  }

  // Check if we can spawn more agents
  if (!canSpawnMoreAgents(planId)) {
    // Queue for later - will be picked up on next poll when an agent finishes
    return
  }

  // Extract repository and worktree info from task
  // Expected format: task has repo and worktree in labels or description
  // The orchestrator sets these via: bd update <task-id> --repo "<repo-name>" --worktree "<name>"
  const repoLabel = task.labels?.find(l => l.startsWith('repo:'))
  const worktreeLabel = task.labels?.find(l => l.startsWith('worktree:'))

  if (!repoLabel || !worktreeLabel) {
    addPlanActivity(
      planId,
      'warning',
      `Task ${task.id} missing repo/worktree assignment`,
      'Orchestrator must assign repo and worktree before marking ready'
    )
    return
  }

  const repoName = repoLabel.substring('repo:'.length)
  const worktreeName = worktreeLabel.substring('worktree:'.length)

  // Find the repository
  const repositories = await getAllRepositories()
  const repository = repositories.find(r => r.name === repoName)

  if (!repository) {
    addPlanActivity(planId, 'warning', `Unknown repository: ${repoName}`, `Task ${task.id} cannot be dispatched`)
    return
  }

  // Log task discovery
  addPlanActivity(planId, 'info', `Processing task: ${task.id}`, `Repo: ${repoName}, Worktree: ${worktreeName}`)

  // Create task assignment
  const assignment: TaskAssignment = {
    beadId: task.id,
    agentId: '', // Will be set after agent creation
    status: 'pending',
    assignedAt: new Date().toISOString(),
  }
  saveTaskAssignment(planId, assignment)
  emitTaskAssignmentUpdate(assignment)

  // Create worktree and task agent
  const result = await createTaskAgentWithWorktree(planId, task, repository, worktreeName)
  if (!result) {
    addPlanActivity(planId, 'error', `Failed to create task agent for ${task.id}`)
    return
  }

  const { agent, worktree } = result
  assignment.agentId = agent.id

  // Branch based on execution mode
  if (useHeadlessMode) {
    // Headless mode: start agent in Docker container
    try {
      // Check for OAuth token before starting headless agent
      let token = getClaudeOAuthToken()
      if (!token) {
        // Notify renderer that OAuth setup is starting
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('oauth-setup-starting', { planId, taskId: task.id })
        }
        addPlanActivity(
          planId,
          'info',
          'OAuth token required - starting setup',
          'Opening browser for authentication...'
        )

        try {
          // Automatically run setup-token to get OAuth token
          token = await runSetupToken()
          addPlanActivity(planId, 'success', 'OAuth token obtained', 'Authentication successful')
        } catch (setupError) {
          addPlanActivity(
            planId,
            'error',
            'OAuth setup failed',
            setupError instanceof Error ? setupError.message : 'Unknown error'
          )
          throw new Error('OAuth token required for headless agents - setup failed')
        }
      }

      // Ensure tool proxy is running
      if (!isProxyRunning()) {
        await startToolProxy()
        addPlanActivity(planId, 'info', 'Tool proxy started')
      }

      await startHeadlessTaskAgent(planId, task, worktree, repository)

      assignment.status = 'sent'
      saveTaskAssignment(planId, assignment)
      emitTaskAssignmentUpdate(assignment)

      // Update bd labels
      await bdUpdate(planId, task.id, {
        removeLabels: ['bismark-ready'],
        addLabels: ['bismark-sent'],
      })

      // Notify renderer about headless agent
      console.log('[PlanManager] Sending headless-agent-started event', { taskId: task.id, planId, worktreePath: worktree.path })
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('headless-agent-started', {
          taskId: task.id,
          planId,
          worktreePath: worktree.path,
        })
        console.log('[PlanManager] headless-agent-started event sent successfully')
      } else {
        console.log('[PlanManager] Cannot send headless-agent-started - mainWindow:', mainWindow ? 'exists but destroyed' : 'null')
      }

      emitStateUpdate()
    } catch (error) {
      addPlanActivity(
        planId,
        'error',
        `Failed to start headless agent for ${task.id}`,
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  } else {
    // Interactive mode: create terminal (existing behavior)
    if (mainWindow && plan.orchestratorTabId) {
      try {
        const taskPrompt = buildTaskPrompt(planId, task, repository)
        const planDir = getPlanDir(planId)
        const claudeFlags = `--add-dir "${worktree.path}" --add-dir "${planDir}"`

        const terminalId = createTerminal(agent.id, mainWindow, taskPrompt, claudeFlags, true)
        addActiveWorkspace(agent.id)
        addWorkspaceToTab(agent.id, plan.orchestratorTabId)

        // Notify renderer about the new terminal
        mainWindow.webContents.send('terminal-created', {
          terminalId,
          workspaceId: agent.id,
        })

        // Set up listener for task completion
        const terminalEmitter = getTerminalEmitter(terminalId)
        if (terminalEmitter) {
          const exitHandler = (data: string) => {
            if (data.includes('Goodbye') || data.includes('Session ended')) {
              terminalEmitter.removeListener('data', exitHandler)
              markWorktreeReadyForReview(planId, task.id)
            }
          }
          terminalEmitter.on('data', exitHandler)
        }

        assignment.status = 'sent'
        saveTaskAssignment(planId, assignment)
        emitTaskAssignmentUpdate(assignment)

        // Update bd labels
        await bdUpdate(planId, task.id, {
          removeLabels: ['bismark-ready'],
          addLabels: ['bismark-sent'],
        })

        addPlanActivity(planId, 'success', `Task ${task.id} started`, `Agent created in worktree: ${worktreeName}`)
        emitStateUpdate()
      } catch (error) {
        addPlanActivity(
          planId,
          'error',
          `Failed to start task agent for ${task.id}`,
          error instanceof Error ? error.message : 'Unknown error'
        )
      }
    }
  }
}

/**
 * Build the prompt to inject into a worker agent's terminal for a task
 * Returns only instructions with trailing newline (no /clear - handled separately)
 */
function buildTaskPrompt(planId: string, task: BeadTask, repository?: Repository): string {
  const plan = getPlanById(planId)
  const planDir = getPlanDir(planId)
  const baseBranch = plan?.baseBranch || repository?.defaultBranch || 'main'

  // Build completion instructions based on branch strategy
  let completionInstructions: string
  if (plan?.branchStrategy === 'raise_prs') {
    completionInstructions = `2. Commit your changes with a clear message
3. Push your branch and create a PR: gh pr create --base ${baseBranch}
4. Close task with PR URL: cd ${planDir} && bd --sandbox close ${task.id} --message "PR: <url>"`
  } else {
    // feature_branch strategy - just commit, pushing happens on completion
    completionInstructions = `2. Commit your changes with a clear message
3. Close task: cd ${planDir} && bd --sandbox close ${task.id} --message "Completed"`
  }

  const instructions = `[BISMARK TASK ASSIGNMENT]
Task ID: ${task.id}
Title: ${task.title}

=== YOUR WORKING DIRECTORY ===
You are working in a dedicated git worktree for this task.
Branch: (see git branch)
Base: ${baseBranch}

=== COMPLETION REQUIREMENTS ===
1. Complete the work described in the task
${completionInstructions}

When finished, type /exit to signal completion.`

  return instructions
}

/**
 * Build the prompt to inject into the orchestrator agent's terminal
 * Returns only instructions with trailing newline (no /clear - handled separately)
 * Note: Orchestrator runs in the plan directory, so no 'cd' needed for bd commands
 */
async function buildOrchestratorPrompt(plan: Plan, agents: Agent[]): Promise<string> {
  // Get repositories from agents that have them
  const repositories = await getAllRepositories()

  // Build repository list with purposes derived from agents
  const repoInfoList: string[] = []
  for (const repo of repositories) {
    // Find agents that use this repo to get purpose info
    const repoAgents = agents.filter(a => a.repositoryId === repo.id && !a.isOrchestrator && !a.isPlanAgent && !a.isTaskAgent)
    const purposes = repoAgents.map(a => a.purpose).filter(Boolean)
    const purpose = purposes.length > 0 ? purposes[0] : 'No description'

    repoInfoList.push(`- ${repo.name}: ${repo.rootPath} (branch: ${repo.defaultBranch})
    Purpose: ${purpose}`)
  }

  const repoList = repoInfoList.length > 0
    ? repoInfoList.join('\n')
    : '(No repositories detected - agents may not be linked to git repos)'

  const maxParallel = plan.maxParallelAgents ?? DEFAULT_MAX_PARALLEL_AGENTS

  const instructions = `[BISMARK ORCHESTRATOR]
Plan ID: ${plan.id}
Title: ${plan.title}

You are the orchestrator. Your job is to:
1. Wait for Plan Agent to finish creating tasks
2. Assign each task to a repository and worktree
3. Mark first task(s) as ready for execution
4. Monitor task completion and unblock dependents

=== AVAILABLE REPOSITORIES ===
${repoList}

=== CONFIGURATION ===
Max parallel agents: ${maxParallel}
(Bismark will automatically queue tasks if this limit is reached)

=== RULES ===
1. DO NOT pick up or work on tasks yourself
2. Assign tasks to repositories based on where the work should happen
3. Choose descriptive worktree names (e.g., "fix-login-bug", "add-user-export")
4. You can create multiple worktrees for the same repo for parallel work
5. Mark tasks as ready ONLY when their dependencies are complete

=== COMMANDS ===
List all tasks:
  bd --sandbox list --json

Assign a task to a repository with worktree name:
  bd --sandbox update <task-id> --add-label "repo:<repo-name>" --add-label "worktree:<descriptive-name>"

Mark task ready for pickup:
  bd --sandbox update <task-id> --add-label bismark-ready

Check task dependencies:
  bd --sandbox dep list <task-id> --direction=down

=== WORKFLOW ===
Phase 1 - Initial Setup (after Plan Agent exits):
1. List all tasks: bd --sandbox list --json
2. For each task:
   a. Decide which repository it belongs to
   b. Assign repo and worktree labels
3. Mark first task(s) (those with no blockers) as ready

Phase 2 - Monitoring (every 30 seconds):
1. Check for closed tasks: bd --sandbox list --closed --json
2. For each newly closed task, find dependents: bd --sandbox dep list <task-id> --direction=up
3. Check if dependent's blockers are all closed
4. If all blockers closed, mark the dependent task as ready

Begin by waiting for the Plan Agent to create tasks, then start assigning repositories and worktrees.`

  return instructions
}

/**
 * Build the prompt for the plan agent that creates tasks
 * Note: Plan agent runs in the plan directory so bd commands work directly
 * It has access to the codebase via --add-dir flag for analysis
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
function buildPlanAgentPrompt(plan: Plan, _agents: Agent[], codebasePath: string): string {
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

=== IMPORTANT PATHS ===
- You are running in: ${planDir} (for bd commands)
- The codebase to analyze is at: ${codebasePath}

=== COMMANDS ===
bd commands run directly (no cd needed):

Create an epic:
  bd --sandbox create --type epic "${plan.title}"

Create a task under the epic:
  bd --sandbox create --parent <epic-id> "<task title>"

Add dependency (task B depends on task A completing first):
  bd --sandbox dep <task-A-id> --blocks <task-B-id>

=== WORKFLOW ===
1. Analyze the codebase at ${codebasePath}
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

// ===============================================
// WORKTREE-BASED TASK AGENT FUNCTIONS
// ===============================================

/**
 * Check if we can spawn more task agents for a plan
 */
function canSpawnMoreAgents(planId: string): boolean {
  const plan = getPlanById(planId)
  if (!plan) return false

  const maxParallel = plan.maxParallelAgents ?? DEFAULT_MAX_PARALLEL_AGENTS
  const activeCount = getActiveTaskAgentCount(planId)

  return activeCount < maxParallel
}

/**
 * Get count of active task agents for a plan
 */
function getActiveTaskAgentCount(planId: string): number {
  const plan = getPlanById(planId)
  if (!plan || !plan.worktrees) return 0

  return plan.worktrees.filter(w => w.status === 'active').length
}

/**
 * Generate a unique ID for a worktree
 */
function generateWorktreeId(): string {
  return `wt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Create a fresh worktree and task agent for a task
 */
async function createTaskAgentWithWorktree(
  planId: string,
  task: BeadTask,
  repository: Repository,
  worktreeName: string
): Promise<{ agent: Agent; worktree: PlanWorktree } | null> {
  const plan = getPlanById(planId)
  if (!plan) return null

  // Generate unique branch name
  const baseBranchName = `bismark/${planId.split('-')[1]}/${worktreeName}`
  const branchName = await generateUniqueBranchName(repository.rootPath, baseBranchName)

  // Determine worktree path
  const worktreePath = getWorktreePath(planId, repository.name, worktreeName)

  // Create the worktree
  try {
    // Use plan's baseBranch for feature_branch strategy, or calculate for raise_prs
    const baseBranch = getBaseBranchForTask(plan, task, repository)
    await createWorktree(repository.rootPath, worktreePath, branchName, baseBranch)
    addPlanActivity(planId, 'info', `Created worktree: ${worktreeName}`, `Branch: ${branchName}, Base: ${baseBranch}`)
  } catch (error) {
    addPlanActivity(
      planId,
      'error',
      `Failed to create worktree: ${worktreeName}`,
      error instanceof Error ? error.message : 'Unknown error'
    )
    return null
  }

  // Create task agent workspace pointing to the worktree
  const allAgents = getWorkspaces()
  const taskAgent: Agent = {
    id: `task-agent-${task.id}`,
    name: `Task: ${task.title.substring(0, 30)}`,
    directory: worktreePath,
    purpose: task.title,
    theme: 'teal',
    icon: getRandomUniqueIcon(allAgents),
    isTaskAgent: true,
    parentPlanId: planId,
    worktreePath: worktreePath,
    taskId: task.id,
    repositoryId: repository.id,
    isHeadless: useHeadlessMode,
  }
  saveWorkspace(taskAgent)

  // Create worktree tracking entry
  const planWorktree: PlanWorktree = {
    id: generateWorktreeId(),
    planId,
    taskId: task.id,
    repositoryId: repository.id,
    path: worktreePath,
    branch: branchName,
    agentId: taskAgent.id,
    status: 'active',
    createdAt: new Date().toISOString(),
  }

  // Add worktree to plan
  if (!plan.worktrees) {
    plan.worktrees = []
  }
  plan.worktrees.push(planWorktree)
  savePlan(plan)

  return { agent: taskAgent, worktree: planWorktree }
}

/**
 * Start a headless task agent in a Docker container
 */
async function startHeadlessTaskAgent(
  planId: string,
  task: BeadTask,
  worktree: PlanWorktree,
  repository: Repository
): Promise<void> {
  const planDir = getPlanDir(planId)
  const taskPrompt = buildTaskPromptForHeadless(planId, task, repository, worktree.path)

  // Create headless agent info for tracking
  const agentInfo: HeadlessAgentInfo = {
    id: `headless-${task.id}`,
    taskId: task.id,
    planId,
    status: 'starting',
    worktreePath: worktree.path,
    events: [],
    startedAt: new Date().toISOString(),
  }
  headlessAgentInfo.set(task.id, agentInfo)

  // Emit initial state
  emitHeadlessAgentUpdate(agentInfo)

  // Create and start headless agent
  const agent = new HeadlessAgent()
  headlessAgents.set(task.id, agent)

  // Set up event listeners
  agent.on('status', (status: HeadlessAgentStatus) => {
    agentInfo.status = status
    emitHeadlessAgentUpdate(agentInfo)
  })

  agent.on('event', (event: StreamEvent) => {
    agentInfo.events.push(event)
    emitHeadlessAgentEvent(planId, task.id, event)
  })

  agent.on('message', (text: string) => {
    // Log messages as activities for visibility
    if (text.length > 100) {
      addPlanActivity(planId, 'info', `[${task.id}] ${text.substring(0, 100)}...`)
    }
  })

  agent.on('complete', (result) => {
    agentInfo.status = result.success ? 'completed' : 'failed'
    agentInfo.completedAt = new Date().toISOString()
    agentInfo.result = result
    emitHeadlessAgentUpdate(agentInfo)

    // Clean up tracking
    headlessAgents.delete(task.id)

    if (result.success) {
      addPlanActivity(planId, 'success', `Task ${task.id} completed (headless)`)
      markWorktreeReadyForReview(planId, task.id)
    } else {
      addPlanActivity(planId, 'error', `Task ${task.id} failed`, result.error)
    }
  })

  agent.on('error', (error: Error) => {
    agentInfo.status = 'failed'
    agentInfo.completedAt = new Date().toISOString()
    emitHeadlessAgentUpdate(agentInfo)

    headlessAgents.delete(task.id)
    addPlanActivity(planId, 'error', `Task ${task.id} container error`, error.message)
  })

  // Start the agent
  try {
    await agent.start({
      prompt: taskPrompt,
      worktreePath: worktree.path,
      planDir,
      planId,
      taskId: task.id,
      image: DOCKER_IMAGE_NAME,
      claudeFlags: ['--model', 'opus'],
    })

    addPlanActivity(planId, 'info', `Task ${task.id} started (headless container)`)
  } catch (error) {
    agentInfo.status = 'failed'
    agentInfo.completedAt = new Date().toISOString()
    emitHeadlessAgentUpdate(agentInfo)

    headlessAgents.delete(task.id)
    headlessAgentInfo.delete(task.id)

    throw error
  }
}

/**
 * Stop a headless task agent
 */
export async function stopHeadlessTaskAgent(taskId: string): Promise<void> {
  const agent = headlessAgents.get(taskId)
  if (agent) {
    await agent.stop()
    headlessAgents.delete(taskId)
  }
  headlessAgentInfo.delete(taskId)
}

/**
 * Stop all headless agents for a plan
 */
async function stopAllHeadlessAgents(planId: string): Promise<void> {
  const promises: Promise<void>[] = []

  for (const [taskId, info] of headlessAgentInfo) {
    if (info.planId === planId) {
      promises.push(stopHeadlessTaskAgent(taskId))
    }
  }

  await Promise.all(promises)
}

/**
 * Build task prompt for headless mode (includes container-specific instructions)
 */
function buildTaskPromptForHeadless(planId: string, task: BeadTask, repository?: Repository, _hostWorktreePath?: string): string {
  const plan = getPlanById(planId)
  const baseBranch = plan?.baseBranch || repository?.defaultBranch || 'main'

  // Build completion instructions based on branch strategy
  let completionInstructions: string
  if (plan?.branchStrategy === 'raise_prs') {
    completionInstructions = `2. Commit your changes with a clear message
3. Push your branch and create a PR: gh pr create --base ${baseBranch}
4. Close task with PR URL:
   bd close ${task.id} --message "PR: <url>"`
  } else {
    // feature_branch strategy - just commit, Bismark handles pushing on completion
    completionInstructions = `2. Commit your changes with a clear message
3. Close the task to signal completion:
   bd close ${task.id} --message "Completed: <brief summary>"`
  }

  return `[BISMARK TASK - HEADLESS MODE]
Task ID: ${task.id}
Title: ${task.title}

=== ENVIRONMENT ===
You are running in a Docker container with:
- Working directory: /workspace (your git worktree for this task)
- Plan directory: /plan (read-only reference)
- Tool proxy: git, gh, and bd commands are transparently proxied to the host

=== COMMANDS ===
All these commands work normally (they are proxied to the host automatically):

1. Git:
   - git status
   - git add .
   - git commit -m "Your commit message"
   - git push origin HEAD

2. GitHub CLI (gh):
   - gh pr create --base ${baseBranch} --title "..." --body "..."
   - gh pr view
   - All standard gh commands work

3. Beads Task Management (bd):
   - bd close ${task.id} --message "..."  (REQUIRED when done)
   - The --sandbox flag is added automatically

IMPORTANT: You MUST close your task using 'bd close' when finished.
This signals to Bismark that your work is complete.

=== YOUR WORKING DIRECTORY ===
You are in a dedicated git worktree: /workspace
Base branch: ${baseBranch}

=== COMPLETION REQUIREMENTS ===
1. Complete the work described in the task title
${completionInstructions}

CRITICAL: There is no interactive mode. You must:
- Complete all work
- Close the task with 'bd close ${task.id} --message "..."'
- The session ends automatically after task closure`
}

/**
 * Persist all headless agent info for a plan to disk
 */
function persistHeadlessAgentInfo(planId: string): void {
  const agents = Array.from(headlessAgentInfo.values()).filter(info => info.planId === planId)
  saveHeadlessAgentInfo(planId, agents)
}

/**
 * Emit headless agent update to renderer
 */
function emitHeadlessAgentUpdate(info: HeadlessAgentInfo): void {
  console.log('[PlanManager] Emitting headless-agent-update', { taskId: info.taskId, status: info.status })

  // Persist to disk on status changes
  persistHeadlessAgentInfo(info.planId)

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('headless-agent-update', info)
  } else {
    console.log('[PlanManager] Cannot emit headless-agent-update - mainWindow:', mainWindow ? 'exists but destroyed' : 'null')
  }
}

/**
 * Emit headless agent event to renderer
 */
function emitHeadlessAgentEvent(planId: string, taskId: string, event: StreamEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('headless-agent-event', { planId, taskId, event })
  }

  // Debounced persistence for events (avoid writing on every single event)
  const timerKey = `${planId}:${taskId}`
  const existingTimer = eventPersistTimers.get(timerKey)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }
  eventPersistTimers.set(timerKey, setTimeout(() => {
    persistHeadlessAgentInfo(planId)
    eventPersistTimers.delete(timerKey)
  }, EVENT_PERSIST_DEBOUNCE_MS))
}

/**
 * Cleanup a task agent and its worktree
 */
async function cleanupTaskAgent(planId: string, taskId: string): Promise<void> {
  const plan = getPlanById(planId)
  if (!plan || !plan.worktrees) return

  const worktree = plan.worktrees.find(w => w.taskId === taskId)
  if (!worktree) return

  // Stop headless agent if running
  await stopHeadlessTaskAgent(taskId)

  const agent = getWorkspaces().find(a => a.id === worktree.agentId)

  // Close terminal if open (for interactive mode)
  if (agent) {
    const terminalId = getTerminalForWorkspace(agent.id)
    if (terminalId) {
      closeTerminal(terminalId)
    }
    removeActiveWorkspace(agent.id)
    removeWorkspaceFromTab(agent.id)
    deleteWorkspace(agent.id)
  }

  // Remove the worktree from git
  const repository = await getRepositoryById(worktree.repositoryId)
  if (repository) {
    try {
      await removeWorktree(repository.rootPath, worktree.path, true)
      addPlanActivity(planId, 'info', `Removed worktree: ${worktree.path.split('/').pop()}`)
    } catch (error) {
      addPlanActivity(
        planId,
        'warning',
        `Failed to remove worktree`,
        error instanceof Error ? error.message : 'Unknown error'
      )
    }
  }

  // Update worktree status
  worktree.status = 'cleaned'
  savePlan(plan)
}

/**
 * Mark a worktree as ready for review (task agent completed)
 */
function markWorktreeReadyForReview(planId: string, taskId: string): void {
  const plan = getPlanById(planId)
  if (!plan || !plan.worktrees) return

  const worktree = plan.worktrees.find(w => w.taskId === taskId)
  if (!worktree || worktree.status !== 'active') return

  // Cleanup the agent window (but NOT the git worktree - that stays for review)
  if (worktree.agentId) {
    const agent = getWorkspaces().find(a => a.id === worktree.agentId)
    if (agent) {
      const terminalId = getTerminalForWorkspace(agent.id)
      if (terminalId) {
        closeTerminal(terminalId)
      }
      removeActiveWorkspace(agent.id)
      removeWorkspaceFromTab(agent.id)
      deleteWorkspace(agent.id)
    }
  }

  worktree.status = 'ready_for_review'
  // Note: agentId kept for reference even though agent is cleaned up
  savePlan(plan)
  emitPlanUpdate(plan)
  emitStateUpdate()

  addPlanActivity(planId, 'success', `Task ${taskId} ready for review`, `Worktree: ${worktree.branch}`)

  // Handle branch strategy on task completion
  handleTaskCompletionStrategy(planId, taskId, worktree).catch(error => {
    console.error(`[PlanManager] Error handling task completion strategy:`, error)
    addPlanActivity(planId, 'warning', `Git operation warning for ${taskId}`, error instanceof Error ? error.message : 'Unknown error')
  })
}

/**
 * Determine the base branch for a task based on the plan's branch strategy
 * - feature_branch: always use the shared feature branch (or baseBranch if not created yet)
 * - raise_prs: use the blocker's branch for dependent tasks, or plan's baseBranch for first tasks
 */
function getBaseBranchForTask(plan: Plan, task: BeadTask, repository: Repository): string {
  // Default to plan's baseBranch or repository's defaultBranch
  const defaultBase = plan.baseBranch || repository.defaultBranch

  if (plan.branchStrategy === 'feature_branch') {
    // For feature branch strategy, task branches are created off the default base (e.g., main)
    // When the task completes, commits are pushed to the shared feature branch
    // This avoids needing the feature branch to exist before the first task starts
    return defaultBase
  }

  // For raise_prs strategy, check if this task has blockers
  // If it does, stack on the blocker's branch
  // For now, we use the default base - the orchestrator can set a "stack-on:" label
  const stackOnLabel = task.labels?.find(l => l.startsWith('stack-on:'))
  if (stackOnLabel) {
    return stackOnLabel.substring('stack-on:'.length)
  }

  return defaultBase
}

/**
 * Handle task completion based on the plan's branch strategy
 * - feature_branch: push commits to the shared feature branch
 * - raise_prs: PR was created by the agent, record it in git summary
 */
async function handleTaskCompletionStrategy(planId: string, taskId: string, worktree: PlanWorktree): Promise<void> {
  const plan = getPlanById(planId)
  if (!plan) return

  const repository = await getRepositoryById(worktree.repositoryId)
  if (!repository) return

  if (plan.branchStrategy === 'feature_branch') {
    await pushToFeatureBranch(plan, worktree, repository)
  } else if (plan.branchStrategy === 'raise_prs') {
    // For raise_prs, the agent should have created a PR
    // Try to extract PR info from the worktree's commits/branch
    await recordPullRequest(plan, worktree, repository)
  }
}

/**
 * Push commits from a worktree to the shared feature branch
 * Used for feature_branch strategy
 */
async function pushToFeatureBranch(plan: Plan, worktree: PlanWorktree, repository: Repository): Promise<void> {
  if (!plan.featureBranch) {
    // Create the feature branch if it doesn't exist
    plan.featureBranch = `bismark/${plan.id.split('-')[1]}/feature`
    savePlan(plan)
  }

  try {
    // Get commits made in this worktree
    const baseBranch = plan.baseBranch || repository.defaultBranch
    const commits = await getCommitsBetween(worktree.path, `origin/${baseBranch}`, 'HEAD')

    if (commits.length === 0) {
      addPlanActivity(plan.id, 'info', `No commits to push for task ${worktree.taskId}`)
      return
    }

    // Record commits in worktree tracking
    worktree.commits = commits.map(c => c.sha)

    // Fetch and rebase onto feature branch if it exists
    try {
      await fetchAndRebase(worktree.path, plan.featureBranch)
    } catch {
      // Feature branch might not exist yet, that's OK - we'll create it with the push
    }

    // Push local branch to the shared feature branch on remote
    // This merges all task work into a single feature branch
    await pushBranchToRemoteBranch(worktree.path, 'HEAD', plan.featureBranch, 'origin')

    // Record commits in git summary
    const githubUrl = getGitHubUrlFromRemote(repository.remoteUrl)
    const planCommits: PlanCommit[] = commits.map(c => ({
      sha: c.sha,
      shortSha: c.shortSha,
      message: c.message,
      taskId: worktree.taskId,
      timestamp: c.timestamp,
      repositoryId: repository.id,
      githubUrl: githubUrl ? `${githubUrl}/commit/${c.sha}` : undefined,
    }))

    if (!plan.gitSummary) {
      plan.gitSummary = { commits: [] }
    }
    if (!plan.gitSummary.commits) {
      plan.gitSummary.commits = []
    }
    plan.gitSummary.commits.push(...planCommits)

    savePlan(plan)
    emitPlanUpdate(plan)

    addPlanActivity(
      plan.id,
      'success',
      `Pushed ${commits.length} commit(s) for task ${worktree.taskId}`,
      `Branch: ${worktree.branch}`
    )
  } catch (error) {
    addPlanActivity(
      plan.id,
      'warning',
      `Failed to push commits for task ${worktree.taskId}`,
      error instanceof Error ? error.message : 'Unknown error'
    )
  }
}

/**
 * Record a pull request created by a task agent
 * Used for raise_prs strategy
 */
async function recordPullRequest(plan: Plan, worktree: PlanWorktree, repository: Repository): Promise<void> {
  // The agent should have created a PR and closed the task with the PR URL
  // For now, we'll try to extract PR info from the bd task close message
  // This could be enhanced to actually query GitHub for PR info

  try {
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)

    // Try to get PR info using gh CLI
    const { stdout } = await execAsync(
      `gh pr list --head "${worktree.branch}" --json number,title,url,baseRefName,headRefName,state --limit 1`,
      { cwd: worktree.path }
    )

    const prs = JSON.parse(stdout)
    if (prs.length > 0) {
      const pr = prs[0]

      const planPR: PlanPullRequest = {
        number: pr.number,
        title: pr.title,
        url: pr.url,
        taskId: worktree.taskId,
        baseBranch: pr.baseRefName,
        headBranch: pr.headRefName,
        status: pr.state.toLowerCase() as 'open' | 'merged' | 'closed',
        repositoryId: repository.id,
      }

      // Store PR info in worktree
      worktree.prNumber = pr.number
      worktree.prUrl = pr.url
      worktree.prBaseBranch = pr.baseRefName

      // Add to git summary
      if (!plan.gitSummary) {
        plan.gitSummary = { pullRequests: [] }
      }
      if (!plan.gitSummary.pullRequests) {
        plan.gitSummary.pullRequests = []
      }
      plan.gitSummary.pullRequests.push(planPR)

      savePlan(plan)
      emitPlanUpdate(plan)

      addPlanActivity(
        plan.id,
        'success',
        `PR #${pr.number} created for task ${worktree.taskId}`,
        pr.url
      )
    }
  } catch (error) {
    // PR info not available - that's OK, agent might not have created one yet
    addPlanActivity(
      plan.id,
      'info',
      `No PR found for task ${worktree.taskId}`,
      'Agent may not have created a PR'
    )
  }
}

/**
 * Cleanup all worktrees for a plan (used when user marks plan complete)
 */
export async function cleanupAllWorktrees(planId: string): Promise<void> {
  const plan = getPlanById(planId)
  if (!plan || !plan.worktrees) return

  addPlanActivity(planId, 'info', 'Cleaning up worktrees...')

  for (const worktree of plan.worktrees) {
    if (worktree.status === 'cleaned') continue

    await cleanupTaskAgent(planId, worktree.taskId)
  }

  // Prune any stale worktree references
  const repositories = await getAllRepositories()
  for (const repo of repositories) {
    try {
      await pruneWorktrees(repo.rootPath)
    } catch {
      // Ignore prune errors
    }
  }

  addPlanActivity(planId, 'success', 'All worktrees cleaned up')
}

/**
 * Mark a plan as complete (triggers cleanup)
 */
export async function completePlan(planId: string): Promise<Plan | null> {
  const plan = getPlanById(planId)
  if (!plan) return null

  // Stop any remaining headless agents
  await stopAllHeadlessAgents(planId)

  // Clean up all worktrees
  await cleanupAllWorktrees(planId)

  // Cleanup orchestrator
  cleanupOrchestrator(plan)

  plan.status = 'completed'
  plan.updatedAt = new Date().toISOString()
  savePlan(plan)
  emitPlanUpdate(plan)

  addPlanActivity(planId, 'success', 'Plan completed', 'All work finished and cleaned up')

  // Remove from executing set
  executingPlans.delete(planId)

  // Stop tool proxy if no more active plans
  const activePlans = loadPlans().filter(p => p.status === 'delegating' || p.status === 'in_progress')
  if (activePlans.length === 0 && isProxyRunning()) {
    await stopToolProxy()
    addPlanActivity(planId, 'info', 'Tool proxy stopped')
  }

  return plan
}

/**
 * Get available repositories for a plan based on reference agents
 */
async function getRepositoriesForPlan(planId: string): Promise<Repository[]> {
  const plan = getPlanById(planId)
  if (!plan || !plan.referenceAgentId) return []

  // Get all non-system agents
  const agents = getWorkspaces().filter(a => !a.isOrchestrator && !a.isPlanAgent && !a.isTaskAgent)

  // Collect unique repositories
  const repoIds = new Set<string>()
  const repositories: Repository[] = []

  for (const agent of agents) {
    if (agent.repositoryId) {
      if (!repoIds.has(agent.repositoryId)) {
        const repo = await getRepositoryById(agent.repositoryId)
        if (repo) {
          repoIds.add(repo.id)
          repositories.push(repo)
        }
      }
    }
  }

  return repositories
}

/**
 * Update plan statuses based on task completion
 */
async function updatePlanStatuses(): Promise<void> {
  const plans = loadPlans()

  for (const plan of plans) {
    if (plan.status === 'delegating' || plan.status === 'in_progress') {
      // Get all tasks for this plan (not just children of an epic)
      // Use status: 'all' to include closed tasks for completion checks
      const allTasks = await bdList(plan.id, { status: 'all' })

      // Filter to just tasks (not epics)
      const allTaskItems = allTasks.filter(t => t.type === 'task')

      if (allTaskItems.length === 0) {
        // No tasks have been created yet, stay in current status
        continue
      }

      // Check task states
      const openTasks = allTaskItems.filter(t => t.status === 'open')
      const closedTasks = allTaskItems.filter(t => t.status === 'closed')
      const allClosed = openTasks.length === 0 && closedTasks.length > 0

      if (allClosed) {
        // All tasks closed - mark as ready_for_review (don't auto-cleanup)
        // User must explicitly click "Mark Complete" to trigger cleanup
        plan.status = 'ready_for_review'
        plan.updatedAt = new Date().toISOString()
        savePlan(plan)
        emitPlanUpdate(plan)
        addPlanActivity(plan.id, 'success', 'All tasks completed', 'Click "Mark Complete" to cleanup worktrees')
      } else if (openTasks.length > 0 && plan.status === 'delegating') {
        // Has open tasks, move to in_progress
        plan.status = 'in_progress'
        plan.updatedAt = new Date().toISOString()
        savePlan(plan)
        emitPlanUpdate(plan)
        addPlanActivity(plan.id, 'info', 'Tasks are being worked on', `${openTasks.length} task(s) remaining`)
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

/**
 * Cleanup all plan-related resources (called on app shutdown)
 */
export async function cleanupPlanManager(): Promise<void> {
  console.log('[PlanManager] Cleaning up...')

  // Stop task polling
  stopTaskPolling()

  // Stop all headless agents
  for (const [taskId] of headlessAgents) {
    try {
      await stopHeadlessTaskAgent(taskId)
    } catch (error) {
      console.error(`[PlanManager] Error stopping headless agent ${taskId}:`, error)
    }
  }

  // Stop all Docker containers (belt and suspenders)
  try {
    await stopAllContainers()
  } catch (error) {
    console.error('[PlanManager] Error stopping containers:', error)
  }

  // Stop tool proxy
  if (isProxyRunning()) {
    try {
      await stopToolProxy()
    } catch (error) {
      console.error('[PlanManager] Error stopping tool proxy:', error)
    }
  }

  console.log('[PlanManager] Cleanup complete')
}
