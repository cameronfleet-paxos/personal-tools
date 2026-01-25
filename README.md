# personal-tools

Personal utilities for Claude Code workflows.

## Tools

### [claude-settings-manager](./claude-settings-manager)

Visual editor for Claude Code settings. Manage permissions, sandbox rules, model preferences, and hooks.

```bash
cd claude-settings-manager && pnpm install && pnpm electron:build
cp -R dist/mac-arm64/Claude\ Settings.app /Applications/
```

### [otto-schedule](./otto-schedule)

Electron app for tracking daily puppy schedule with checklist, notifications, and time editing.

```bash
cd otto-schedule && pnpm install && pnpm electron:build
cp -R dist/mac-arm64/Otto\ Schedule.app /Applications/
```

### bootstrap-claude

Sets up 4 iTerm2 panes across 2 windows for running multiple Claude agents.

```bash
# Add to PATH
echo 'export PATH="$PATH:$HOME/dev/personal-tools/bin"' >> ~/.zshrc

# Run
bootstrap-claude
```

```
Window 1:                    Window 2:
┌─────────┬─────────┐       ┌─────────┬─────────┐
│  white  │  badge  │       │  blue   │   red   │
│ ~/dev   │~/dev/pax│       │pax-agent│pax-work │
└─────────┴─────────┘       └─────────┴─────────┘
```
