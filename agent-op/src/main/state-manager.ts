import { loadState, saveState } from './config'
import type { AppState } from '../shared/types'

let currentState: AppState = {
  activeWorkspaceIds: [],
  layout: 'grid',
}

export function initializeState(): AppState {
  currentState = loadState()
  return currentState
}

export function getState(): AppState {
  return { ...currentState }
}

export function setActiveWorkspaces(workspaceIds: string[]): void {
  currentState.activeWorkspaceIds = workspaceIds
  persistState()
}

export function addActiveWorkspace(workspaceId: string): void {
  if (!currentState.activeWorkspaceIds.includes(workspaceId)) {
    currentState.activeWorkspaceIds.push(workspaceId)
    persistState()
  }
}

export function removeActiveWorkspace(workspaceId: string): void {
  currentState.activeWorkspaceIds = currentState.activeWorkspaceIds.filter(
    (id) => id !== workspaceId
  )
  if (currentState.focusedWorkspaceId === workspaceId) {
    currentState.focusedWorkspaceId = currentState.activeWorkspaceIds[0]
  }
  persistState()
}

export function setLayout(layout: 'grid' | 'tabs'): void {
  currentState.layout = layout
  persistState()
}

export function setFocusedWorkspace(workspaceId: string | undefined): void {
  currentState.focusedWorkspaceId = workspaceId
  persistState()
}

function persistState(): void {
  saveState(currentState)
}

export function getActiveWorkspaceIds(): string[] {
  return [...currentState.activeWorkspaceIds]
}
