import * as pty from 'node-pty'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as crypto from 'crypto'
import { BrowserWindow } from 'electron'
import { getWorkspaceById, saveWorkspace } from './config'

/**
 * Check if a Claude session exists with content.
 * Claude stores sessions in ~/.claude/projects/<project-path-hash>/<session-id>.jsonl
 */
function claudeSessionExists(sessionId: string): boolean {
  const claudeDir = path.join(os.homedir(), '.claude', 'projects')
  if (!fs.existsSync(claudeDir)) return false

  // Look through project directories for the session file
  try {
    const projectDirs = fs.readdirSync(claudeDir)
    for (const dir of projectDirs) {
      const sessionFile = path.join(claudeDir, dir, `${sessionId}.jsonl`)
      if (fs.existsSync(sessionFile)) {
        // Check if file has content (not just empty)
        const stats = fs.statSync(sessionFile)
        return stats.size > 0
      }
    }
  } catch {
    // If we can't read the directory, assume session doesn't exist
    return false
  }
  return false
}

interface TerminalProcess {
  pty: pty.IPty
  workspaceId: string
}

const terminals: Map<string, TerminalProcess> = new Map()

export function createTerminal(
  workspaceId: string,
  mainWindow: BrowserWindow | null
): string {
  const workspace = getWorkspaceById(workspaceId)
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`)
  }

  const terminalId = `terminal-${workspaceId}-${Date.now()}`
  const shell = process.env.SHELL || '/bin/zsh'

  // Validate directory exists, fall back to home if not
  let cwd = workspace.directory
  if (!fs.existsSync(cwd)) {
    console.warn(`Directory ${cwd} does not exist, using home directory`)
    cwd = os.homedir()
  }

  // Get or generate session ID for Claude session persistence
  let sessionId = workspace.sessionId
  let claudeCmd: string

  if (sessionId && claudeSessionExists(sessionId)) {
    // Session exists with content - resume it
    claudeCmd = `claude --resume ${sessionId}\n`
  } else {
    // No session or empty session - generate ID and start new session
    if (!sessionId) {
      sessionId = crypto.randomUUID()
      saveWorkspace({ ...workspace, sessionId })
    }
    claudeCmd = `claude --session-id ${sessionId}\n`
  }

  // Spawn interactive shell
  const ptyProcess = pty.spawn(shell, ['-l'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
    cwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      AGENTOP_WORKSPACE_ID: workspaceId,
    },
  })

  terminals.set(terminalId, {
    pty: ptyProcess,
    workspaceId,
  })

  // Forward data to renderer
  ptyProcess.onData((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal-data', terminalId, data)
    }
  })

  // Auto-start claude after a short delay to let shell initialize
  setTimeout(() => {
    ptyProcess.write(claudeCmd)
  }, 500)

  // Handle process exit
  ptyProcess.onExit(({ exitCode }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal-exit', terminalId, exitCode)
    }
    terminals.delete(terminalId)
  })

  return terminalId
}

export function writeTerminal(terminalId: string, data: string): void {
  const terminal = terminals.get(terminalId)
  if (terminal) {
    terminal.pty.write(data)
  }
}

export function resizeTerminal(
  terminalId: string,
  cols: number,
  rows: number
): void {
  const terminal = terminals.get(terminalId)
  if (terminal) {
    terminal.pty.resize(cols, rows)
  }
}

export function closeTerminal(terminalId: string): void {
  const terminal = terminals.get(terminalId)
  if (terminal) {
    terminal.pty.kill()
    terminals.delete(terminalId)
  }
}

export function closeAllTerminals(): void {
  for (const [id] of terminals) {
    closeTerminal(id)
  }
}

export function getTerminalWorkspaceId(terminalId: string): string | undefined {
  return terminals.get(terminalId)?.workspaceId
}

export function getActiveTerminalIds(): string[] {
  return Array.from(terminals.keys())
}
