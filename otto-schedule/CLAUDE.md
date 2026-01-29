# Otto Schedule

Puppy schedule tracker for Otto - track daily activities with checklist, notifications, and time editing.

## Development

- `pnpm dev` - Run Next.js dev server (port 3002)
- `pnpm electron:dev` - Run in Electron with hot reload
- `pnpm build` - Build Next.js only
- `pnpm electron:build` - Full production build

## Build & Deploy

After making any code changes, rebuild and deploy the Electron app:

```bash
pnpm electron:build && ./deploy.sh
```

## Project Structure

- `app/` - Next.js pages and API routes
- `components/` - React components (schedule-item, time-editor, ui/)
- `lib/` - Utilities, Zustand store, notification helpers
- `types/` - TypeScript type definitions
- `electron/` - Electron main process and preload
- `data/` - Persisted schedule and daily logs

## Data Storage

- Development: `./data/schedule.json` and `./data/logs/`
- Production: `~/.otto-schedule/schedule.json` and `~/.otto-schedule/logs/`

## Features

- Daily checklist that resets each day
- Color-coded activities by category (potty, eat, play, nap, wake)
- Inline time editing - click any time to edit
- "Next up" indicator for current/upcoming item
- Progress bar showing day completion
- Native macOS notifications 5 minutes before each event
