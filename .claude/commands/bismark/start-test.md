# Start Bismark for Testing

Start the Bismark Electron app with Chrome DevTools Protocol (CDP) enabled for automated testing.

## Quick Start

Run the unified dev+CDP command:

```bash
cd /Users/cameronfleet/dev/personal-tools/bismark && npm run dev:cdp:clean
```

This single command:
1. Kills any existing processes on ports 5173, 9222, 9333
2. Starts Vite dev server (port 5173)
3. Builds the main process
4. Starts Electron with CDP (port 9222)
5. Starts the CDP HTTP server (port 9333)

**IMPORTANT**: This command MUST use `dangerouslyDisableSandbox: true` due to macOS Mach port permissions required by Electron.

## Verification

After starting, verify all services are running:

```bash
npm run dev:check
```

Or test the CDP server directly:

```bash
curl -s localhost:9333/health
```

## Notes

- The command stays running to manage child processes - press Ctrl+C to stop all
- After starting, you can use `/bismark:screenshot` or `/bismark:test` to interact with the app
- CDP endpoint: `http://localhost:9222`
- CDP server: `http://localhost:9333`
