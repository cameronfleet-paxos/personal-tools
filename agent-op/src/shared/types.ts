// Workspace definition (stored in ~/.agent-operator/config.json)
export interface Workspace {
  id: string
  name: string
  directory: string
  theme: ThemeName
}

// App state (stored in ~/.agent-operator/state.json)
export interface AppState {
  activeWorkspaceIds: string[]
  layout: 'grid' | 'tabs'
  focusedWorkspaceId?: string
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
