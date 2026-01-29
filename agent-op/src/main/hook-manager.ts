import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { getConfigDir } from './config'

const HOOK_SCRIPT_NAME = 'stop-hook.sh'

interface ClaudeSettings {
  hooks?: {
    stop?: Array<{
      command: string
      timeout?: number
    }>
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
# AgentOp StopHook - signals when agent needs input
# This script is called by Claude Code when the agent stops

WORKSPACE_ID="$AGENTOP_WORKSPACE_ID"
SOCKET_PATH="$HOME/.agent-operator/sockets/agent-\${WORKSPACE_ID}.sock"

if [ -S "$SOCKET_PATH" ]; then
  echo '{"event":"stop","reason":"input_required","workspaceId":"'"$WORKSPACE_ID"'"}' | nc -U "$SOCKET_PATH"
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
  if (!settings.hooks.stop) {
    settings.hooks.stop = []
  }

  // Check if our hook is already configured
  const hookCommand = hookScriptPath
  const existingHook = settings.hooks.stop.find((hook) =>
    hook.command.includes('agent-operator')
  )

  if (!existingHook) {
    settings.hooks.stop.push({
      command: hookCommand,
      timeout: 5000,
    })

    // Ensure .claude directory exists
    const claudeDir = path.dirname(settingsPath)
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true })
    }

    // Write updated settings
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
    console.log('Configured Claude Code StopHook for AgentOp')
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
      settings.hooks?.stop?.some((hook) =>
        hook.command.includes('agent-operator')
      ) ?? false
    )
  } catch {
    return false
  }
}
