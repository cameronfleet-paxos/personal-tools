# Start Bismark Dev Environment

Start the Bismark Electron app in development mode.

## Basic Development (without CDP)

Development requires two processes running in parallel:

1. **Build main process** - compile TypeScript for the main (Electron) process:
   ```bash
   cd /Users/cameronfleet/dev/personal-tools/bismark && npm run build:main
   ```

2. **Start Vite dev server** (in background):
   ```bash
   cd /Users/cameronfleet/dev/personal-tools/bismark && npm run dev
   ```

3. **Start Electron** (in background):
   ```bash
   cd /Users/cameronfleet/dev/personal-tools/bismark && npm run dev:electron
   ```

All commands should be run with `dangerouslyDisableSandbox: true`. The dev servers should be run with `run_in_background: true`.

## Development with CDP (for automated testing)

For testing with Chrome DevTools Protocol support, use the unified command instead:

```bash
cd /Users/cameronfleet/dev/personal-tools/bismark && npm run dev:cdp
```

Or with cleanup of existing processes:

```bash
cd /Users/cameronfleet/dev/personal-tools/bismark && npm run dev:cdp:clean
```

This starts Vite, Electron with CDP, and the CDP HTTP server in one command.

See `/bismark:start-test` for full testing workflow.
