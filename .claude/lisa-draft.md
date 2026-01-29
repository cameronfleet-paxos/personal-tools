# Specification Draft: AgentOp

Desktop application for monitoring and managing Claude Code agents

*Interview in progress - Started: 2026-01-29*

## Overview
Desktop application for monitoring and managing Claude Code agents. Provides a unified interface to:
- View multiple agent sessions with custom terminal emulation (xterm.js)
- Get notified when agents require user input
- Quickly spawn new agents with pre-configured project directories
- Style and name agents for easy identification

## Key Decisions

### Terminal Rendering
- **Approach:** Custom terminal using xterm.js
- **Rationale:** Full interactivity, complete control over styling/features, cross-platform

### Input Detection
- **Approach:** Claude Code StopHook integration
- **Mechanism:** Configure a StopHook in Claude Code that communicates with the Agent Operator app when agent requires input
- **Rationale:** Uses official hook system - reliable, not fragile to output format changes

### IPC Transport
- **Approach:** Unix socket per agent
- **Mechanism:** App creates/listens on sockets, each agent's StopHook connects to signal events
- **Benefits:** Reliable bidirectional communication, easy agent discovery, native IPC

### Desktop Framework
- **Approach:** Electron
- **Rationale:** Most mature for terminal apps, excellent xterm.js integration, rich ecosystem for native features (notifications, system tray, etc.)

### Frontend Stack
- **Framework:** React
- **UI Components:** shadcn/ui (accessible, polished)
- **Styling:** Tailwind CSS

### Agent Presets / Workspaces
- **Approach:** Import from existing bootstrap-claude home spaces, with in-app configurability
- **Configuration per workspace:** name, directory, theme/styling
- **Storage:** App maintains its own config, initially seeded from bootstrap-claude

### UI Layout
- **Primary views:** Grid view AND tabbed view (switchable)
- **Grid:** Configurable arrangement of visible agent terminals
- **Tabs:** Each agent in a tab for scaling to many agents
- **No companion terminal panes** - simplified from bootstrap-claude setup

### Notification & Focus Behavior
- **Native macOS notifications:** Yes, when agent needs input
- **In-app visual:** Badge/highlight on waiting agent's tab/tile
- **Auto-focus:** Agent needing input is automatically brought to front
- **Queue behavior:** If multiple agents waiting, they queue and are presented one-by-one to operator
- **Queue flow:** Manual "Next" button to proceed to next waiting agent (not automatic)
- **Goal:** Seamless operator workflow - waiting agents are surfaced without manual checking

### Terminal Interaction Mode
- **Always interactive:** Full terminal control at all times
- Can type input, send signals (Ctrl-C), scroll back through history
- Not restricted based on agent state

### Session Persistence
- **Full session restore:** Closing/reopening app restores agents
- **Mechanism:** Use `claude --resume` to restore each agent's conversation
- **App tracks:** Which workspace was running in which position
- **On restart:** Re-launch agents with `--resume` flag in their directories

### Hook Auto-Configuration
- **Automatic:** App configures Claude Code StopHook on first run
- **Location:** Modifies ~/.claude/settings.json
- **Hook purpose:** Signals app when agent reaches a stop point (needs input)

### Scale
- **MVP target:** Up to ~10 concurrent agents
- **Grid layout:** Dynamic, accommodates variable agent count
- **Performance:** Optimize for 10 xterm.js instances

### Configuration Storage
- **Location:** ~/.agent-operator/
- **Contents:** Workspace definitions, layout preferences, app settings

### System Tray
- **Enabled:** Yes
- **Badge:** Shows count of agents waiting for input
- **Click action:** Opens/focuses app on waiting agent

## Problem Statement
Managing multiple Claude Code agents across iTerm2 windows is cumbersome:
- No unified view of all agents
- Easy to miss when an agent needs input (buried in background window)
- Manual process to set up agent environments with colors/names
- No easy way to spawn new agents or restore sessions

AgentOp solves this by providing a dedicated desktop app that centralizes agent monitoring, surfaces input requests automatically, and streamlines workspace management.

## Scope

### In Scope
- Electron desktop app for macOS
- xterm.js terminal emulation for up to 10 agents
- Grid and tabbed layout views
- Workspace configuration (name, directory, theme color)
- Claude Code StopHook integration for input detection
- Unix socket IPC between hook and app
- macOS notifications + system tray with queue badge
- Auto-focus queue for agents needing input
- Session persistence via `claude --resume`
- Configuration stored in ~/.agent-operator/

### Out of Scope
- Multi-user / remote agents (local single-operator only)
- Agent-to-agent communication / orchestration
- AI-powered routing or automatic task assignment
- Smart dispatching between agents

## User Stories

### US-1: Electron App Scaffold
**Description:** As a developer, I want a working Electron + React + Tailwind foundation so that I can build the app features.

**Acceptance Criteria:**
- [ ] `npm run dev` starts Electron app with React renderer
- [ ] Tailwind CSS works (utility classes apply correctly)
- [ ] shadcn/ui installed and one component renders (e.g., Button)
- [ ] App shows empty state: "No workspaces configured. Add one to get started."
- [ ] TypeScript compiles without errors
- [ ] ESLint passes

### US-2: Workspace Configuration
**Description:** As an operator, I want to add/edit/delete workspaces so that I can define my agent environments.

**Acceptance Criteria:**
- [ ] "Add Workspace" button opens modal with form
- [ ] Form fields: Name (text), Directory (file picker or text), Theme (dropdown with expanded color palette)
- [ ] Saving creates workspace in ~/.agent-operator/config.json
- [ ] Workspaces appear in a list/sidebar
- [ ] Edit and delete buttons work for existing workspaces
- [ ] Theme preview shows selected color in the form

### US-3: Single Terminal Instance
**Description:** As an operator, I want to see a single xterm.js terminal running `claude` in a workspace directory.

**Acceptance Criteria:**
- [ ] Clicking a workspace spawns PTY process running `claude` in that directory
- [ ] xterm.js displays terminal output with selected theme background color
- [ ] Terminal is fully interactive (can type, Ctrl-C works)
- [ ] Closing workspace kills the PTY process

### US-4: Grid and Tab Views
**Description:** As an operator, I want to view multiple agents in grid or tabbed layout.

**Acceptance Criteria:**
- [ ] Toggle button switches between Grid and Tab views
- [ ] Grid view shows 2-4 agents per row depending on count (responsive)
- [ ] Tab view shows one agent full-screen with tabs at top
- [ ] Active workspace is highlighted in both views
- [ ] Can click any workspace to focus it

### US-5: StopHook Integration
**Description:** As an operator, I want agents to notify the app when they need input.

**Acceptance Criteria:**
- [ ] App auto-configures StopHook in ~/.claude/settings.json on first run
- [ ] StopHook script connects to Unix socket at ~/.agent-operator/agent-{id}.sock
- [ ] When agent stops (needs input), app receives message on socket
- [ ] Agent tile/tab shows visual indicator (badge/glow) when waiting

### US-6: Notification and Focus Queue
**Description:** As an operator, I want waiting agents to be surfaced to me automatically.

**Acceptance Criteria:**
- [ ] macOS notification fires when agent needs input (uses Electron Notification API)
- [ ] Waiting agent is automatically focused in the UI
- [ ] If multiple agents waiting, they form a queue
- [ ] "Next" button appears when queue has >1 agent
- [ ] Clicking "Next" focuses the next queued agent
- [ ] System tray badge shows count of waiting agents

### US-7: Session Persistence
**Description:** As an operator, I want my agents to resume after closing/reopening the app.

**Acceptance Criteria:**
- [ ] On app close, save active workspace IDs and layout to config
- [ ] On app open, re-launch saved workspaces with `claude --resume`
- [ ] Terminal scrollback is NOT persisted (fresh terminal, but conversation resumes)
- [ ] Layout (grid/tab, positions) is restored

### US-8: System Tray
**Description:** As an operator, I want a system tray icon for quick access.

**Acceptance Criteria:**
- [ ] Tray icon appears when app is running
- [ ] Badge shows count of agents waiting (0 shows no badge)
- [ ] Clicking tray icon opens/focuses the app
- [ ] If agents waiting, focuses the first waiting agent

## Technical Design

### Data Model

**Workspace** (stored in ~/.agent-operator/config.json)
```typescript
interface Workspace {
  id: string;          // UUID
  name: string;        // Display name (e.g., "pax-main")
  directory: string;   // Absolute path (e.g., "/Users/cameron/dev/pax")
  theme: string;       // Color preset name (e.g., "brown", "blue", "teal")
}
```

**AppState** (stored in ~/.agent-operator/state.json)
```typescript
interface AppState {
  activeWorkspaceIds: string[];  // IDs of workspaces that were running
  layout: 'grid' | 'tabs';       // Current view mode
  focusedWorkspaceId?: string;   // Which workspace was focused
}
```

**Theme Presets**
```typescript
const themes = {
  brown: { bg: '#2a1e14', fg: '#ffffff' },
  blue: { bg: '#0f1433', fg: '#ffffff' },
  red: { bg: '#330f0f', fg: '#ffffff' },
  gray: { bg: '#222222', fg: '#ffffff' },
  green: { bg: '#0f2814', fg: '#ffffff' },
  purple: { bg: '#280f33', fg: '#ffffff' },
  teal: { bg: '#0f2828', fg: '#ffffff' },
  orange: { bg: '#332814', fg: '#ffffff' },
  pink: { bg: '#33141e', fg: '#ffffff' },
  // ... expandable
};
```

### IPC / Integration Points

**StopHook → App Communication**
- Hook script location: ~/.agent-operator/hooks/stop-hook.sh
- Socket path pattern: ~/.agent-operator/sockets/agent-{workspaceId}.sock
- Message format: JSON `{ "event": "stop", "reason": "input_required", "workspaceId": "..." }`

**Claude Code Settings Modification**
- File: ~/.claude/settings.json
- Hook config added to `hooks.stop` array

## User Experience

### User Flows

**First Run**
1. App launches → empty state shown
2. Click "Add Workspace" → modal with form
3. Enter name, select directory, choose theme → save
4. Workspace appears in sidebar/grid
5. Click workspace → terminal spawns with `claude`
6. App auto-configures StopHook (one-time)

**Daily Use**
1. Open app → previous workspaces auto-launch with --resume
2. Work on other tasks while agents run
3. Agent needs input → notification + auto-focus
4. Respond in focused terminal
5. Click "Next" if more agents waiting
6. Repeat

**Adding New Agent Mid-Session**
1. Click "+" or "Add Workspace"
2. Fill form → workspace created and appears
3. Click to launch → new agent spawns

### Edge Cases
- Directory doesn't exist: Show error, don't create workspace
- Agent crashes: Terminal shows exit, workspace remains (can relaunch)
- App force-quit: On next launch, resume all from state.json
- No Claude CLI installed: Show error on workspace launch

## Requirements

### Functional Requirements
- FR-1: Display up to 10 xterm.js terminals simultaneously
- FR-2: Each terminal runs in its configured workspace directory
- FR-3: Terminals use theme colors (background) from workspace config
- FR-4: StopHook notifies app when agent needs input
- FR-5: App shows visual indicator on waiting agents
- FR-6: macOS notification fires for input requests
- FR-7: Auto-focus first waiting agent; queue subsequent
- FR-8: "Next" button advances to next queued agent
- FR-9: System tray shows badge with waiting count
- FR-10: Persist and restore active workspaces on app restart

### Non-Functional Requirements
- NFR-1: App launches in < 3 seconds
- NFR-2: Terminal input latency < 50ms
- NFR-3: 10 concurrent xterm.js instances without UI jank
- NFR-4: Config file writes are atomic (no corruption on crash)

## Implementation Phases

### Phase 1: Foundation
- [ ] Initialize Electron + React + TypeScript project
- [ ] Configure Tailwind CSS
- [ ] Install and configure shadcn/ui
- [ ] Create main window with empty state UI
- [ ] Set up config directory (~/.agent-operator/)
- **Verification:** `npm run dev` launches app showing "No workspaces configured"
- **Covers:** US-1

### Phase 2: Workspace Management + Single Terminal
- [ ] Build "Add Workspace" modal with form
- [ ] Implement workspace CRUD (create, read, update, delete)
- [ ] Define and implement theme presets
- [ ] Persist workspaces to config.json
- [ ] Display workspace list/grid in UI
- [ ] Integrate xterm.js + node-pty
- [ ] Spawn `claude` process in workspace directory with theme colors
- [ ] Full terminal interactivity
- **Verification:** Can add workspace, click it, and interact with `claude` in terminal
- **Covers:** US-2, US-3

### Phase 3: Multi-Agent Views
- [ ] Implement grid layout (responsive 2-4 columns)
- [ ] Implement tab layout with tab bar
- [ ] Add view toggle (grid/tabs)
- [ ] Multiple terminals running simultaneously
- [ ] Focus handling (click to select)
- **Verification:** Launch 3+ agents, switch between grid/tab views, interact with each
- **Covers:** US-4

### Phase 4: Input Detection + Notifications
- [ ] Create StopHook script
- [ ] Auto-configure hook in ~/.claude/settings.json
- [ ] Set up Unix socket server per agent
- [ ] Handle incoming "stop" events from hook
- [ ] Visual indicator (badge/glow) on waiting agents
- [ ] macOS notifications via Electron API
- [ ] Auto-focus waiting agent
- [ ] Implement queue and "Next" button
- [ ] System tray with badge
- **Verification:** Run agent, let it ask question, verify notification + auto-focus + badge
- **Covers:** US-5, US-6, US-8

### Phase 5: Session Persistence
- [ ] Save active workspace IDs and layout on quit
- [ ] On launch, restore workspaces with `claude --resume`
- [ ] Restore layout (grid/tabs, focus)
- **Verification:** Close app with running agents, reopen, verify conversations resume
- **Covers:** US-7

## Definition of Done

This feature is complete when:
- [ ] All acceptance criteria in user stories US-1 through US-8 pass
- [ ] All implementation phases 1-5 verified
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] ESLint passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] App launches and all core flows work manually

## Ralph Loop Command

```bash
/ralph-loop "Implement AgentOp per spec at docs/specs/agentop.md

PHASES:
1. Foundation: Electron + React + Tailwind + shadcn/ui scaffold - verify with `npm run dev`
2. Workspace Management: CRUD for workspaces + single xterm.js terminal - verify by adding workspace and running claude
3. Multi-Agent Views: Grid/tab layouts, multiple terminals - verify by running 3+ agents
4. Input Detection: StopHook, notifications, auto-focus queue, system tray - verify by triggering agent input request
5. Session Persistence: Save/restore on quit/launch - verify by closing and reopening app

VERIFICATION (run after each phase):
- npm run typecheck
- npm run lint
- npm run build

ESCAPE HATCH: After 20 iterations without progress:
- Document what's blocking in the spec file under 'Implementation Notes'
- List approaches attempted
- Stop and ask for human guidance

Output <promise>COMPLETE</promise> when all phases pass verification." --max-iterations 50 --completion-promise "COMPLETE"
```

## Open Questions
- None remaining

## Implementation Notes
*To be filled during implementation*

