import './index.css'
import './electron.d.ts'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, ChevronRight, Settings, Check, X, Maximize2, Minimize2 } from 'lucide-react'
import { Button } from '@/renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/renderer/components/ui/dialog'
import { AgentModal } from '@/renderer/components/WorkspaceModal'
import { AgentCard } from '@/renderer/components/WorkspaceCard'
import { AgentIcon } from '@/renderer/components/AgentIcon'
import { Terminal } from '@/renderer/components/Terminal'
import { TabBar } from '@/renderer/components/TabBar'
import { Logo } from '@/renderer/components/Logo'
import { SettingsModal } from '@/renderer/components/SettingsModal'
import type { Agent, AppState, AgentTab, AppPreferences } from '@/shared/types'

interface ActiveTerminal {
  terminalId: string
  workspaceId: string
}

// Type for terminal write functions
type TerminalWriter = (data: string) => void

function App() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [activeTerminals, setActiveTerminals] = useState<ActiveTerminal[]>([])
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null)
  const [tabs, setTabs] = useState<AgentTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | undefined>()
  const [waitingQueue, setWaitingQueue] = useState<string[]>([])
  const [preferences, setPreferences] = useState<AppPreferences>({
    attentionMode: 'focus',
  })

  // Track which terminals have finished booting (by terminalId)
  const [bootedTerminals, setBootedTerminals] = useState<Set<string>>(new Set())

  // Drag-and-drop state
  const [draggedWorkspaceId, setDraggedWorkspaceId] = useState<string | null>(null)
  const [dropTargetPosition, setDropTargetPosition] = useState<number | null>(null)

  // Manual maximize state (independent of waiting queue expand mode)
  const [maximizedAgentId, setMaximizedAgentId] = useState<string | null>(null)

  // Stop confirmation dialog state
  const [stopConfirmAgentId, setStopConfirmAgentId] = useState<string | null>(null)

  // Central registry of terminal writers - Map of terminalId -> write function
  const terminalWritersRef = useRef<Map<string, TerminalWriter>>(new Map())

  // Register/unregister terminal writers - stable functions for Terminal components
  const registerWriter = useCallback(
    (terminalId: string, writer: TerminalWriter) => {
      terminalWritersRef.current.set(terminalId, writer)
    },
    []
  )

  const unregisterWriter = useCallback((terminalId: string) => {
    terminalWritersRef.current.delete(terminalId)
  }, [])

  // Load agents and state on mount
  useEffect(() => {
    loadAgents()
    loadPreferences()
    setupEventListeners()

    return () => {
      window.electronAPI?.removeAllListeners?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mark terminals as booted after 10 seconds
  useEffect(() => {
    const timers: NodeJS.Timeout[] = []

    activeTerminals.forEach(({ terminalId }) => {
      if (!bootedTerminals.has(terminalId)) {
        const timer = setTimeout(() => {
          setBootedTerminals((prev) => new Set(prev).add(terminalId))
        }, 10000)
        timers.push(timer)
      }
    })

    return () => {
      timers.forEach((timer) => clearTimeout(timer))
    }
  }, [activeTerminals, bootedTerminals])

  // Keyboard shortcut for Next in expand mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+N for next waiting agent
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        if (preferences.attentionMode === 'expand' && waitingQueue.length > 1) {
          e.preventDefault()
          // Move to next in queue - inline to avoid stale closure
          const nextAgentId = waitingQueue[1]
          const tab = tabs.find((t) => t.workspaceIds.includes(nextAgentId))
          if (tab && tab.id !== activeTabId) {
            window.electronAPI?.setActiveTab?.(tab.id)
            setActiveTabId(tab.id)
          }
          setFocusedAgentId(nextAgentId)
          window.electronAPI?.setFocusedWorkspace?.(nextAgentId)
          // Acknowledge if this agent was waiting
          if (waitingQueue.includes(nextAgentId)) {
            window.electronAPI?.acknowledgeWaiting?.(nextAgentId)
            setWaitingQueue((prev) => prev.filter((id) => id !== nextAgentId))
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [preferences.attentionMode, waitingQueue, tabs, activeTabId])

  const loadPreferences = async () => {
    const prefs = await window.electronAPI?.getPreferences?.()
    if (prefs) {
      setPreferences(prefs)
    }
  }

  const handlePreferencesChange = async (newPrefs: Partial<AppPreferences>) => {
    const updated = await window.electronAPI?.setPreferences?.(newPrefs)
    if (updated) {
      setPreferences(updated)
    }
  }

  const setupEventListeners = () => {
    // Listen for initial state from main process
    window.electronAPI?.onInitialState?.((state: AppState) => {
      setTabs(state.tabs || [])
      setActiveTabId(state.activeTabId)
      if (state.focusedWorkspaceId) {
        setFocusedAgentId(state.focusedWorkspaceId)
      }
      // Resume active agents
      if (state.activeWorkspaceIds.length > 0) {
        resumeAgents(state.activeWorkspaceIds)
      }
    })

    // Listen for focus agent events
    window.electronAPI?.onFocusWorkspace?.((agentId: string) => {
      setFocusedAgentId(agentId)
    })

    // Listen for waiting queue changes
    window.electronAPI?.onWaitingQueueChanged?.((queue: string[]) => {
      setWaitingQueue(queue)
      window.electronAPI?.updateTray?.(queue.length)
    })

    // Listen for agent waiting events
    window.electronAPI?.onAgentWaiting?.((agentId: string) => {
      console.log(`[Renderer] Received agent-waiting event for ${agentId}`)
      setWaitingQueue((prev) => {
        console.log(`[Renderer] Current queue: ${JSON.stringify(prev)}`)
        if (!prev.includes(agentId)) {
          const newQueue = [...prev, agentId]
          console.log(`[Renderer] Updated queue: ${JSON.stringify(newQueue)}`)
          window.electronAPI?.updateTray?.(newQueue.length)
          return newQueue
        }
        return prev
      })
    })

    // Global terminal data listener - routes data to the appropriate terminal writer
    window.electronAPI?.onTerminalData?.((terminalId: string, data: string) => {
      // Detect Claude banner to end boot phase early
      // Claude outputs "Claude Code" in its startup banner
      if (data.includes('Claude Code')) {
        setBootedTerminals((prev) => {
          if (!prev.has(terminalId)) {
            return new Set(prev).add(terminalId)
          }
          return prev
        })
      }

      const writer = terminalWritersRef.current.get(terminalId)
      if (writer) {
        writer(data)
      }
    })

    // Global terminal exit listener
    window.electronAPI?.onTerminalExit?.((terminalId: string, code: number) => {
      const writer = terminalWritersRef.current.get(terminalId)
      if (writer) {
        writer(`\r\n\x1b[33mProcess exited with code ${code}\x1b[0m\r\n`)
      }
    })
  }

  const resumeAgents = async (agentIds: string[]) => {
    for (const agentId of agentIds) {
      try {
        // Start fresh claude session (don't try to resume - agent IDs are not valid Claude session IDs)
        const terminalId = await window.electronAPI.createTerminal(agentId)
        setActiveTerminals((prev) => [
          ...prev,
          { terminalId, workspaceId: agentId },
        ])
      } catch (e) {
        console.error(`Failed to start agent ${agentId}:`, e)
      }
    }
    // Refresh tabs after resuming
    const state = await window.electronAPI.getState()
    setTabs(state.tabs || [])
    setActiveTabId(state.activeTabId)
  }

  const loadAgents = async () => {
    const ws = await window.electronAPI.getWorkspaces()
    setAgents(ws)
  }

  const handleSaveAgent = async (agent: Agent) => {
    await window.electronAPI.saveWorkspace(agent)
    await loadAgents()
    setEditingAgent(undefined)
  }

  const handleDeleteAgent = async (id: string) => {
    // Stop terminal if running
    const activeTerminal = activeTerminals.find((t) => t.workspaceId === id)
    if (activeTerminal) {
      await window.electronAPI.closeTerminal(activeTerminal.terminalId)
      await window.electronAPI.stopWorkspace(id)
      setActiveTerminals((prev) => prev.filter((t) => t.workspaceId !== id))
    }
    await window.electronAPI.deleteWorkspace(id)
    await loadAgents()
    setWaitingQueue((prev) => prev.filter((wid) => wid !== id))
    // Refresh tabs
    const state = await window.electronAPI.getState()
    setTabs(state.tabs || [])
  }

  const handleLaunchAgent = async (agentId: string) => {
    // Check if already running
    if (activeTerminals.some((t) => t.workspaceId === agentId)) {
      // Find which tab contains this agent and switch to it
      const tab = tabs.find((t) => t.workspaceIds.includes(agentId))
      if (tab) {
        setActiveTabId(tab.id)
        await window.electronAPI?.setActiveTab?.(tab.id)
      }
      setFocusedAgentId(agentId)
      window.electronAPI?.setFocusedWorkspace?.(agentId)
      return
    }

    const terminalId = await window.electronAPI.createTerminal(agentId)
    setActiveTerminals((prev) => [...prev, { terminalId, workspaceId: agentId }])
    setFocusedAgentId(agentId)
    window.electronAPI?.setFocusedWorkspace?.(agentId)

    // Refresh tabs to get the updated state (main process handles tab placement)
    const state = await window.electronAPI.getState()
    setTabs(state.tabs || [])
    setActiveTabId(state.activeTabId)
  }

  const handleStopAgent = async (agentId: string) => {
    const activeTerminal = activeTerminals.find(
      (t) => t.workspaceId === agentId
    )
    if (activeTerminal) {
      await window.electronAPI.closeTerminal(activeTerminal.terminalId)
      await window.electronAPI.stopWorkspace(agentId)
      setActiveTerminals((prev) =>
        prev.filter((t) => t.workspaceId !== agentId)
      )
      setWaitingQueue((prev) => prev.filter((id) => id !== agentId))
      if (focusedAgentId === agentId) {
        setFocusedAgentId(null)
        window.electronAPI?.setFocusedWorkspace?.(undefined)
      }
      // Clear maximize if this agent was maximized
      if (maximizedAgentId === agentId) {
        setMaximizedAgentId(null)
      }
      // Refresh tabs
      const state = await window.electronAPI.getState()
      setTabs(state.tabs || [])
    }
  }

  const handleEditAgent = (agent: Agent) => {
    setEditingAgent(agent)
    setModalOpen(true)
  }

  const handleAddAgent = () => {
    setEditingAgent(undefined)
    setModalOpen(true)
  }

  const handleFocusAgent = (agentId: string) => {
    // If switching away from a waiting agent we were focused on, acknowledge it
    if (focusedAgentId && focusedAgentId !== agentId && waitingQueue.includes(focusedAgentId)) {
      window.electronAPI?.acknowledgeWaiting?.(focusedAgentId)
      setWaitingQueue((prev) => prev.filter((id) => id !== focusedAgentId))
    }
    setFocusedAgentId(agentId)
    window.electronAPI?.setFocusedWorkspace?.(agentId)
    // Acknowledge if this agent was waiting
    if (waitingQueue.includes(agentId)) {
      window.electronAPI?.acknowledgeWaiting?.(agentId)
      setWaitingQueue((prev) => prev.filter((id) => id !== agentId))
    }
  }

  const handleNextWaiting = () => {
    if (waitingQueue.length > 1) {
      // Move to next in queue
      const nextAgentId = waitingQueue[1]
      // Find which tab contains this agent
      const tab = tabs.find((t) => t.workspaceIds.includes(nextAgentId))
      if (tab && tab.id !== activeTabId) {
        handleTabSelect(tab.id)
      }
      handleFocusAgent(nextAgentId)
    }
  }

  // Tab handlers
  const handleTabSelect = async (tabId: string) => {
    setActiveTabId(tabId)
    await window.electronAPI?.setActiveTab?.(tabId)
  }

  const handleTabRename = async (tabId: string, name: string) => {
    await window.electronAPI?.renameTab?.(tabId, name)
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, name } : t))
    )
  }

  const handleTabDelete = async (tabId: string) => {
    const result = await window.electronAPI?.deleteTab?.(tabId)
    if (result?.success) {
      // Stop all agents in the deleted tab
      for (const workspaceId of result.workspaceIds) {
        const terminal = activeTerminals.find(
          (t) => t.workspaceId === workspaceId
        )
        if (terminal) {
          await window.electronAPI.closeTerminal(terminal.terminalId)
          setActiveTerminals((prev) =>
            prev.filter((t) => t.workspaceId !== workspaceId)
          )
        }
      }
      // Refresh tabs
      const state = await window.electronAPI.getState()
      setTabs(state.tabs || [])
      setActiveTabId(state.activeTabId)
    }
  }

  const handleTabCreate = async () => {
    const newTab = await window.electronAPI?.createTab?.()
    if (newTab) {
      setTabs((prev) => [...prev, newTab])
      setActiveTabId(newTab.id)
      await window.electronAPI?.setActiveTab?.(newTab.id)
    }
  }

  const handleMoveAgentToTab = async (agentId: string, targetTabId: string) => {
    const success = await window.electronAPI?.moveWorkspaceToTab?.(agentId, targetTabId)
    if (success) {
      // Refresh tabs to get updated state
      const state = await window.electronAPI.getState()
      setTabs(state.tabs || [])
      // Switch to the target tab if we moved an active agent
      if (activeTerminals.some((t) => t.workspaceId === agentId)) {
        setActiveTabId(targetTabId)
        await window.electronAPI?.setActiveTab?.(targetTabId)
      }
    }
  }

  const handleReorderInTab = async (sourceWorkspaceId: string, targetPosition: number) => {
    if (!activeTabId) return

    const success = await window.electronAPI?.reorderWorkspaceInTab?.(
      activeTabId,
      sourceWorkspaceId,
      targetPosition
    )
    if (success) {
      // Refresh tabs to get updated state
      const state = await window.electronAPI.getState()
      setTabs(state.tabs || [])
    }
  }

  const getTerminalForAgent = useCallback(
    (agentId: string) => {
      return activeTerminals.find((t) => t.workspaceId === agentId)
    },
    [activeTerminals]
  )

  const isAgentWaiting = (agentId: string) => waitingQueue.includes(agentId)

  // Grid positions: TL (0), TR (1), BL (2), BR (3)
  const gridPositions = [0, 1, 2, 3]

  // Empty state
  if (agents.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <h1 className="text-foreground mb-4">
            <Logo size="lg" />
          </h1>
          <p className="text-muted-foreground mb-6">
            No agents configured. Add one to get started.
          </p>
          <Button onClick={handleAddAgent}>
            <Plus className="h-4 w-4 mr-2" />
            Add Agent
          </Button>
        </div>
        <AgentModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          agent={editingAgent}
          onSave={handleSaveAgent}
        />
      </div>
    )
  }

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo />
          {waitingQueue.length > 0 && (
            <span className="bg-yellow-500 text-black text-xs font-medium px-2 py-0.5 rounded-full">
              {waitingQueue.length} waiting
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {waitingQueue.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextWaiting}
              className="text-yellow-600 border-yellow-500 hover:bg-yellow-500/10"
            >
              <ChevronRight className="h-4 w-4 mr-1" />
              Next ({waitingQueue.length - 1})
            </Button>
          )}
          <Button size="sm" onClick={handleAddAgent}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Tab Bar */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={handleTabSelect}
        onTabRename={handleTabRename}
        onTabDelete={handleTabDelete}
        onTabCreate={handleTabCreate}
      />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Agent list */}
        <aside className="w-64 border-r p-4 overflow-y-auto">
          <div className="space-y-3">
            {agents.map((agent) => {
              const agentTab = tabs.find((t) =>
                t.workspaceIds.includes(agent.id)
              )
              return (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  isActive={activeTerminals.some(
                    (t) => t.workspaceId === agent.id
                  )}
                  isWaiting={isAgentWaiting(agent.id)}
                  tabs={tabs}
                  currentTabId={agentTab?.id}
                  onClick={() => {
                    if (activeTerminals.some((t) => t.workspaceId === agent.id)) {
                      // Find which tab contains this agent and switch to it
                      if (agentTab && agentTab.id !== activeTabId) {
                        handleTabSelect(agentTab.id)
                      }
                      handleFocusAgent(agent.id)
                    }
                  }}
                  onEdit={() => handleEditAgent(agent)}
                  onDelete={() => handleDeleteAgent(agent.id)}
                  onLaunch={() => handleLaunchAgent(agent.id)}
                  onStop={() => handleStopAgent(agent.id)}
                  onMoveToTab={(tabId) => handleMoveAgentToTab(agent.id, tabId)}
                />
              )
            })}
          </div>
        </aside>

        {/* Terminal area - Fixed 2x2 grid per tab */}
        <main className="flex-1 overflow-hidden p-2 relative">
          {/* Render all tabs, with expand mode applied via CSS */}
          {tabs.map((tab) => {
            const isActiveTab = tab.id === activeTabId
            const tabWorkspaceIds = tab.workspaceIds
            const isExpandModeActive = preferences.attentionMode === 'expand' && waitingQueue.length > 0
            // Don't auto-expand if user is already focused on the waiting agent
            const autoExpandedAgentId = isExpandModeActive && focusedAgentId !== waitingQueue[0] ? waitingQueue[0] : null
            const expandedAgentId = maximizedAgentId || autoExpandedAgentId
            // In expand mode, show the tab containing the expanded agent instead of the active tab
            const tabContainsExpandedAgent = expandedAgentId && tabWorkspaceIds.includes(expandedAgentId)
            const shouldShowTab = expandedAgentId ? tabContainsExpandedAgent : isActiveTab

            return (
              <div
                key={tab.id}
                className={`absolute inset-2 ${shouldShowTab ? '' : 'invisible pointer-events-none'}`}
              >
                {tabWorkspaceIds.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    Launch an agent to see the terminal
                  </div>
                ) : (
                  <div
                    className="h-full grid gap-2"
                    style={{
                      gridTemplateColumns: '1fr 1fr',
                      gridTemplateRows: '1fr 1fr',
                    }}
                  >
                    {/* Render active terminals - keyed by terminalId, positioned by CSS grid */}
                    {/* Iterate over activeTerminals (stable order) and look up position from tabWorkspaceIds */}
                    {activeTerminals
                      .filter((t) => tabWorkspaceIds.includes(t.workspaceId))
                      .map((terminal) => {
                        const workspaceId = terminal.workspaceId
                        const position = tabWorkspaceIds.indexOf(workspaceId)
                        if (position === -1) return null
                        const agent = agents.find((a) => a.id === workspaceId)
                        if (!agent) return null

                      const gridRow = position < 2 ? 1 : 2      // 0,1 -> row 1; 2,3 -> row 2
                      const gridCol = position % 2 === 0 ? 1 : 2 // 0,2 -> col 1; 1,3 -> col 2
                      const isDropTarget = dropTargetPosition === position && isActiveTab
                      const isWaiting = isAgentWaiting(workspaceId)
                      const isFocused = focusedAgentId === workspaceId
                      const isExpanded = expandedAgentId === workspaceId
                      const isAutoExpanded = autoExpandedAgentId === workspaceId // for showing Dismiss/Next buttons
                      const isDragging = draggedWorkspaceId === workspaceId

                      return (
                        <div
                          key={terminal.terminalId}
                          style={{ gridRow, gridColumn: gridCol }}
                          draggable={!expandedAgentId}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('workspaceId', workspaceId)
                            setDraggedWorkspaceId(workspaceId)
                          }}
                          onDragEnd={() => {
                            setDraggedWorkspaceId(null)
                            setDropTargetPosition(null)
                          }}
                          onDragOver={(e) => {
                            e.preventDefault()
                            if (!expandedAgentId) {
                              setDropTargetPosition(position)
                            }
                          }}
                          onDragLeave={() => setDropTargetPosition(null)}
                          onDrop={(e) => {
                            e.preventDefault()
                            const sourceId = e.dataTransfer.getData('workspaceId')
                            if (sourceId && sourceId !== workspaceId && !expandedAgentId) {
                              handleReorderInTab(sourceId, position)
                            }
                            setDropTargetPosition(null)
                            setDraggedWorkspaceId(null)
                          }}
                          className={`rounded-lg border overflow-hidden transition-all duration-200 ${
                            isFocused ? 'ring-2 ring-primary' : ''
                          } ${isWaiting ? 'ring-2 ring-yellow-500' : ''} ${
                            !isExpanded && expandedAgentId ? 'invisible' : ''
                          } ${isExpanded ? 'absolute inset-0 z-10' : ''} ${
                            isDragging ? 'opacity-50' : ''
                          } ${isDropTarget && !isDragging ? 'ring-2 ring-primary ring-offset-2' : ''} ${
                            !expandedAgentId ? 'cursor-grab active:cursor-grabbing' : ''
                          }`}
                          onClick={() => {
                            // In expand mode, clicking the terminal shouldn't dismiss it
                            // Only the Dismiss button should do that
                            if (!isExpanded) {
                              handleFocusAgent(workspaceId)
                            }
                          }}
                        >
                          <div
                            className={`px-3 py-1.5 border-b bg-card text-sm font-medium flex items-center justify-between ${
                              isWaiting ? 'bg-yellow-500/20' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <AgentIcon icon={agent.icon} className="w-4 h-4" />
                              <span>{agent.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {isWaiting && (
                                <span className="text-xs bg-yellow-500 text-black px-1.5 py-0.5 rounded">
                                  Waiting
                                </span>
                              )}
                              {/* Maximize/Minimize button */}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (isExpanded) {
                                    setMaximizedAgentId(null) // minimize
                                  } else {
                                    setMaximizedAgentId(workspaceId) // maximize
                                  }
                                }}
                                className="h-6 w-6 p-0"
                              >
                                {isExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                              </Button>
                              {/* X (stop) button */}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setStopConfirmAgentId(workspaceId)
                                }}
                                className="h-6 w-6 p-0"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                              {/* Existing expand mode buttons (only show for auto-expanded) */}
                              {isAutoExpanded && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleFocusAgent(workspaceId)
                                    }}
                                    className="h-6 text-xs"
                                  >
                                    <Check className="h-3 w-3 mr-1" />
                                    Dismiss
                                  </Button>
                                  {waitingQueue.length > 1 && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleNextWaiting()
                                      }}
                                      className="h-6 text-xs text-yellow-600 border-yellow-500 hover:bg-yellow-500/10"
                                    >
                                      <ChevronRight className="h-3 w-3 mr-1" />
                                      Next ({waitingQueue.length - 1}) {navigator.platform.includes('Mac') ? '⌘N' : 'Ctrl+N'}
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          <div className="h-[calc(100%-2rem)]">
                            <Terminal
                              terminalId={terminal.terminalId}
                              theme={agent.theme}
                              isBooting={!bootedTerminals.has(terminal.terminalId)}
                              isVisible={!!shouldShowTab && (!expandedAgentId || isExpanded)}
                              registerWriter={registerWriter}
                              unregisterWriter={unregisterWriter}
                            />
                          </div>
                        </div>
                      )
                    })}

                    {/* Render empty slots separately - keyed by position */}
                    {gridPositions.map((position) => {
                      if (tabWorkspaceIds[position]) return null // Skip if occupied
                      const gridRow = position < 2 ? 1 : 2
                      const gridCol = position % 2 === 0 ? 1 : 2
                      const isDropTarget = dropTargetPosition === position && isActiveTab

                      return (
                        <div
                          key={`empty-${tab.id}-${position}`}
                          style={{ gridRow, gridColumn: gridCol }}
                          className={`rounded-lg border border-dashed flex items-center justify-center text-muted-foreground/40 transition-colors ${
                            expandedAgentId ? 'invisible' : ''
                          } ${
                            isDropTarget
                              ? 'border-primary bg-primary/10 border-solid'
                              : 'border-muted-foreground/20'
                          }`}
                          onDragOver={(e) => {
                            e.preventDefault()
                            if (!expandedAgentId) {
                              setDropTargetPosition(position)
                            }
                          }}
                          onDragLeave={() => setDropTargetPosition(null)}
                          onDrop={(e) => {
                            e.preventDefault()
                            const sourceId = e.dataTransfer.getData('workspaceId')
                            if (sourceId && !expandedAgentId) {
                              handleReorderInTab(sourceId, position)
                            }
                            setDropTargetPosition(null)
                            setDraggedWorkspaceId(null)
                          }}
                        >
                          <span className="text-sm">
                            {isDropTarget ? 'Drop here' : 'Empty slot'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </main>
      </div>

      <AgentModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        agent={editingAgent}
        onSave={handleSaveAgent}
      />

      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        preferences={preferences}
        onPreferencesChange={handlePreferencesChange}
      />

      {/* Stop Agent Confirmation Dialog */}
      <Dialog
        open={stopConfirmAgentId !== null}
        onOpenChange={(open) => !open && setStopConfirmAgentId(null)}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Stop Agent</DialogTitle>
            <DialogDescription>
              Are you sure you want to stop this agent? Any unsaved progress will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setStopConfirmAgentId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (stopConfirmAgentId) {
                  handleStopAgent(stopConfirmAgentId)
                  setStopConfirmAgentId(null)
                }
              }}
            >
              Stop Agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default App
