# Bismark

Electron app for managing Claude Code workspaces.

## Installation

To build and install the app to `~/Applications`:

```bash
./scripts/install.sh
```

## Development

### Starting the dev server

Development requires two processes running in parallel:

1. **Start Vite dev server** (serves the renderer/frontend):
   ```bash
   npm run dev
   ```

2. **Start Electron** (in a separate terminal):
   ```bash
   npm run dev:electron
   ```

The Vite server must be running first on `localhost:5173` before starting Electron.

**Important:** When using Claude Code's Bash tool to start the Electron app, always use `dangerouslyDisableSandbox: true` as Electron requires macOS bootstrap permissions that are blocked in sandbox mode.

### Building

```bash
npm run build
```

This compiles both the main process TypeScript and the Vite renderer.
