/**
 * Dev Test Harness
 *
 * Testing tool for the headless agent flow that mocks:
 * - Plan creation (uses fake plan with preset tasks)
 * - Orchestrator (marks tasks ready, monitors completion)
 * - Task agents (emits fake stream-json events)
 *
 * What's real:
 * - Beads tasks (uses actual `bd` commands)
 * - HeadlessTerminal UI
 * - IPC events
 *
 * Usage:
 *   // From renderer dev console (Cmd+Shift+D)
 *   window.electronAPI.devRunMockFlow()
 *   window.electronAPI.devStartMockAgent('test-task-1')
 *
 *   // Environment override
 *   BISMARK_MOCK_AGENTS=true
 */

import { EventEmitter } from 'events'
import { exec } from 'child_process'
import { promisify } from 'util'
import { BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import type {
  StreamEvent,
  StreamInitEvent,
  StreamMessageEvent,
  StreamToolUseEvent,
  StreamToolResultEvent,
  StreamResultEvent,
  HeadlessAgentInfo,
  HeadlessAgentStatus,
} from '../shared/types'

const execAsync = promisify(exec)

// ============================================
// Mock Event Sequences
// ============================================

/**
 * Generates a realistic sequence of mock stream events
 */
function generateMockEventSequence(taskId: string): StreamEvent[] {
  const now = () => new Date().toISOString()

  return [
    // 1. System init
    {
      type: 'init',
      timestamp: now(),
      session_id: `mock-session-${taskId}`,
      model: 'claude-sonnet-4-20250514',
    } as StreamInitEvent,

    // 2. Assistant thinking
    {
      type: 'message',
      timestamp: now(),
      content: `I'll help with task ${taskId}. Let me start by reading the relevant files...`,
      role: 'assistant',
    } as StreamMessageEvent,

    // 3. Read file
    {
      type: 'tool_use',
      timestamp: now(),
      tool_name: 'Read',
      tool_id: `tool-${Date.now()}-1`,
      input: { file_path: '/workspace/src/main.ts' },
    } as StreamToolUseEvent,

    // 4. Read result
    {
      type: 'tool_result',
      timestamp: now(),
      tool_id: `tool-${Date.now()}-1`,
      output: '// Main entry point\nimport { app } from "electron"\n\napp.whenReady().then(() => {\n  console.log("App ready")\n})',
      is_error: false,
    } as StreamToolResultEvent,

    // 5. Assistant continues
    {
      type: 'message',
      timestamp: now(),
      content: 'I can see the main entry point. Now I\'ll make the necessary changes...',
      role: 'assistant',
    } as StreamMessageEvent,

    // 6. Edit file
    {
      type: 'tool_use',
      timestamp: now(),
      tool_name: 'Edit',
      tool_id: `tool-${Date.now()}-2`,
      input: {
        file_path: '/workspace/src/main.ts',
        old_string: 'console.log("App ready")',
        new_string: 'console.log("App ready - Task complete!")',
      },
    } as StreamToolUseEvent,

    // 7. Edit result
    {
      type: 'tool_result',
      timestamp: now(),
      tool_id: `tool-${Date.now()}-2`,
      output: 'Successfully edited file',
      is_error: false,
    } as StreamToolResultEvent,

    // 8. Run tests
    {
      type: 'tool_use',
      timestamp: now(),
      tool_name: 'Bash',
      tool_id: `tool-${Date.now()}-3`,
      input: { command: 'npm test' },
    } as StreamToolUseEvent,

    // 9. Test result
    {
      type: 'tool_result',
      timestamp: now(),
      tool_id: `tool-${Date.now()}-3`,
      output: 'PASS src/main.test.ts\n  ✓ app initializes correctly (15ms)\n  ✓ handles events (8ms)\n\nTest Suites: 1 passed, 1 total\nTests:       2 passed, 2 total',
      is_error: false,
    } as StreamToolResultEvent,

    // 10. Final message
    {
      type: 'message',
      timestamp: now(),
      content: 'Task completed successfully. I\'ve made the changes and all tests pass.',
      role: 'assistant',
    } as StreamMessageEvent,

    // 11. Result
    {
      type: 'result',
      timestamp: now(),
      result: 'Task completed successfully',
      cost: {
        input_tokens: 2500,
        output_tokens: 450,
        total_cost_usd: 0.0125,
      },
      duration_ms: 15000,
      num_turns: 5,
    } as StreamResultEvent,
  ]
}

// ============================================
// Mock Headless Agent
// ============================================

export interface MockHeadlessAgentOptions {
  taskId: string
  planId: string
  worktreePath: string
  eventIntervalMs?: number // Default: 1500ms between events
  onComplete?: () => Promise<void>
}

/**
 * MockHeadlessAgent emits fake stream-json events to simulate a real agent
 */
export class MockHeadlessAgent extends EventEmitter {
  private taskId: string
  private planId: string
  private worktreePath: string
  private eventIntervalMs: number
  private status: HeadlessAgentStatus = 'idle'
  private events: StreamEvent[] = []
  private eventIndex = 0
  private timer: NodeJS.Timeout | null = null
  private startedAt: string = ''
  private onCompleteCallback?: () => Promise<void>

  constructor(options: MockHeadlessAgentOptions) {
    super()
    this.taskId = options.taskId
    this.planId = options.planId
    this.worktreePath = options.worktreePath
    this.eventIntervalMs = options.eventIntervalMs ?? 1500
    this.onCompleteCallback = options.onComplete
  }

  getStatus(): HeadlessAgentStatus {
    return this.status
  }

  getInfo(): HeadlessAgentInfo {
    return {
      id: `mock-agent-${this.taskId}`,
      taskId: this.taskId,
      planId: this.planId,
      status: this.status,
      worktreePath: this.worktreePath,
      events: this.events,
      startedAt: this.startedAt,
      completedAt: this.status === 'completed' || this.status === 'failed'
        ? new Date().toISOString()
        : undefined,
      result: this.status === 'completed'
        ? {
            success: true,
            exitCode: 0,
            result: 'Task completed successfully',
            cost: { input_tokens: 2500, output_tokens: 450, total_cost_usd: 0.0125 },
            duration_ms: (Date.now() - new Date(this.startedAt).getTime()),
          }
        : undefined,
    }
  }

  async start(): Promise<void> {
    if (this.status !== 'idle') {
      throw new Error(`Cannot start mock agent in status: ${this.status}`)
    }

    this.startedAt = new Date().toISOString()
    this.status = 'starting'
    this.emit('status', this.status)

    // Generate the event sequence
    const mockEvents = generateMockEventSequence(this.taskId)

    // Start emitting events
    this.status = 'running'
    this.emit('status', this.status)

    this.emitNextEvent(mockEvents)
  }

  private emitNextEvent(mockEvents: StreamEvent[]): void {
    if (this.eventIndex >= mockEvents.length) {
      this.handleComplete()
      return
    }

    const event = mockEvents[this.eventIndex]
    // Add fresh timestamp
    event.timestamp = new Date().toISOString()

    this.events.push(event)
    this.emit('event', event)

    // Emit typed events
    this.emit(event.type, event)

    this.eventIndex++

    // Schedule next event
    this.timer = setTimeout(() => {
      this.emitNextEvent(mockEvents)
    }, this.eventIntervalMs)
  }

  private async handleComplete(): Promise<void> {
    this.status = 'completed'
    this.emit('status', this.status)

    const result = {
      success: true,
      exitCode: 0,
      result: 'Task completed successfully',
      cost: { input_tokens: 2500, output_tokens: 450, total_cost_usd: 0.0125 },
      duration_ms: Date.now() - new Date(this.startedAt).getTime(),
    }

    this.emit('complete', result)

    // Call completion callback (e.g., close the bd task)
    if (this.onCompleteCallback) {
      await this.onCompleteCallback()
    }
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.status = 'completed'
    this.emit('status', this.status)
  }
}

// ============================================
// Mock Orchestrator
// ============================================

export interface MockOrchestratorOptions {
  planId: string
  planDir: string
  mainWindow: BrowserWindow | null
  onTaskReady?: (taskId: string) => void
}

/**
 * MockOrchestrator simulates the orchestrator behavior:
 * - Monitors for task completion
 * - Marks next task as bismark-ready when blocker completes
 */
export class MockOrchestrator extends EventEmitter {
  private planId: string
  private planDir: string
  private mainWindow: BrowserWindow | null
  private pollInterval: NodeJS.Timeout | null = null
  private completedTasks = new Set<string>()
  private onTaskReadyCallback?: (taskId: string) => void

  constructor(options: MockOrchestratorOptions) {
    super()
    this.planId = options.planId
    this.planDir = options.planDir
    this.mainWindow = options.mainWindow
    this.onTaskReadyCallback = options.onTaskReady
  }

  async start(): Promise<void> {
    console.log('[MockOrchestrator] Starting orchestrator for plan:', this.planId)

    // Start polling for task status changes
    this.pollInterval = setInterval(() => this.checkTaskStatus(), 2000)
  }

  private async checkTaskStatus(): Promise<void> {
    try {
      // List all tasks
      const { stdout } = await execAsync(`bd --sandbox list --dir "${this.planDir}"`)
      const tasks = this.parseTasks(stdout)

      // Check for newly completed tasks
      for (const task of tasks) {
        if (task.status === 'completed' && !this.completedTasks.has(task.id)) {
          this.completedTasks.add(task.id)
          console.log('[MockOrchestrator] Task completed:', task.id)
          this.emit('task-completed', task.id)

          // Mark tasks that were blocked by this one as ready
          await this.markDependentTasksReady(task.id, tasks)
        }
      }

      // Check if all tasks are done
      const allDone = tasks.every(t => t.status === 'completed')
      if (allDone && tasks.length > 0) {
        console.log('[MockOrchestrator] All tasks completed!')
        this.emit('plan-completed')
        this.stop()
      }
    } catch (error) {
      console.error('[MockOrchestrator] Error checking task status:', error)
    }
  }

  private parseTasks(output: string): Array<{ id: string; status: string; blockedBy: string[] }> {
    // Simple parser for bd list output
    // Format varies, but typically: id, subject, status, etc.
    const lines = output.trim().split('\n')
    const tasks: Array<{ id: string; status: string; blockedBy: string[] }> = []

    for (const line of lines) {
      // Skip header/empty lines
      if (!line.trim() || line.includes('──')) continue

      // Try to parse task line (format: ID | Subject | Status | ...)
      const parts = line.split('│').map(p => p.trim())
      if (parts.length >= 3) {
        const id = parts[0]
        const status = parts[2]?.toLowerCase() || 'pending'
        tasks.push({
          id,
          status: status.includes('done') || status.includes('closed') ? 'completed' : 'pending',
          blockedBy: [], // Would need more parsing for real blocked-by info
        })
      }
    }

    return tasks
  }

  private async markDependentTasksReady(_completedTaskId: string, tasks: Array<{ id: string; status: string; blockedBy: string[] }>): Promise<void> {
    // Find tasks that can now be started
    for (const task of tasks) {
      if (task.status !== 'completed') {
        // In a real implementation, would check blockedBy
        // For mock, just mark the next pending task
        try {
          await execAsync(`bd --sandbox label "${task.id}" bismark-ready --dir "${this.planDir}"`)
          console.log('[MockOrchestrator] Marked task ready:', task.id)
          if (this.onTaskReadyCallback) {
            this.onTaskReadyCallback(task.id)
          }
          break // Only mark one at a time
        } catch {
          // Task might already have label or be closed
        }
      }
    }
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
  }
}

// ============================================
// Mock Plan Setup
// ============================================

export interface MockPlan {
  planId: string
  planDir: string
  tasks: Array<{ id: string; subject: string; blockedBy?: string[] }>
}

/**
 * Creates a test plan with beads tasks for testing
 */
export async function setupMockPlan(): Promise<MockPlan> {
  // Create a temp directory for the plan
  const planId = `mock-plan-${Date.now()}`
  const planDir = path.join(os.tmpdir(), 'bismark-mock-plans', planId)

  // Ensure directory exists
  await fs.promises.mkdir(planDir, { recursive: true })

  console.log('[MockPlanSetup] Creating mock plan in:', planDir)

  // Initialize beads repo
  await execAsync(`bd --sandbox init --dir "${planDir}"`)

  // Create tasks with dependencies
  const tasks = [
    { id: '', subject: 'Task 1: Update config files', blockedBy: [] as string[] },
    { id: '', subject: 'Task 2: Add new feature', blockedBy: [] as string[] },
    { id: '', subject: 'Task 3: Write tests', blockedBy: [] as string[] },
  ]

  // Create task 1 (no blockers)
  const { stdout: out1 } = await execAsync(
    `bd --sandbox create "${tasks[0].subject}" --dir "${planDir}"`
  )
  tasks[0].id = extractTaskId(out1)

  // Create task 2 (blocked by task 1)
  const { stdout: out2 } = await execAsync(
    `bd --sandbox create "${tasks[1].subject}" --blocked-by "${tasks[0].id}" --dir "${planDir}"`
  )
  tasks[1].id = extractTaskId(out2)
  tasks[1].blockedBy = [tasks[0].id]

  // Create task 3 (blocked by task 2)
  const { stdout: out3 } = await execAsync(
    `bd --sandbox create "${tasks[2].subject}" --blocked-by "${tasks[1].id}" --dir "${planDir}"`
  )
  tasks[2].id = extractTaskId(out3)
  tasks[2].blockedBy = [tasks[1].id]

  // Mark first task as bismark-ready (simulates orchestrator marking it)
  await execAsync(`bd --sandbox label "${tasks[0].id}" bismark-ready --dir "${planDir}"`)

  console.log('[MockPlanSetup] Created tasks:', tasks.map(t => t.id))

  return { planId, planDir, tasks }
}

function extractTaskId(output: string): string {
  // bd create output typically includes the task ID
  // Try to extract it - format varies
  const match = output.match(/([a-z0-9-]+)/) // Simple ID pattern
  return match?.[1] || `task-${Date.now()}`
}

// ============================================
// Dev Test Harness Manager
// ============================================

let mainWindow: BrowserWindow | null = null
const activeAgents = new Map<string, MockHeadlessAgent>()
let activeOrchestrator: MockOrchestrator | null = null

export function setDevHarnessWindow(window: BrowserWindow | null): void {
  mainWindow = window
}

/**
 * Check if mock agents should be used
 */
export function shouldUseMockAgents(): boolean {
  return process.env.BISMARK_MOCK_AGENTS === 'true' || process.env.NODE_ENV === 'development'
}

/**
 * Start a single mock headless agent for testing
 */
export async function startMockAgent(
  taskId: string,
  planId: string = 'test-plan',
  worktreePath: string = '/tmp/mock-worktree'
): Promise<MockHeadlessAgent> {
  console.log('[DevHarness] Starting mock agent:', taskId)

  const agent = new MockHeadlessAgent({
    taskId,
    planId,
    worktreePath,
    eventIntervalMs: 1500,
    onComplete: async () => {
      console.log('[DevHarness] Mock agent completed:', taskId)
      activeAgents.delete(taskId)
    },
  })

  // Forward events to renderer
  agent.on('status', (status: HeadlessAgentStatus) => {
    mainWindow?.webContents.send('headless-agent-update', agent.getInfo())
  })

  agent.on('event', (event: StreamEvent) => {
    mainWindow?.webContents.send('headless-agent-event', { planId, taskId, event })
  })

  // Notify renderer that agent started
  mainWindow?.webContents.send('headless-agent-started', { taskId, planId, worktreePath })
  mainWindow?.webContents.send('headless-agent-update', agent.getInfo())

  activeAgents.set(taskId, agent)
  await agent.start()

  return agent
}

/**
 * Stop a mock agent
 */
export async function stopMockAgent(taskId: string): Promise<void> {
  const agent = activeAgents.get(taskId)
  if (agent) {
    await agent.stop()
    activeAgents.delete(taskId)
  }
}

/**
 * Get mock agent info
 */
export function getMockAgentInfo(taskId: string): HeadlessAgentInfo | undefined {
  const agent = activeAgents.get(taskId)
  return agent?.getInfo()
}

/**
 * Get all mock agents for a plan
 */
export function getMockAgentsForPlan(planId: string): HeadlessAgentInfo[] {
  return Array.from(activeAgents.values())
    .filter(agent => agent.getInfo().planId === planId)
    .map(agent => agent.getInfo())
}

/**
 * Run the full mock flow: plan → orchestrator → task agents
 */
export async function runMockFlow(): Promise<MockPlan> {
  console.log('[DevHarness] Running full mock flow')

  // Stop any existing flow
  await stopMockFlow()

  // Set up mock plan with beads tasks
  const plan = await setupMockPlan()

  // Start mock orchestrator
  activeOrchestrator = new MockOrchestrator({
    planId: plan.planId,
    planDir: plan.planDir,
    mainWindow,
    onTaskReady: async (taskId: string) => {
      // Start a mock agent for the ready task
      await startMockAgent(taskId, plan.planId, plan.planDir)
    },
  })

  activeOrchestrator.on('plan-completed', () => {
    console.log('[DevHarness] Mock flow completed!')
    mainWindow?.webContents.send('plan-update', {
      id: plan.planId,
      status: 'completed',
    })
  })

  await activeOrchestrator.start()

  // Start the first agent (task 1 is already marked ready)
  if (plan.tasks.length > 0) {
    await startMockAgent(plan.tasks[0].id, plan.planId, plan.planDir)
  }

  return plan
}

/**
 * Stop all mock components
 */
export async function stopMockFlow(): Promise<void> {
  // Stop all agents
  for (const [taskId, agent] of activeAgents) {
    await agent.stop()
  }
  activeAgents.clear()

  // Stop orchestrator
  if (activeOrchestrator) {
    activeOrchestrator.stop()
    activeOrchestrator = null
  }
}

/**
 * Clean up on app exit
 */
export async function cleanupDevHarness(): Promise<void> {
  await stopMockFlow()
}
