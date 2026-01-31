import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { getConfigDir } from './config'

const HOOK_SCRIPT_NAME = 'stop-hook.sh'
const NOTIFICATION_HOOK_SCRIPT_NAME = 'notification-hook.sh'

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
    Notification?: HookConfig[]
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

function getNotificationHookScriptPath(): string {
  return path.join(getConfigDir(), 'hooks', NOTIFICATION_HOOK_SCRIPT_NAME)
}

export function createHookScript(): void {
  const hookScript = `#!/bin/bash
# Bismark StopHook - signals when agent needs input
# This script is called by Claude Code when the agent stops

WORKSPACE_ID="$BISMARK_WORKSPACE_ID"
INSTANCE_ID="$BISMARK_INSTANCE_ID"
SOCKET_PATH="$HOME/.bismark/sockets/\${INSTANCE_ID}/agent-\${WORKSPACE_ID}.sock"
DEBUG_LOG="$HOME/.bismark/hooks/debug.log"

# Debug logging
echo "$(date): Hook called for workspace '$WORKSPACE_ID' instance '$INSTANCE_ID'" >> "$DEBUG_LOG"

if [ -z "$WORKSPACE_ID" ] || [ -z "$INSTANCE_ID" ]; then
  echo "$(date): ERROR - WORKSPACE_ID or INSTANCE_ID is empty" >> "$DEBUG_LOG"
  exit 0
fi

if [ -S "$SOCKET_PATH" ]; then
  # Send JSON message with newline to signal EOF (macOS nc doesn't support -q flag)
  printf '{"event":"stop","reason":"input_required","workspaceId":"%s"}\\n' "$WORKSPACE_ID" | nc -U "$SOCKET_PATH" 2>/dev/null
  echo "$(date): Sent to socket $SOCKET_PATH (exit code: $?)" >> "$DEBUG_LOG"
else
  echo "$(date): Socket not found at $SOCKET_PATH" >> "$DEBUG_LOG"
fi
`

  const hookPath = getHookScriptPath()
  fs.writeFileSync(hookPath, hookScript)
  fs.chmodSync(hookPath, '755')
}

export function createNotificationHookScript(): void {
  const hookScript = `#!/bin/bash
# Bismark NotificationHook - signals when agent needs permission
# This script is called by Claude Code for permission prompts

WORKSPACE_ID="$BISMARK_WORKSPACE_ID"
INSTANCE_ID="$BISMARK_INSTANCE_ID"
SOCKET_PATH="$HOME/.bismark/sockets/\${INSTANCE_ID}/agent-\${WORKSPACE_ID}.sock"
DEBUG_LOG="$HOME/.bismark/hooks/debug.log"

# Debug logging
echo "$(date): Notification hook called for workspace '$WORKSPACE_ID' instance '$INSTANCE_ID'" >> "$DEBUG_LOG"

if [ -z "$WORKSPACE_ID" ] || [ -z "$INSTANCE_ID" ]; then
  echo "$(date): ERROR - WORKSPACE_ID or INSTANCE_ID is empty" >> "$DEBUG_LOG"
  exit 0
fi

if [ -S "$SOCKET_PATH" ]; then
  printf '{"event":"stop","reason":"input_required","workspaceId":"%s"}\\n' "$WORKSPACE_ID" | nc -U "$SOCKET_PATH" 2>/dev/null
  echo "$(date): Sent notification to socket $SOCKET_PATH (exit code: $?)" >> "$DEBUG_LOG"
else
  echo "$(date): Socket not found at $SOCKET_PATH" >> "$DEBUG_LOG"
fi
`

  const hookPath = getNotificationHookScriptPath()
  fs.writeFileSync(hookPath, hookScript)
  fs.chmodSync(hookPath, '755')
}

export function configureClaudeHook(): void {
  const settingsPath = getClaudeSettingsPath()
  const hookScriptPath = getHookScriptPath()
  const notificationHookScriptPath = getNotificationHookScriptPath()

  // Ensure hook scripts exist
  createHookScript()
  createNotificationHookScript()

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

  let settingsChanged = false

  // Configure Stop hook
  const stopHookExists = settings.hooks.Stop?.some((config) =>
    config.hooks.some((hook) => hook.command.includes('bismark'))
  )

  if (!stopHookExists) {
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
    settingsChanged = true
    console.log('Configured Claude Code Stop hook for Bismark')
  }

  // Configure Notification hook for permission prompts
  const notificationHookExists = settings.hooks.Notification?.some((config) =>
    config.hooks.some((hook) => hook.command.includes('bismark'))
  )

  if (!notificationHookExists) {
    const newNotificationHook: HookConfig = {
      matcher: 'permission_prompt',
      hooks: [
        {
          type: 'command',
          command: notificationHookScriptPath,
        },
      ],
    }

    if (!settings.hooks.Notification) {
      settings.hooks.Notification = []
    }
    settings.hooks.Notification.push(newNotificationHook)
    settingsChanged = true
    console.log('Configured Claude Code Notification hook for Bismark')
  }

  if (settingsChanged) {
    // Ensure .claude directory exists
    const claudeDir = path.dirname(settingsPath)
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true })
    }

    // Write updated settings
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
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

    const stopHookExists =
      settings.hooks?.Stop?.some((config) =>
        config.hooks.some((hook) => hook.command.includes('bismark'))
      ) ?? false

    const notificationHookExists =
      settings.hooks?.Notification?.some((config) =>
        config.hooks.some((hook) => hook.command.includes('bismark'))
      ) ?? false

    return stopHookExists && notificationHookExists
  } catch {
    return false
  }
}
