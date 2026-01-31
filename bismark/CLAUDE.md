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

## Automated Testing

### Self-Testing Workflow

**When making UI changes, always self-test before asking the user for feedback.** Use the testing skills to verify your changes work correctly:

1. **Start the test environment**: `/bismark:start-test`
2. **Take screenshots to verify UI state**: `/bismark:screenshot`
3. **Run interactive tests**: `/bismark:test <scenario>`

Only ask the user/operator for input if:
- You encounter an issue you cannot diagnose from screenshots/state
- The change requires subjective feedback (design decisions, UX preferences)
- Tests pass but you need confirmation on edge cases

### Running with CDP (Chrome DevTools Protocol)

For automated testing, start Electron with remote debugging:

```bash
NODE_ENV=development npx electron --remote-debugging-port=9222 .
```

This enables:
- Taking screenshots: `Page.captureScreenshot`
- Executing JS: `Runtime.evaluate`
- Simulating user input via KeyboardEvent dispatch

### CDP Connection

1. Get WebSocket URL: `curl http://localhost:9222/json`
2. Find the "Bismark" page target
3. Connect to `webSocketDebuggerUrl`

### Testing Skills (Use These!)

These skills are the primary way to test changes:

| Skill | Purpose |
|-------|---------|
| `/bismark:start-test` | Start app with CDP enabled for testing |
| `/bismark:screenshot` | Capture current UI state as PNG |
| `/bismark:test <scenario>` | Run automated interaction test |

**Recommended workflow after making changes:**
```
1. /bismark:start-test     # Start fresh test instance
2. /bismark:screenshot     # Verify initial state
3. <interact via CDP>      # Test your changes
4. /bismark:screenshot     # Verify final state
```

### Test Scripts

Located in `scripts/test/`:

- `cdp-server.js` - **HTTP server for fast CDP interactions** ⚡ **USE THIS**
- `cdp-helper.js` - Shared CDP connection module (used by cdp-server.js)
- `start-with-cdp.sh` - Shell script to start with debugging

### CDP Server (ALWAYS Use This)

The CDP server maintains a persistent WebSocket connection, making interactions ~50ms instead of ~2s per action.

**Start the server:**
```bash
npm run test:server
# Or in background:
npm run test:server &
```

**Use curl to interact:**
```bash
# Health check
curl -s localhost:9333/health

# Take screenshot
curl -s "localhost:9333/screenshot?path=/tmp/claude/bismark-screenshot.png"

# Get app state
curl -s localhost:9333/state

# Evaluate JavaScript
curl -s -X POST localhost:9333/eval -d 'document.title'

# Click element
curl -s -X POST localhost:9333/click -d '{"selector":"button"}'
curl -s -X POST localhost:9333/click -d '{"text":"Submit"}'

# Type into input
curl -s -X POST localhost:9333/type -d '{"selector":"input","text":"hello"}'

# Press key with modifiers
curl -s -X POST localhost:9333/key -d '{"key":"d","meta":true,"shift":true}'

# Toggle dev console
curl -s localhost:9333/toggle-dev-console

# Start mock agent
curl -s -X POST localhost:9333/mock-agent -d '{"taskId":"test-1"}'
```

### Dev Console (Development Only)

Press `Cmd+Shift+D` to toggle the dev console for:
- Running mock headless agents
- Testing event flow without API costs
- Viewing real-time event logs

### Useful CDP Patterns

```javascript
// Execute JS in renderer
await send('Runtime.evaluate', {
  expression: 'window.electronAPI.devStartMockAgent("test-1")',
  awaitPromise: true,
  returnByValue: true
});

// Simulate keyboard shortcut
await send('Runtime.evaluate', {
  expression: `window.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'd', metaKey: true, shiftKey: true, bubbles: true
  }))`
});

// Take screenshot
const { data } = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('screenshot.png', Buffer.from(data, 'base64'));
```
