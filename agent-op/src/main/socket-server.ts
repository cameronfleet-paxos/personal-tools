import * as net from 'net'
import * as fs from 'fs'
import * as path from 'path'
import { BrowserWindow, Notification } from 'electron'
import { getConfigDir } from './config'

interface StopEvent {
  event: 'stop'
  reason: 'input_required'
  workspaceId: string
}

const servers: Map<string, net.Server> = new Map()
let waitingQueue: string[] = []
let mainWindow: BrowserWindow | null = null

export function setMainWindow(window: BrowserWindow | null): void {
  mainWindow = window
}

export function getWaitingQueue(): string[] {
  return [...waitingQueue]
}

export function removeFromWaitingQueue(workspaceId: string): void {
  waitingQueue = waitingQueue.filter((id) => id !== workspaceId)
  notifyWaitingCountChanged()
}

export function getNextWaitingWorkspace(): string | undefined {
  return waitingQueue[0]
}

function notifyWaitingCountChanged(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('waiting-count-changed', waitingQueue.length)
    mainWindow.webContents.send('waiting-queue-changed', waitingQueue)
  }
}

function handleStopEvent(event: StopEvent): void {
  const { workspaceId } = event

  // Add to waiting queue if not already there
  if (!waitingQueue.includes(workspaceId)) {
    waitingQueue.push(workspaceId)
  }

  // Send notification
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: 'Agent Needs Input',
      body: `Workspace ${workspaceId} is waiting for your input`,
      silent: false,
    })
    notification.on('click', () => {
      if (mainWindow) {
        mainWindow.show()
        mainWindow.focus()
        mainWindow.webContents.send('focus-workspace', workspaceId)
      }
    })
    notification.show()
  }

  // Notify renderer
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('agent-waiting', workspaceId)
    mainWindow.webContents.send('focus-workspace', workspaceId)
  }

  notifyWaitingCountChanged()
}

export function createSocketServer(workspaceId: string): void {
  const socketsDir = path.join(getConfigDir(), 'sockets')
  const socketPath = path.join(socketsDir, `agent-${workspaceId}.sock`)

  // Remove existing socket file
  if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath)
  }

  const server = net.createServer((socket) => {
    let buffer = ''

    socket.on('data', (data) => {
      buffer += data.toString()

      // Try to parse complete JSON messages
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.trim()) {
          try {
            const event = JSON.parse(line) as StopEvent
            if (event.event === 'stop') {
              handleStopEvent(event)
            }
          } catch (e) {
            console.error('Failed to parse socket message:', e)
          }
        }
      }
    })

    socket.on('error', (err) => {
      console.error(`Socket error for workspace ${workspaceId}:`, err)
    })
  })

  server.listen(socketPath, () => {
    console.log(`Socket server listening for workspace ${workspaceId}`)
  })

  server.on('error', (err) => {
    console.error(`Server error for workspace ${workspaceId}:`, err)
  })

  servers.set(workspaceId, server)
}

export function closeSocketServer(workspaceId: string): void {
  const server = servers.get(workspaceId)
  if (server) {
    server.close()
    servers.delete(workspaceId)
  }

  // Remove socket file
  const socketPath = path.join(
    getConfigDir(),
    'sockets',
    `agent-${workspaceId}.sock`
  )
  if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath)
  }

  // Remove from waiting queue
  removeFromWaitingQueue(workspaceId)
}

export function closeAllSocketServers(): void {
  for (const [workspaceId] of servers) {
    closeSocketServer(workspaceId)
  }
  waitingQueue = []
}
