# personal-tools

Personal CLI utilities.

## Tools

### bootstrap-claude

Sets up 4 iTerm2 panes across 2 windows for running multiple Claude agents.

**Layout:**
```
Window 1:                    Window 2:
┌─────────┬─────────┐       ┌─────────┬─────────┐
│  white  │  badge  │       │  blue   │   red   │
│ ~/dev   │~/dev/pax│       │pax-agent│pax-work │
└─────────┴─────────┘       └─────────┴─────────┘
```

**Agent Configuration:**

| Agent | Badge | Directory | Color |
|-------|-------|-----------|-------|
| white | WHITE | ~/dev | Dark gray |
| badge | BADGE | ~/dev/pax | Gold/yellow |
| blue | BLUE | ~/dev/pax-agent1 | Blue |
| red | RED | ~/dev/pax-worktrees | Red |

**Installation:**
```bash
# Add to PATH
echo 'export PATH="$PATH:$HOME/dev/personal-tools/bin"' >> ~/.zshrc
source ~/.zshrc
```

**Usage:**
```bash
bootstrap-claude
```

**Requirements:**
- macOS
- iTerm2
