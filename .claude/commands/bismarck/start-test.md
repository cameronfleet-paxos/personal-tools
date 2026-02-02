# Start Bismarck for Testing

Start the Bismarck Electron app with Chrome DevTools Protocol (CDP) enabled for automated testing.

## Quick Start

Run the unified dev+CDP command that waits for services to be ready:

```bash
cd /Users/cameronfleet/dev/personal-tools/bismarck && npm run dev:cdp:wait
```

This single command:
1. Kills any existing processes on ports 5173, 9222, 9333
2. Starts Vite dev server (port 5173)
3. Builds the main process
4. Starts Electron with CDP (port 9222)
5. Starts the CDP HTTP server (port 9333)
6. Waits until all services are healthy, then exits

## Verification

The command exits successfully when all services are ready. You can verify with:

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

- The services continue running in the background after the command exits
- After starting, use `/bismarck:screenshot` or `/bismarck:test` to interact with the app
- CDP endpoint: `http://localhost:9222`
- CDP server: `http://localhost:9333`
