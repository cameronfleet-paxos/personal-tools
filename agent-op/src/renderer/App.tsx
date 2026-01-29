import './index.css'
import './electron.d.ts'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, ChevronRight } from 'lucide-react'
import { Button } from '@/renderer/components/ui/button'
import { AgentModal } from '@/renderer/components/WorkspaceModal'
import { AgentCard } from '@/renderer/components/WorkspaceCard'
import { Terminal } from '@/renderer/components/Terminal'
import { TabBar } from '@/renderer/components/TabBar'
import { Logo } from '@/renderer/components/Logo'
import type { Agent, AppState, AgentTab } from '@/shared/types'

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
  const [editingAgent, setEditingAgent] = useState<Agent | undefined>()
  const [waitingQueue, setWaitingQueue] = useState<string[]>([])

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
    setupEventListeners()

    return () => {
      window.electronAPI?.removeAllListeners?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      setWaitingQueue((prev) => {
        if (!prev.includes(agentId)) {
          const newQueue = [...prev, agentId]
          window.electronAPI?.updateTray?.(newQueue.length)
          return newQueue
        }
        return prev
      })
    })

    // Global terminal data listener - routes data to the appropriate terminal writer
    window.electronAPI?.onTerminalData?.((terminalId: string, data: string) => {
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
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                isActive={activeTerminals.some(
                  (t) => t.workspaceId === agent.id
                )}
                isWaiting={isAgentWaiting(agent.id)}
                onClick={() => {
                  if (activeTerminals.some((t) => t.workspaceId === agent.id)) {
                    // Find which tab contains this agent and switch to it
                    const tab = tabs.find((t) =>
                      t.workspaceIds.includes(agent.id)
                    )
                    if (tab && tab.id !== activeTabId) {
                      handleTabSelect(tab.id)
                    }
                    handleFocusAgent(agent.id)
                  }
                }}
                onEdit={() => handleEditAgent(agent)}
                onDelete={() => handleDeleteAgent(agent.id)}
                onLaunch={() => handleLaunchAgent(agent.id)}
                onStop={() => handleStopAgent(agent.id)}
              />
            ))}
          </div>
        </aside>

        {/* Terminal area - Fixed 2x2 grid per tab */}
        <main className="flex-1 overflow-hidden p-2 relative">
          {/* Render all tabs, but only show the active one */}
          {tabs.map((tab) => {
            const isActiveTab = tab.id === activeTabId
            const tabWorkspaceIds = tab.workspaceIds

            return (
              <div
                key={tab.id}
                className={`absolute inset-2 ${isActiveTab ? '' : 'invisible pointer-events-none'}`}
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
                    {gridPositions.map((position) => {
                      const workspaceId = tabWorkspaceIds[position]
                      const terminal = workspaceId
                        ? getTerminalForAgent(workspaceId)
                        : null
                      const agent = workspaceId
                        ? agents.find((a) => a.id === workspaceId)
                        : null

                      if (!workspaceId || !terminal || !agent) {
                        // Empty slot
                        return (
                          <div
                            key={`empty-${tab.id}-${position}`}
                            className="rounded-lg border border-dashed border-muted-foreground/20 flex items-center justify-center text-muted-foreground/40"
                          >
                            <span className="text-sm">Empty slot</span>
                          </div>
                        )
                      }

                      const isWaiting = isAgentWaiting(workspaceId)
                      const isFocused = focusedAgentId === workspaceId

                      return (
                        <div
                          key={terminal.terminalId}
                          className={`rounded-lg border overflow-hidden ${
                            isFocused ? 'ring-2 ring-primary' : ''
                          } ${isWaiting ? 'ring-2 ring-yellow-500 animate-pulse' : ''}`}
                          onClick={() => handleFocusAgent(workspaceId)}
                        >
                          <div
                            className={`px-3 py-1.5 border-b bg-card text-sm font-medium flex items-center justify-between ${
                              isWaiting ? 'bg-yellow-500/20' : ''
                            }`}
                          >
                            <span>{agent.name}</span>
                            {isWaiting && (
                              <span className="text-xs bg-yellow-500 text-black px-1.5 py-0.5 rounded">
                                Waiting
                              </span>
                            )}
                          </div>
                          <div className="h-[calc(100%-2rem)]">
                            <Terminal
                              terminalId={terminal.terminalId}
                              theme={agent.theme}
                              registerWriter={registerWriter}
                              unregisterWriter={unregisterWriter}
                            />
                          </div>
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
    </div>
  )
}

export default App
