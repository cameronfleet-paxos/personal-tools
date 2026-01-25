# Claude Settings Manager

## Build Instructions

After making any code changes, always rebuild and deploy the Electron app:

```bash
pnpm electron:build && cp -R dist/mac-arm64/Claude\ Settings.app /Users/cameronfleet/Applications/
```

This builds the Next.js app, prepares the standalone build, packages the Electron app, and installs it to Applications.

## Development

- `pnpm dev` - Run Next.js dev server
- `pnpm electron:dev` - Run in Electron with hot reload
- `pnpm build` - Build Next.js only
- `pnpm electron:build` - Full production build (always run this after changes)

## Project Structure

- `app/` - Next.js pages and API routes
- `components/` - React components
- `lib/` - Utilities and Zustand store
- `types/` - TypeScript type definitions
- `electron/` - Electron main process files
