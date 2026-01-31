# Start Bismark Dev Environment

Start the Bismark Electron app in development mode. This requires rebuilding and two processes running in parallel:

1. **Build main process** - compile TypeScript for the main (Electron) process
2. **Vite dev server** - serves the renderer (React) code with hot reload
3. **Electron** - runs the main process and opens the app window

First, rebuild the main process to pick up any TypeScript changes:

```bash
cd /Users/cameronfleet/dev/personal-tools/bismark && npm run build:main
```

Then run both dev commands in background (requires unsandboxed execution for network binding):

```bash
cd /Users/cameronfleet/dev/personal-tools/bismark && npm run dev
```

Wait a moment for Vite to be ready, then start Electron:

```bash
cd /Users/cameronfleet/dev/personal-tools/bismark && npm run dev:electron
```

All commands should be run with `dangerouslyDisableSandbox: true`. The dev servers should be run with `run_in_background: true`.
