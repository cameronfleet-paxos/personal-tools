# Start Bismark Dev Environment

Start the Bismark Electron app in development mode.

## Quick Start (Recommended)

Use the unified command that handles everything (use `run_in_background: true`):

```bash
cd /Users/cameronfleet/dev/personal-tools/bismark && npm run dev:cdp:clean
```

This single command:
1. Kills any existing processes
2. Starts Vite dev server (port 5173)
3. Builds the main process
4. Starts Electron with CDP (port 9222)
5. Starts the CDP HTTP server (port 9333)

After ~25 seconds, verify with:

```bash
npm run dev:check
```

## Without CDP (manual approach)

If you only need basic dev without CDP testing:

1. **Build main process**:
   ```bash
   cd /Users/cameronfleet/dev/personal-tools/bismark && npm run build:main
   ```

2. **Start Vite dev server** (use `run_in_background: true`):
   ```bash
   cd /Users/cameronfleet/dev/personal-tools/bismark && npm run dev
   ```

3. **Start Electron** (use `run_in_background: true`):
   ```bash
   cd /Users/cameronfleet/dev/personal-tools/bismark && npm run dev:electron
   ```
