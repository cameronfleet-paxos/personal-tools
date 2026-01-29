import './index.css'
import './electron.d.ts'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, LayoutGrid, Layers, ChevronRight } from 'lucide-react'
import { Button } from '@/renderer/components/ui/button'
import { WorkspaceModal } from '@/renderer/components/WorkspaceModal'
import { WorkspaceCard } from '@/renderer/components/WorkspaceCard'
import { Terminal } from '@/renderer/components/Terminal'
import type { Workspace, AppState } from '@/shared/types'

interface ActiveTerminal {
  terminalId: string
  workspaceId: string
}

type LayoutMode = 'grid' | 'tabs'

// Type for terminal write functions
type TerminalWriter = (data: string) => void

function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeTerminals, setActiveTerminals] = useState<ActiveTerminal[]>([])
  const [focusedWorkspaceId, setFocusedWorkspaceId] = useState<string | null>(
    null
  )
  const [layout, setLayout] = useState<LayoutMode>('grid')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingWorkspace, setEditingWorkspace] = useState<
    Workspace | undefined
  >()
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

  // Load workspaces and state on mount
  useEffect(() => {
    loadWorkspaces()
    setupEventListeners()

    return () => {
      window.electronAPI?.removeAllListeners?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setupEventListeners = () => {
    // Listen for initial state from main process
    window.electronAPI?.onInitialState?.((state: AppState) => {
      setLayout(state.layout)
      if (state.focusedWorkspaceId) {
        setFocusedWorkspaceId(state.focusedWorkspaceId)
      }
      // Resume active workspaces
      if (state.activeWorkspaceIds.length > 0) {
        resumeWorkspaces(state.activeWorkspaceIds)
      }
    })

    // Listen for focus workspace events
    window.electronAPI?.onFocusWorkspace?.((workspaceId: string) => {
      setFocusedWorkspaceId(workspaceId)
    })

    // Listen for waiting queue changes
    window.electronAPI?.onWaitingQueueChanged?.((queue: string[]) => {
      setWaitingQueue(queue)
      window.electronAPI?.updateTray?.(queue.length)
    })

    // Listen for agent waiting events
    window.electronAPI?.onAgentWaiting?.((workspaceId: string) => {
      setWaitingQueue((prev) => {
        if (!prev.includes(workspaceId)) {
          const newQueue = [...prev, workspaceId]
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

  const resumeWorkspaces = async (workspaceIds: string[]) => {
    for (const workspaceId of workspaceIds) {
      try {
        // Start fresh claude session (don't try to resume - workspace IDs are not valid Claude session IDs)
        const terminalId = await window.electronAPI.createTerminal(workspaceId)
        setActiveTerminals((prev) => [...prev, { terminalId, workspaceId }])
      } catch (e) {
        console.error(`Failed to start workspace ${workspaceId}:`, e)
      }
    }
  }

  const loadWorkspaces = async () => {
    const ws = await window.electronAPI.getWorkspaces()
    setWorkspaces(ws)
  }

  const handleSaveWorkspace = async (workspace: Workspace) => {
    await window.electronAPI.saveWorkspace(workspace)
    await loadWorkspaces()
    setEditingWorkspace(undefined)
  }

  const handleDeleteWorkspace = async (id: string) => {
    // Stop terminal if running
    const activeTerminal = activeTerminals.find((t) => t.workspaceId === id)
    if (activeTerminal) {
      await window.electronAPI.closeTerminal(activeTerminal.terminalId)
      await window.electronAPI.stopWorkspace(id)
      setActiveTerminals((prev) => prev.filter((t) => t.workspaceId !== id))
    }
    await window.electronAPI.deleteWorkspace(id)
    await loadWorkspaces()
    setWaitingQueue((prev) => prev.filter((wid) => wid !== id))
  }

  const handleLaunchWorkspace = async (workspaceId: string) => {
    // Check if already running
    if (activeTerminals.some((t) => t.workspaceId === workspaceId)) {
      setFocusedWorkspaceId(workspaceId)
      window.electronAPI?.setFocusedWorkspace?.(workspaceId)
      return
    }

    const terminalId = await window.electronAPI.createTerminal(workspaceId)
    setActiveTerminals((prev) => [...prev, { terminalId, workspaceId }])
    setFocusedWorkspaceId(workspaceId)
    window.electronAPI?.setFocusedWorkspace?.(workspaceId)
  }

  const handleStopWorkspace = async (workspaceId: string) => {
    const activeTerminal = activeTerminals.find(
      (t) => t.workspaceId === workspaceId
    )
    if (activeTerminal) {
      await window.electronAPI.closeTerminal(activeTerminal.terminalId)
      await window.electronAPI.stopWorkspace(workspaceId)
      setActiveTerminals((prev) =>
        prev.filter((t) => t.workspaceId !== workspaceId)
      )
      setWaitingQueue((prev) => prev.filter((id) => id !== workspaceId))
      if (focusedWorkspaceId === workspaceId) {
        setFocusedWorkspaceId(null)
        window.electronAPI?.setFocusedWorkspace?.(undefined)
      }
    }
  }

  const handleEditWorkspace = (workspace: Workspace) => {
    setEditingWorkspace(workspace)
    setModalOpen(true)
  }

  const handleAddWorkspace = () => {
    setEditingWorkspace(undefined)
    setModalOpen(true)
  }

  const handleLayoutChange = (newLayout: LayoutMode) => {
    setLayout(newLayout)
    window.electronAPI?.setLayout?.(newLayout)
  }

  const handleFocusWorkspace = (workspaceId: string) => {
    setFocusedWorkspaceId(workspaceId)
    window.electronAPI?.setFocusedWorkspace?.(workspaceId)
    // Acknowledge if this workspace was waiting
    if (waitingQueue.includes(workspaceId)) {
      window.electronAPI?.acknowledgeWaiting?.(workspaceId)
      setWaitingQueue((prev) => prev.filter((id) => id !== workspaceId))
    }
  }

  const handleNextWaiting = () => {
    if (waitingQueue.length > 1) {
      // Move to next in queue
      const nextWorkspaceId = waitingQueue[1]
      handleFocusWorkspace(nextWorkspaceId)
    }
  }

  const getTerminalForWorkspace = useCallback(
    (workspaceId: string) => {
      return activeTerminals.find((t) => t.workspaceId === workspaceId)
    },
    [activeTerminals]
  )

  const focusedWorkspace = workspaces.find((w) => w.id === focusedWorkspaceId)
  const focusedTerminal = focusedWorkspaceId
    ? getTerminalForWorkspace(focusedWorkspaceId)
    : null

  const isWorkspaceWaiting = (workspaceId: string) =>
    waitingQueue.includes(workspaceId)

  // Empty state
  if (workspaces.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground mb-4">AgentOp</h1>
          <p className="text-muted-foreground mb-6">
            No workspaces configured. Add one to get started.
          </p>
          <Button onClick={handleAddWorkspace}>
            <Plus className="h-4 w-4 mr-2" />
            Add Workspace
          </Button>
        </div>
        <WorkspaceModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          workspace={editingWorkspace}
          onSave={handleSaveWorkspace}
        />
      </div>
    )
  }

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">AgentOp</h1>
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
          <Button
            variant={layout === 'grid' ? 'secondary' : 'ghost'}
            size="icon-sm"
            onClick={() => handleLayoutChange('grid')}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={layout === 'tabs' ? 'secondary' : 'ghost'}
            size="icon-sm"
            onClick={() => handleLayoutChange('tabs')}
          >
            <Layers className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={handleAddWorkspace}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Workspace list */}
        <aside className="w-64 border-r p-4 overflow-y-auto">
          <div className="space-y-3">
            {workspaces.map((workspace) => (
              <WorkspaceCard
                key={workspace.id}
                workspace={workspace}
                isActive={activeTerminals.some(
                  (t) => t.workspaceId === workspace.id
                )}
                isWaiting={isWorkspaceWaiting(workspace.id)}
                onClick={() => {
                  if (
                    activeTerminals.some((t) => t.workspaceId === workspace.id)
                  ) {
                    handleFocusWorkspace(workspace.id)
                  }
                }}
                onEdit={() => handleEditWorkspace(workspace)}
                onDelete={() => handleDeleteWorkspace(workspace.id)}
                onLaunch={() => handleLaunchWorkspace(workspace.id)}
                onStop={() => handleStopWorkspace(workspace.id)}
              />
            ))}
          </div>
        </aside>

        {/* Terminal area */}
        <main className="flex-1 overflow-hidden">
          {layout === 'tabs' ? (
            // Tab view - single terminal fullscreen
            <div className="h-full flex flex-col">
              {activeTerminals.length > 0 && (
                <div className="border-b flex">
                  {activeTerminals.map((terminal) => {
                    const workspace = workspaces.find(
                      (w) => w.id === terminal.workspaceId
                    )
                    if (!workspace) return null
                    const isWaiting = isWorkspaceWaiting(terminal.workspaceId)
                    return (
                      <button
                        key={terminal.terminalId}
                        className={`px-4 py-2 text-sm border-r transition-colors relative ${
                          focusedWorkspaceId === terminal.workspaceId
                            ? 'bg-muted'
                            : 'hover:bg-muted/50'
                        } ${isWaiting ? 'text-yellow-500' : ''}`}
                        onClick={() =>
                          handleFocusWorkspace(terminal.workspaceId)
                        }
                      >
                        {workspace.name}
                        {isWaiting && (
                          <span className="absolute top-1 right-1 w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
              <div className="flex-1">
                {focusedTerminal && focusedWorkspace ? (
                  <Terminal
                    key={focusedTerminal.terminalId}
                    terminalId={focusedTerminal.terminalId}
                    theme={focusedWorkspace.theme}
                    registerWriter={registerWriter}
                    unregisterWriter={unregisterWriter}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    {activeTerminals.length === 0
                      ? 'Launch a workspace to see the terminal'
                      : 'Select a terminal tab'}
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Grid view - multiple terminals
            <div className="h-full p-4 overflow-auto">
              {activeTerminals.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  Launch a workspace to see the terminal
                </div>
              ) : (
                <div
                  className="grid gap-4 h-full"
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(
                      activeTerminals.length,
                      Math.ceil(Math.sqrt(activeTerminals.length))
                    )}, 1fr)`,
                  }}
                >
                  {activeTerminals.map((terminal) => {
                    const workspace = workspaces.find(
                      (w) => w.id === terminal.workspaceId
                    )
                    if (!workspace) return null
                    const isWaiting = isWorkspaceWaiting(terminal.workspaceId)
                    return (
                      <div
                        key={terminal.terminalId}
                        className={`rounded-lg border overflow-hidden ${
                          focusedWorkspaceId === terminal.workspaceId
                            ? 'ring-2 ring-primary'
                            : ''
                        } ${isWaiting ? 'ring-2 ring-yellow-500 animate-pulse' : ''}`}
                        onClick={() =>
                          handleFocusWorkspace(terminal.workspaceId)
                        }
                      >
                        <div
                          className={`px-3 py-1.5 border-b bg-card text-sm font-medium flex items-center justify-between ${
                            isWaiting ? 'bg-yellow-500/20' : ''
                          }`}
                        >
                          <span>{workspace.name}</span>
                          {isWaiting && (
                            <span className="text-xs bg-yellow-500 text-black px-1.5 py-0.5 rounded">
                              Waiting
                            </span>
                          )}
                        </div>
                        <div className="h-[calc(100%-2rem)]">
                          <Terminal
                            terminalId={terminal.terminalId}
                            theme={workspace.theme}
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
          )}
        </main>
      </div>

      <WorkspaceModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        workspace={editingWorkspace}
        onSave={handleSaveWorkspace}
      />
    </div>
  )
}

export default App
