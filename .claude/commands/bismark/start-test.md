# Start Bismark for Testing

Start the Bismark Electron app with Chrome DevTools Protocol (CDP) enabled for automated testing.

## Quick Start

Run the unified dev+CDP command in background:

```bash
cd /Users/cameronfleet/dev/personal-tools/bismark && npm run dev:cdp:clean
```

Use `run_in_background: true` since the command stays running to manage child processes.

This single command:
1. Kills any existing processes on ports 5173, 9222, 9333
2. Starts Vite dev server (port 5173)
3. Builds the main process
4. Starts Electron with CDP (port 9222)
5. Starts the CDP HTTP server (port 9333)

## Verification

After starting (wait ~25 seconds), verify all services are running:

```bash
npm run dev:check
```

Expected output when all services are up:
```
Service Status:
  Vite (5173):          UP
  Electron CDP (9222):  UP
  CDP Server (9333):    UP

All services running.
```

Or test the CDP server directly:

```bash
curl -s localhost:9333/health
```

## Notes

- The background command manages child processes - use `/tasks` to see running tasks
- After starting, use `/bismark:screenshot` or `/bismark:test` to interact with the app
- CDP endpoint: `http://localhost:9222`
- CDP server: `http://localhost:9333`
