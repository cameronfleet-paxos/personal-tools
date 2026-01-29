# AgentOp

Electron app for managing Claude Code workspaces.

## Development

### Starting the dev server

Always run with sandbox disabled (Electron requires macOS permissions):

```bash
npm run dev:electron
```

**Important:** When using Claude Code's Bash tool to start the Electron app, always use `dangerouslyDisableSandbox: true` as Electron requires macOS bootstrap permissions that are blocked in sandbox mode.
