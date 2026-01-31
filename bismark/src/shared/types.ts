import type { AgentIconName } from './constants'

// Repository configuration (stored in ~/.bismark/repositories.json)
export interface Repository {
  id: string              // Hash of rootPath
  rootPath: string        // Absolute path to repository root
  name: string            // Directory basename
  defaultBranch: string   // Usually 'main' or 'master'
  remoteUrl?: string      // Origin remote URL
  prFlow?: {
    enabled: boolean
    baseBranch: string
    greenPRCriteria?: string  // Instructions for verifying PR is ready
  }
}

// Agent definition (stored in ~/.bismark/config.json)
export interface Agent {
  id: string
  name: string
  directory: string
  purpose: string
  theme: ThemeName
  icon: AgentIconName
  sessionId?: string // Claude session ID for resuming sessions across app restarts
  isOrchestrator?: boolean // Marks orchestrator workspaces (hidden from UI)
  isPlanAgent?: boolean // Marks plan agent workspaces (temporary, for task creation)

  // Repository linkage
  repositoryId?: string         // Reference to Repository.id

  // Task agent fields (for agents created by plan execution)
  isTaskAgent?: boolean         // Created for a specific plan task
  parentPlanId?: string         // Plan that created this task agent
  worktreePath?: string         // Path to worktree (for task agents)
  taskId?: string               // Associated task ID
}

// Alias for backwards compatibility
export type Workspace = Agent

// Tab containing up to 4 agents in a 2x2 grid
export interface AgentTab {
  id: string
  name: string
  workspaceIds: string[] // Max 4, order = grid position (TL, TR, BL, BR)
  isPlanTab?: boolean // Identifies plan orchestrator tabs
}

// Attention mode determines how waiting agents are displayed
export type AttentionMode = 'focus' | 'expand'

// Operating mode determines how agents work together
export type OperatingMode = 'solo' | 'team'

// App preferences (stored in ~/.bismark/state.json)
export interface AppPreferences {
  attentionMode: AttentionMode
  operatingMode: OperatingMode
}

// App state (stored in ~/.bismark/state.json)
export interface AppState {
  activeWorkspaceIds: string[]
  tabs: AgentTab[]
  activeTabId: string | null
  focusedWorkspaceId?: string
  preferences: AppPreferences
  // Team mode state
  planSidebarOpen?: boolean
  activePlanId?: string | null
}

// Theme presets
export type ThemeName =
  | 'brown'
  | 'blue'
  | 'red'
  | 'gray'
  | 'green'
  | 'purple'
  | 'teal'
  | 'orange'
  | 'pink'

export interface ThemeColors {
  bg: string
  fg: string
}

// Config file structure
export interface AppConfig {
  workspaces: Workspace[]
}

// Terminal session info
export interface TerminalSession {
  id: string
  workspaceId: string
  isWaiting: boolean
}

// Plan status for team mode
// 'ready_for_review' = all agents done, awaiting user review before cleanup
export type PlanStatus = 'draft' | 'delegating' | 'in_progress' | 'ready_for_review' | 'completed' | 'failed'

// Worktree status for plan execution
export type PlanWorktreeStatus = 'active' | 'ready_for_review' | 'cleaned'

// Worktree created for a plan task
export interface PlanWorktree {
  id: string
  planId: string
  taskId: string
  repositoryId: string
  path: string                  // e.g., ~/.bismark/plans/{planId}/worktrees/pax/fix-bug
  branch: string
  agentId: string               // Task agent working in this worktree
  status: PlanWorktreeStatus    // ready_for_review = agent done, awaiting user review
  createdAt: string
}

// Plan definition for team mode coordination
export interface Plan {
  id: string
  title: string
  description: string
  status: PlanStatus
  createdAt: string
  updatedAt: string
  referenceAgentId: string | null
  beadEpicId: string | null
  orchestratorWorkspaceId: string | null // Tracks orchestrator workspace
  orchestratorTabId: string | null // Tracks orchestrator's dedicated tab
  planAgentWorkspaceId?: string | null // Tracks plan agent workspace (temporary)

  // Worktree tracking for new plan execution model
  worktrees?: PlanWorktree[]
  maxParallelAgents?: number    // Default: 4
}

// Task assignment status
export type TaskAssignmentStatus = 'pending' | 'sent' | 'in_progress' | 'completed' | 'failed'

// Task assignment linking bd tasks to agents
export interface TaskAssignment {
  beadId: string        // bd task ID
  agentId: string       // Assigned agent
  status: TaskAssignmentStatus
  assignedAt: string
  completedAt?: string
}

// Activity log entry type for plan execution visibility
export type PlanActivityType = 'info' | 'success' | 'warning' | 'error'

// Activity log entry for plan execution
export interface PlanActivity {
  id: string
  planId: string
  timestamp: string
  type: PlanActivityType
  message: string
  details?: string  // Optional extra context
}
