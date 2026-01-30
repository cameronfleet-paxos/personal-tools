import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { getConfigDir } from './config'

const HOOK_SCRIPT_NAME = 'stop-hook.sh'

interface HookCommand {
  type: 'command'
  command: string
}

interface HookConfig {
  matcher?: string
  hooks: HookCommand[]
}

interface ClaudeSettings {
  hooks?: {
    Stop?: HookConfig[]
    [key: string]: HookConfig[] | undefined
  }
  [key: string]: unknown
}

function getClaudeSettingsPath(): string {
  const homeDir = app?.getPath('home') || process.env.HOME || ''
  return path.join(homeDir, '.claude', 'settings.json')
}

function getHookScriptPath(): string {
  return path.join(getConfigDir(), 'hooks', HOOK_SCRIPT_NAME)
}

export function createHookScript(): void {
  const hookScript = `#!/bin/bash
# Bismark StopHook - signals when agent needs input
# This script is called by Claude Code when the agent stops

WORKSPACE_ID="$AGENTOP_WORKSPACE_ID"
SOCKET_PATH="$HOME/.bismark/sockets/agent-\${WORKSPACE_ID}.sock"
DEBUG_LOG="$HOME/.bismark/hooks/debug.log"

# Debug logging
echo "$(date): Hook called for workspace '$WORKSPACE_ID'" >> "$DEBUG_LOG"

if [ -z "$WORKSPACE_ID" ]; then
  echo "$(date): ERROR - WORKSPACE_ID is empty" >> "$DEBUG_LOG"
  exit 0
fi

if [ -S "$SOCKET_PATH" ]; then
  # Send JSON message with newline to signal EOF (macOS nc doesn't support -q flag)
  printf '{"event":"stop","reason":"input_required","workspaceId":"%s"}\n' "$WORKSPACE_ID" | nc -U "$SOCKET_PATH" 2>/dev/null
  echo "$(date): Sent to socket $SOCKET_PATH (exit code: $?)" >> "$DEBUG_LOG"
else
  echo "$(date): Socket not found at $SOCKET_PATH" >> "$DEBUG_LOG"
fi
`

  const hookPath = getHookScriptPath()
  fs.writeFileSync(hookPath, hookScript)
  fs.chmodSync(hookPath, '755')
}

export function configureClaudeHook(): void {
  const settingsPath = getClaudeSettingsPath()
  const hookScriptPath = getHookScriptPath()

  // Ensure hook script exists
  createHookScript()

  // Read existing settings or create new
  let settings: ClaudeSettings = {}
  if (fs.existsSync(settingsPath)) {
    try {
      const content = fs.readFileSync(settingsPath, 'utf-8')
      settings = JSON.parse(content)
    } catch (e) {
      console.error('Failed to read Claude settings:', e)
    }
  }

  // Initialize hooks structure if needed
  if (!settings.hooks) {
    settings.hooks = {}
  }

  // Check if our hook already exists in any Stop config
  const hookExists = settings.hooks.Stop?.some((config) =>
    config.hooks.some((hook) => hook.command.includes('bismark'))
  )

  if (!hookExists) {
    const newHookCommand: HookCommand = {
      type: 'command',
      command: hookScriptPath,
    }

    if (settings.hooks.Stop && settings.hooks.Stop.length > 0) {
      // Add to existing Stop[0].hooks array (alongside notify.sh, allow-sleep.sh, etc.)
      settings.hooks.Stop[0].hooks.push(newHookCommand)
    } else {
      // Create new Stop config array
      settings.hooks.Stop = [
        {
          hooks: [newHookCommand],
        },
      ]
    }

    // Ensure .claude directory exists
    const claudeDir = path.dirname(settingsPath)
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true })
    }

    // Write updated settings
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
    console.log('Configured Claude Code Stop hook for Bismark')
  }
}

export function isHookConfigured(): boolean {
  const settingsPath = getClaudeSettingsPath()

  if (!fs.existsSync(settingsPath)) {
    return false
  }

  try {
    const content = fs.readFileSync(settingsPath, 'utf-8')
    const settings = JSON.parse(content) as ClaudeSettings

    return (
      settings.hooks?.Stop?.some((config) =>
        config.hooks.some((hook) => hook.command.includes('bismark'))
      ) ?? false
    )
  } catch {
    return false
  }
}
