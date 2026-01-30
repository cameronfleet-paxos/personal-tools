// Agent definition (stored in ~/.bismark/config.json)
export interface Agent {
  id: string
  name: string
  directory: string
  purpose: string
  theme: ThemeName
}

// Alias for backwards compatibility
export type Workspace = Agent

// Tab containing up to 4 agents in a 2x2 grid
export interface AgentTab {
  id: string
  name: string
  workspaceIds: string[] // Max 4, order = grid position (TL, TR, BL, BR)
}

// Attention mode determines how waiting agents are displayed
export type AttentionMode = 'focus' | 'expand'

// App preferences (stored in ~/.bismark/state.json)
export interface AppPreferences {
  attentionMode: AttentionMode
}

// App state (stored in ~/.bismark/state.json)
export interface AppState {
  activeWorkspaceIds: string[]
  tabs: AgentTab[]
  activeTabId: string | null
  focusedWorkspaceId?: string
  preferences: AppPreferences
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
