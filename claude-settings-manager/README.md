# Claude Settings Manager

A visual editor for Claude Code settings. Manage permissions, sandbox rules, model preferences, and hooks across global and project scopes.

## Quick Install (macOS)

```bash
git clone https://github.com/cameronfleet-paxos/personal-tools.git
cd personal-tools/claude-settings-manager
pnpm install
pnpm electron:build
cp -R dist/mac-arm64/Claude\ Settings.app /Applications/
```

Then open **Claude Settings** from your Applications folder.

## Features

- **Permissions**: Manage allowed Bash commands and MCP tool permissions
- **Sandbox**: Configure filesystem and network access rules
- **Model**: Set preferred Claude model and custom instructions
- **Hooks**: Configure pre/post command hooks
- **Commands**: View and manage slash commands

## Development

```bash
pnpm install
pnpm dev              # Next.js dev server at http://localhost:3000
pnpm electron:dev     # Run in Electron with hot reload
```

## Building

```bash
pnpm electron:build   # Build production Electron app
```

The built app will be in `dist/mac-arm64/Claude Settings.app`.
