import * as pty from 'node-pty'
import * as fs from 'fs'
import * as os from 'os'
import { BrowserWindow } from 'electron'
import { getWorkspaceById } from './config'

interface TerminalProcess {
  pty: pty.IPty
  workspaceId: string
}

const terminals: Map<string, TerminalProcess> = new Map()

export function createTerminal(
  workspaceId: string,
  mainWindow: BrowserWindow | null,
  resumeSessionId?: string
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
    const claudeCmd = resumeSessionId
      ? `claude --resume ${resumeSessionId}\n`
      : 'claude\n'
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
