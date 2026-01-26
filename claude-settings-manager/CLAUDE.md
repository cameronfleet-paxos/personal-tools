# Claude Settings Manager

## Build Instructions

After making any code changes, deploy the Electron app:

```bash
./scripts/deploy-local.sh
```

This cleans build artifacts, builds the Next.js app, packages the Electron app, and installs it to Applications.

## Development

- `pnpm dev` - Run Next.js dev server
- `pnpm electron:dev` - Run in Electron with hot reload
- `pnpm build` - Build Next.js only

## Project Structure

- `app/` - Next.js pages and API routes
- `components/` - React components
- `lib/` - Utilities and Zustand store
- `types/` - TypeScript type definitions
- `electron/` - Electron main process files
