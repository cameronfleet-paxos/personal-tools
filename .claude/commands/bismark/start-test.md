# Start Bismark for Testing

Start the Bismark Electron app with Chrome DevTools Protocol (CDP) enabled for automated testing.

## Steps

1. **Check for existing processes** - Kill any existing Electron/Vite processes if needed

2. **Build main process** - Compile TypeScript for the main (Electron) process:
   ```bash
   cd /Users/cameronfleet/dev/personal-tools/bismark && npm run build:main
   ```

3. **Start Vite dev server** (in background):
   ```bash
   cd /Users/cameronfleet/dev/personal-tools/bismark && npm run dev
   ```

4. **Wait for Vite** - Ensure Vite is ready on port 5173 before proceeding

5. **Start Electron with CDP** (in background) - **MUST use `dangerouslyDisableSandbox: true`** due to macOS Mach port permissions:
   ```bash
   cd /Users/cameronfleet/dev/personal-tools/bismark && NODE_ENV=development npx electron --remote-debugging-port=9222 .
   ```
   > ⚠️ This command REQUIRES `dangerouslyDisableSandbox: true` - Electron needs macOS bootstrap/Mach port access which cannot be granted via sandbox exclusions.

6. **Verify CDP endpoint** - Check that CDP is available:
   ```bash
   curl http://localhost:9222/json
   ```

7. **Start CDP server** (in background) - This provides fast HTTP API for testing:
   ```bash
   cd /Users/cameronfleet/dev/personal-tools/bismark && npm run test:server &
   ```

8. **Verify CDP server** - Check it's ready:
   ```bash
   curl -s localhost:9333/health
   ```

## Notes

- **CRITICAL**: The Electron command (step 5) MUST use `dangerouslyDisableSandbox: true` - this is not optional. The `excludedCommands` setting does NOT bypass macOS Seatbelt restrictions for Mach ports.
- The Vite dev server and Electron should be run with `run_in_background: true`
- The CDP endpoint will be available at `http://localhost:9222`
- After starting, you can use `/bismark:screenshot` or `/bismark:test` to interact with the app

## Quick Start Script

Alternatively, use the shell script:
```bash
cd /Users/cameronfleet/dev/personal-tools/bismark && ./scripts/test/start-with-cdp.sh
```

Or with cleanup:
```bash
cd /Users/cameronfleet/dev/personal-tools/bismark && ./scripts/test/start-with-cdp.sh --clean
```
