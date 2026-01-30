# Bismark

A desktop application for monitoring and managing Claude Code agents.

## Prerequisites

- Node.js 18+
- npm

## Quick Start

```bash
# Install dependencies
npm install

# Build and install to ~/Applications
./scripts/deploy-local.sh
```

The app will be installed to `~/Applications/Bismark.app`.

## Development

```bash
# Install dependencies
npm install

# Start the development server
npm run dev:electron
```

## Configuration

Bismark stores its configuration in `~/.bismark/`:

- `settings.json` - Application settings

## Claude Code Hook Setup

Bismark can receive real-time updates from Claude Code sessions via hooks. To enable this:

1. Add the following to your Claude Code hooks configuration (`~/.claude/settings.json`):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          "curl -X POST http://localhost:3847/hook -d '{\"event\": \"PostToolUse\", \"session\": \"$CLAUDE_SESSION_ID\"}'"
        ]
      }
    ]
  }
}
```

2. Start Bismark and it will automatically listen for hook events.

## Build Commands

- `npm run build` - Build both main and renderer processes
- `npm run dist` - Create distributable package
- `npm run pack` - Create unpacked directory

## License

ISC
