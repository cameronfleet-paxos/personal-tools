import { loadState, saveState, getDefaultPreferences } from './config'
import type { AppState, AgentTab, AppPreferences } from '../shared/types'

const MAX_AGENTS_PER_TAB = 4

let currentState: AppState = {
  activeWorkspaceIds: [],
  tabs: [],
  activeTabId: null,
  preferences: getDefaultPreferences(),
}

function generateTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function getNextTabName(): string {
  const existingNumbers = currentState.tabs
    .map((t) => {
      const match = t.name.match(/^Tab (\d+)$/)
      return match ? parseInt(match[1], 10) : 0
    })
    .filter((n) => n > 0)

  let nextNum = 1
  while (existingNumbers.includes(nextNum)) {
    nextNum++
  }
  return `Tab ${nextNum}`
}

export function initializeState(): AppState {
  currentState = loadState()

  // Migration: convert old state without tabs to new format
  if (!currentState.tabs || currentState.tabs.length === 0) {
    const defaultTab: AgentTab = {
      id: generateTabId(),
      name: 'Tab 1',
      workspaceIds: currentState.activeWorkspaceIds.slice(0, MAX_AGENTS_PER_TAB),
    }
    currentState.tabs = [defaultTab]
    currentState.activeTabId = defaultTab.id

    // Handle overflow if more than 4 active workspaces
    const remaining = currentState.activeWorkspaceIds.slice(MAX_AGENTS_PER_TAB)
    while (remaining.length > 0) {
      const overflowTab: AgentTab = {
        id: generateTabId(),
        name: getNextTabName(),
        workspaceIds: remaining.splice(0, MAX_AGENTS_PER_TAB),
      }
      currentState.tabs.push(overflowTab)
    }

    persistState()
  }

  // Ensure there's always at least one tab
  if (currentState.tabs.length === 0) {
    const defaultTab: AgentTab = {
      id: generateTabId(),
      name: 'Tab 1',
      workspaceIds: [],
    }
    currentState.tabs = [defaultTab]
    currentState.activeTabId = defaultTab.id
    persistState()
  }

  // Ensure activeTabId is valid
  if (
    !currentState.activeTabId ||
    !currentState.tabs.find((t) => t.id === currentState.activeTabId)
  ) {
    currentState.activeTabId = currentState.tabs[0].id
    persistState()
  }

  return currentState
}

export function getState(): AppState {
  return { ...currentState, tabs: currentState.tabs.map((t) => ({ ...t })) }
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

export function setFocusedWorkspace(workspaceId: string | undefined): void {
  currentState.focusedWorkspaceId = workspaceId
  persistState()
}

// Tab management functions

export function createTab(name?: string): AgentTab {
  const tab: AgentTab = {
    id: generateTabId(),
    name: name || getNextTabName(),
    workspaceIds: [],
  }
  currentState.tabs.push(tab)
  persistState()
  return tab
}

export function renameTab(tabId: string, name: string): void {
  const tab = currentState.tabs.find((t) => t.id === tabId)
  if (tab) {
    tab.name = name
    persistState()
  }
}

export function deleteTab(tabId: string): boolean {
  // Cannot delete the last tab
  if (currentState.tabs.length <= 1) {
    return false
  }

  const tabIndex = currentState.tabs.findIndex((t) => t.id === tabId)
  if (tabIndex === -1) {
    return false
  }

  const tab = currentState.tabs[tabIndex]

  // Remove workspaces from activeWorkspaceIds (they will be stopped)
  currentState.activeWorkspaceIds = currentState.activeWorkspaceIds.filter(
    (id) => !tab.workspaceIds.includes(id)
  )

  // Remove the tab
  currentState.tabs.splice(tabIndex, 1)

  // Update activeTabId if needed
  if (currentState.activeTabId === tabId) {
    currentState.activeTabId = currentState.tabs[0].id
  }

  persistState()
  return true
}

export function setActiveTab(tabId: string): void {
  if (currentState.tabs.find((t) => t.id === tabId)) {
    currentState.activeTabId = tabId
    persistState()
  }
}

export function addWorkspaceToTab(
  workspaceId: string,
  tabId: string
): boolean {
  const tab = currentState.tabs.find((t) => t.id === tabId)
  if (!tab || tab.workspaceIds.length >= MAX_AGENTS_PER_TAB) {
    return false
  }

  if (!tab.workspaceIds.includes(workspaceId)) {
    tab.workspaceIds.push(workspaceId)
    persistState()
  }
  return true
}

export function removeWorkspaceFromTab(workspaceId: string): void {
  for (const tab of currentState.tabs) {
    const index = tab.workspaceIds.indexOf(workspaceId)
    if (index !== -1) {
      tab.workspaceIds.splice(index, 1)
      break
    }
  }
  persistState()
}

export function getOrCreateTabForWorkspace(workspaceId: string): AgentTab {
  // Check if workspace is already in a tab
  for (const tab of currentState.tabs) {
    if (tab.workspaceIds.includes(workspaceId)) {
      return tab
    }
  }

  // Find first tab with space
  for (const tab of currentState.tabs) {
    if (tab.workspaceIds.length < MAX_AGENTS_PER_TAB) {
      return tab
    }
  }

  // All tabs full, create a new one
  return createTab()
}

export function getTabForWorkspace(workspaceId: string): AgentTab | undefined {
  return currentState.tabs.find((t) => t.workspaceIds.includes(workspaceId))
}

function persistState(): void {
  saveState(currentState)
}

export function getActiveWorkspaceIds(): string[] {
  return [...currentState.activeWorkspaceIds]
}

export function getTabs(): AgentTab[] {
  return currentState.tabs.map((t) => ({ ...t }))
}

export function getActiveTabId(): string | null {
  return currentState.activeTabId
}

// Preferences management
export function getPreferences(): AppPreferences {
  return { ...currentState.preferences }
}

export function setPreferences(preferences: Partial<AppPreferences>): AppPreferences {
  currentState.preferences = { ...currentState.preferences, ...preferences }
  persistState()
  return currentState.preferences
}
