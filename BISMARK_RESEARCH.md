# Bismark Research: Features and Architecture

**Generated:** 2026-01-31
**Task:** bismark-1mj.1
**Purpose:** Comprehensive research on Bismark's features, architecture, and capabilities

---

## Executive Summary

**Bismark** is an Electron-based desktop application that provides a unified dashboard for monitoring and orchestrating multiple Claude Code agent sessions. It enables developers to manage interactive and headless (Docker-based) AI agents, coordinate multi-agent workflows through "Team Mode," and receive real-time updates via Unix socket integration with Claude Code CLI.

### Key Value Proposition
- **Multi-Agent Orchestration**: Run and monitor multiple Claude Code sessions from a single interface
- **Headless Docker Execution**: Run task agents in isolated Docker containers without interactive terminals
- **Real-time Status Updates**: Unix socket hooks provide live agent status notifications
- **Team Mode (Experimental)**: Coordinate complex workflows across multiple agents with plan-based task delegation
- **Persistent Workspaces**: Session configurations survive app restarts

---

## 1. Core Features

### 1.1 Workspace Management
- **Multiple Agent Sessions**: Monitor unlimited Claude Code sessions simultaneously
- **Workspace Persistence**: Configurations stored in `~/.bismark/config.json`
- **Agent Customization**: Each workspace has customizable:
  - Name and purpose description
  - Theme (color scheme for UI differentiation)
  - Icon (visual identifier)
  - Working directory

### 1.2 Real-time Agent Monitoring
- **Unix Socket Integration**: Claude Code hooks send events to Bismark via Unix sockets
- **Stop Hook**: Notifies when agent pauses for user input
- **Auto-hook Configuration**: Bismark automatically configures `~/.claude/settings.json` on first launch
- **Waiting Queue**: Visual indicator when agents need attention
- **Live Terminal Output**: Full xterm.js-based terminal rendering with clickable links

### 1.3 Interactive Terminal Sessions
- **PTY (Pseudo-Terminal) Management**: Uses `node-pty` for true terminal emulation
- **Session Resumption**: Continue existing Claude Code sessions
- **Input Injection**: Send prompts/commands directly to running agents
- **Terminal Features**:
  - Clickable URLs and file paths
  - Auto-fit to window size
  - Copy/paste support
  - Full ANSI color support

### 1.4 Team Mode (Experimental)

Team Mode enables complex multi-agent workflows through hierarchical task delegation:

#### Plan Lifecycle
1. **Plan Creation**: User defines a goal and creates a plan
2. **Plan Agent**: Temporary agent analyzes the goal and breaks it into tasks
3. **Task Creation**: Plan Agent uses `bd` (Beads CLI) to create individual tasks
4. **Orchestrator**: Background process monitors task status via `bd list`
5. **Task Assignment**: When tasks are marked `bismark-ready`, Orchestrator spawns agents
6. **Execution**: Task agents run in isolated Git worktrees (or Docker containers)
7. **Completion**: Results are reviewed, PRs created, and worktrees cleaned up

#### Key Components
- **Plan Manager** (`src/main/plan-manager.ts`): ~1200 lines orchestrating the entire flow
- **Beads Integration** (`src/main/bd-client.ts`): Task management via `bd` CLI
- **Git Worktrees** (`src/main/git-utils.ts`): Isolated branches per task
- **Headless Agents** (`src/main/headless-agent.ts`): Docker-based task execution

#### Plan Statuses
- `draft`: Plan being created
- `delegating`: Plan Agent breaking down tasks
- `in_progress`: Task agents executing
- `ready_for_review`: Tasks complete, awaiting review
- `completed`: Plan finished
- `failed`: Plan execution failed

### 1.5 Headless Docker Agents

Headless mode runs agents in Docker containers without interactive terminals:

#### Features
- **Sandboxed Execution**: Full isolation via Docker containers
- **Non-Interactive**: No terminal input required; agents run autonomously
- **Stream Parsing**: Real-time event parsing from Docker output
- **Tool Proxy**: HTTP server forwards tool requests to Claude API
- **Auto-Cleanup**: Containers stopped and removed after completion

#### Architecture
```
Plan Manager
    ↓ (createWorktree)
Git Worktree (/path/to/repo/.git/worktrees/task-abc)
    ↓ (spawnContainerAgent)
Docker Container (bismark-agent:latest)
    ├─ Mounted: worktree → /workspace
    ├─ Mounted: plan dir → /plan (read-only)
    ├─ Environment: BISMARK_TASK_ID, CLAUDE_API_KEY
    ├─ Runs: claude --headless <prompt>
    └─ Output: Streamed to HeadlessAgent class
         ↓ (StreamEventParser)
Tool Proxy (HTTP on port 3100)
    ↓ (forwards tool requests)
Claude API
```

#### Current Status (as of HANDOFF.md)
- Docker integration functional
- Headless agents appear in UI sidebar with "Headless" badge
- Known issue: Tool proxy port reuse (EADDRINUSE on port 3100)
- HeadlessTerminal rendering partially working

---

## 2. Architecture

### 2.1 Technology Stack

#### Core Runtime
- **Electron 40.1.0**: Cross-platform desktop framework
- **Node.js 18+**: Runtime environment
- **TypeScript 5.9**: Type-safe development

#### Frontend
- **React 19.2.4**: UI framework
- **Vite 7.3**: Build tool with HMR (Hot Module Replacement)
- **Tailwind CSS 4.1**: Utility-first styling
- **Radix UI**: Accessible component primitives
- **xterm.js 6.0**: Terminal emulation
- **Lucide React 0.563**: Icon library

#### Backend (Main Process)
- **node-pty 1.1**: PTY (pseudo-terminal) creation
- **WebSocket 8.19**: Real-time communication
- **fs/fs.promises**: File system operations

#### Build & Packaging
- **electron-builder 26.4.0**: Application packaging
- **ESLint 9.39**: Code linting
- **PostCSS 8.5**: CSS processing

### 2.2 Multi-Process Architecture

Electron follows a multi-process model:

```
Main Process (Node.js)
├─ Window Management (BrowserWindow)
├─ IPC Handlers (ipcMain)
├─ File System Access
├─ PTY Management (node-pty)
├─ Unix Socket Server
├─ Docker Container Spawning
└─ State Persistence

Renderer Process (Chromium)
├─ React UI (Vite)
├─ IPC Client (via preload.ts)
├─ WebSocket Client
└─ xterm.js Terminals

Preload Script (contextBridge)
└─ Exposes safe IPC API to renderer
```

### 2.3 Key Files and Responsibilities

#### Main Process (`src/main/`)

| File | Lines | Purpose |
|------|-------|---------|
| `main.ts` | ~350 | App entry, window creation, IPC routing |
| `plan-manager.ts` | ~1200 | Team mode orchestration, task delegation |
| `terminal.ts` | ~400 | PTY lifecycle, session resumption |
| `socket-server.ts` | ~200 | Unix socket listener for Claude hooks |
| `state-manager.ts` | ~300 | App state, tab management |
| `config.ts` | ~500 | Persistent storage (JSON files) |
| `hook-manager.ts` | ~150 | Auto-configure Claude hooks |
| `headless-agent.ts` | ~400 | Docker agent lifecycle |
| `docker-sandbox.ts` | ~300 | Docker container spawning |
| `tool-proxy.ts` | ~200 | HTTP proxy for tool requests |
| `git-utils.ts` | ~250 | Worktree operations |
| `bd-client.ts` | ~300 | Beads task management CLI |
| `repository-manager.ts` | ~200 | Git repository tracking |

#### Renderer Process (`src/renderer/`)

| File | Lines | Purpose |
|------|-------|---------|
| `App.tsx` | ~2000+ | Main UI component, state management |
| `Terminal.tsx` | ~164 | Interactive terminal component |
| `HeadlessTerminal.tsx` | ~384 | Docker agent output display |
| `WorkspaceCard.tsx` | ~183 | Agent sidebar card |
| `PlanSidebar.tsx` | ~142 | Team mode plan list |
| `PlanCard.tsx` | ~337 | Individual plan display |
| `DevConsole.tsx` | ~288 | Development testing UI (Cmd+Shift+D) |
| `WorkspaceModal.tsx` | ~311 | Create/edit workspace dialog |

#### Shared (`src/shared/`)

| File | Purpose |
|------|---------|
| `types.ts` | TypeScript type definitions (Agent, Plan, etc.) |
| `constants.ts` | Theme definitions, icon names |

### 2.4 Data Flow

#### Agent Lifecycle (Interactive)
```
User clicks "Play" on workspace
    ↓
createTerminal() IPC call
    ↓
Main Process: spawn PTY with `claude` command
    ↓
Terminal output streamed via IPC
    ↓
Renderer: xterm.js displays output
    ↓
Claude stops (needs input)
    ↓
Unix socket hook sends "stop" event
    ↓
Main Process: add to waiting queue
    ↓
Renderer: UI shows "waiting" badge
    ↓
User types response in terminal
    ↓
Input sent to PTY via writeTerminal() IPC
    ↓
Claude continues execution
```

#### Plan Lifecycle (Team Mode)
```
User creates plan with goal
    ↓
executePlan() spawns Plan Agent in new tab
    ↓
Plan Agent runs with custom prompt
    ↓
Plan Agent uses `bd create` to create tasks
    ↓
Orchestrator polls `bd list` every 5 seconds
    ↓
Task marked as "bismark-ready"
    ↓
If headless mode: createWorktree() + spawnContainerAgent()
If interactive: createWorktree() + spawn PTY
    ↓
Task Agent runs with `bd close` instruction
    ↓
Agent closes task with result message
    ↓
Orchestrator detects completion
    ↓
Plan status → ready_for_review
    ↓
User reviews, creates PRs, completes plan
```

#### Headless Agent Event Flow
```
Docker container starts
    ↓
Container outputs JSON-RPC stream events
    ↓
HeadlessAgent parses via StreamEventParser
    ↓
Events emitted to Plan Manager
    ↓
IPC event: headless-agent-update
    ↓
Renderer: HeadlessTerminal displays output
```

### 2.5 Persistent Storage

All data stored in `~/.bismark/`:

```
~/.bismark/
├── config.json              # Workspace definitions
├── state.json               # App state, preferences, tabs
├── repositories.json        # Tracked Git repos
├── plans/
│   ├── {planId}/
│   │   ├── plan.json        # Plan definition
│   │   ├── tasks.json       # Task assignments
│   │   ├── worktrees/       # Git worktrees
│   │   └── logs/            # Activity logs
│   └── ...
└── sockets/                 # Unix sockets (symlinks to /tmp)
```

#### Core Type Definitions

```typescript
interface Agent {
  id: string
  name: string
  directory: string
  purpose: string
  theme: ThemeName
  icon: AgentIconName
  sessionId?: string
  isHeadless?: boolean
  parentPlanId?: string
  worktreePath?: string
  taskId?: string
}

interface Plan {
  id: string
  title: string
  status: PlanStatus
  goal?: string
  orchestratorWorkspaceId?: string
  orchestratorTabId?: string
  worktrees?: PlanWorktree[]
}

interface PlanWorktree {
  id: string
  planId: string
  taskId: string
  repositoryId: string
  path: string
  branch: string
  agentId: string
  status: 'active' | 'ready_for_review' | 'cleaned'
}
```

### 2.6 IPC API

Exposed via `preload.ts` contextBridge:

#### Workspace Operations
- `saveWorkspace(workspace)` → Save/update workspace config
- `getWorkspaces()` → Load all workspaces
- `deleteWorkspace(id)` → Remove workspace

#### Terminal Operations
- `createTerminal(workspaceId, directory, sessionId?)` → Spawn PTY
- `writeTerminal(workspaceId, data)` → Send input
- `closeTerminal(workspaceId)` → Kill PTY

#### Plan Operations
- `createPlan(title, goal?)` → Create new plan
- `executePlan(planId)` → Start plan execution
- `cancelPlan(planId)` → Stop plan
- `completePlan(planId)` → Mark plan done

#### Headless Operations
- `stopHeadlessAgent(taskId)` → Stop Docker container
- `getHeadlessAgentInfo(taskId)` → Get status

#### Event Listeners
- `onTerminalData((workspaceId, data) => {})` → Terminal output
- `onAgentWaiting((workspaceId) => {})` → Agent needs input
- `onPlanUpdate((plan) => {})` → Plan status changed
- `onHeadlessAgentUpdate((info) => {})` → Docker agent status
- `onPlanActivity((planId, activity) => {})` → Plan log entry

---

## 3. Integration Points

### 3.1 Claude Code CLI

Bismark integrates with Claude Code via:

#### 1. Hook Configuration (`~/.claude/settings.json`)
```json
{
  "hooks": {
    "stop": {
      "bash": "~/.bismark/hooks/stop-hook.sh"
    }
  }
}
```

The stop hook sends a JSON event to Unix socket:
```json
{
  "event": "stop",
  "reason": "input_required",
  "workspaceId": "workspace-123"
}
```

#### 2. Terminal Execution
Bismark spawns Claude Code sessions via PTY:
```bash
claude --continue <sessionId>
# or
claude --headless --env BISMARK_TASK_ID=<taskId>
```

#### 3. Session Management
- Existing sessions resumed via `--continue <sessionId>`
- New sessions started in workspace directory
- Session IDs extracted from terminal output

### 3.2 Beads (bd) Task Management

Team Mode uses `bd` CLI for task delegation:

```bash
# Create task
bd create --title "..." --description "..." --beads bismark

# List tasks
bd list --beads bismark --status open

# Update task
bd update <taskId> --labels bismark-ready

# Close task
bd close <taskId> --message "Completed: ..."
```

#### Workflow
1. Plan Agent creates tasks with `bd create`
2. Orchestrator polls `bd list` every 5 seconds
3. When task labeled `bismark-ready`, spawn agent
4. Task Agent closes task with `bd close` when done

### 3.3 Docker Integration

Headless agents run in Docker containers:

#### Image: `bismark-agent:latest`
Built from `docker/Dockerfile`:
- Base: Ubuntu 24.04
- Installs: Node.js 20, Claude CLI, git, gh
- Copies: Claude settings with hooks disabled
- Entrypoint: Runs `claude` command in headless mode

#### Volume Mounts
- Worktree: `/workspace` (read-write)
- Plan directory: `/plan` (read-only)

#### Environment Variables
- `CLAUDE_API_KEY`: API key for Claude
- `BISMARK_TASK_ID`: Task identifier
- `ANTHROPIC_API_KEY`: Fallback for API key

#### Networking
- Tool proxy on host: `http://host.docker.internal:3100`

---

## 4. User Interface

### 4.1 Layout

```
┌─────────────────────────────────────────────────────────┐
│  [Tab 1] [Tab 2] [+]                            [≡] [×] │  TabBar
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│ Workspace│  Terminal Output                             │
│ Card 1   │  (xterm.js or HeadlessTerminal)              │
│  [▶]     │                                              │
│          │                                              │
│ Workspace│                                              │
│ Card 2   │                                              │
│  [⏸]    │                                              │
│          │                                              │
│ + Add    │                                              │
│ Workspace│                                              │
│          │                                              │
├──────────┤                                              │
│ PLANS    │                                              │
│          │                                              │
│ Plan 1   │                                              │
│ [View]   │                                              │
│          │                                              │
└──────────┴──────────────────────────────────────────────┘
  Sidebar     Main Content Area
```

### 4.2 Key UI Components

#### Workspace Card
- **Name & Purpose**: User-defined labels
- **Theme**: Color-coded for visual differentiation
- **Icon**: Visual identifier (Rocket, Zap, Bug, etc.)
- **Status Badge**: "Running", "Waiting", "Headless"
- **Controls**: Play/Stop button (hidden for headless)

#### Terminal Component
- **xterm.js**: Full terminal emulation
- **Web Links**: Clickable URLs
- **Auto-fit**: Resizes with window
- **Copy/Paste**: Standard terminal shortcuts

#### HeadlessTerminal Component
- **Read-only**: Displays Docker agent output
- **Event Rendering**: Shows tool use, messages, errors
- **Status**: Real-time status updates
- **Stop Button**: Kill container

#### Plan Card
- **Title & Goal**: User-defined
- **Status**: Draft → Delegating → In Progress → Review → Complete
- **Progress**: Task count and completion percentage
- **Actions**: Execute, Cancel, Complete
- **Activity Log**: Timestamped events

### 4.3 Keyboard Shortcuts

- **Cmd+Shift+D**: Toggle DevConsole (testing UI)
- Terminal shortcuts: Standard xterm.js bindings

---

## 5. Development & Testing

### 5.1 Build Commands

```bash
npm install          # Install dependencies
npm run dev          # Vite dev server (port 5173)
npm run dev:electron # Electron in dev mode
npm run build        # Build main + renderer
npm run dist         # Package for distribution
./scripts/deploy-local.sh  # Install to ~/Applications
```

### 5.2 Testing Infrastructure

#### CDP (Chrome DevTools Protocol)
- **CDP Server**: HTTP API on port 9333
- **WebSocket**: Chrome DevTools on port 9222
- **Purpose**: Automated UI testing without Playwright overhead

#### Mock Agent Framework
- **Docker image**: `bismark-agent:mock`
- **Mock script**: `docker/mock-claude.js`
- **Purpose**: Test Team Mode without API costs

```bash
# Build mock image
cd docker && docker build -f Dockerfile.mock -t bismark-agent:mock .

# Enable mock mode
# In DevConsole: useHeadlessMode = true, useMockImage = true
```

#### Dev Test Harness
- **File**: `src/main/dev-test-harness.ts`
- **Purpose**: Simulate plan execution with mock agents
- **Trigger**: Via DevConsole UI

### 5.3 Debugging

#### Main Process
- **Logs**: `console.log` in main process files
- **DevTools**: Electron dev menu → Toggle Developer Tools

#### Renderer Process
- **React DevTools**: Available in Electron DevTools
- **Console**: Browser console in DevTools

#### Docker Containers
- **Logs**: `docker logs <containerId>`
- **Debug file**: `/tmp/claude/bismark-docker-debug.log`

---

## 6. Current State & Known Issues

### 6.1 Working Features
- ✅ Interactive workspace management
- ✅ PTY-based terminal sessions
- ✅ Unix socket hook integration
- ✅ Automatic hook configuration
- ✅ Session resumption
- ✅ Multi-tab UI
- ✅ Workspace themes and icons
- ✅ Plan creation and task delegation
- ✅ Git worktree isolation
- ✅ Beads task management integration
- ✅ Docker container spawning
- ✅ Headless agent sidebar badges

### 6.2 Known Issues (from HANDOFF.md)

#### 1. Tool Proxy Port Reuse (Critical)
- **Problem**: Port 3100 stays bound after plan cancellation
- **Error**: `listen EADDRINUSE: address already in use`
- **Workaround**: `kill $(lsof -t -i :3100)`
- **Fix needed**: Check if proxy running before starting new one

#### 2. HeadlessTerminal Rendering (In Progress)
- **Problem**: HeadlessTerminal not rendering in plan tabs
- **Possible causes**:
  - `tab.isPlanTab` check failing
  - `getHeadlessAgentsForTab` returning empty array
  - Plan ID mismatch
- **Status**: `headlessAgents` Map is populated, but UI not rendering

#### 3. orchestratorTabId Timing (Fixed)
- **Problem**: `orchestratorTabId` was null in plan updates
- **Cause**: Tab created after emitting plan update
- **Fix**: Reordered to create tab before emit

### 6.3 Experimental Features
- **Team Mode**: Functional but experimental
- **Headless Docker Agents**: Partially working
- **Multi-repository Support**: Implemented but untested at scale

---

## 7. Architectural Decisions

### 7.1 Why Electron?
- **Cross-platform**: macOS, Windows, Linux
- **Rich UI**: Full React/web stack
- **Native Integration**: Terminal, file system, notifications
- **Developer Experience**: Familiar web technologies

### 7.2 Why Unix Sockets?
- **Low Latency**: Faster than HTTP for local IPC
- **Security**: File system permissions
- **Reliability**: OS-level connection management
- **Simplicity**: No port conflicts

### 7.3 Why Docker for Headless?
- **Isolation**: Sandboxed execution environment
- **Reproducibility**: Consistent runtime across machines
- **Security**: Limited access to host system
- **Scalability**: Easy to run multiple agents in parallel

### 7.4 Why Git Worktrees?
- **Branch Isolation**: Each task in separate branch
- **Concurrent Work**: Multiple tasks in same repo
- **PR Workflow**: Easy to create PRs from task branches
- **Cleanup**: Remove worktree without affecting main repo

---

## 8. Future Enhancements (Potential)

Based on current architecture and gaps:

### 8.1 Short-term
- Fix tool proxy port reuse
- Complete HeadlessTerminal rendering
- Add retry logic for Docker container failures
- Improve error handling in plan execution
- Add plan cancellation cleanup

### 8.2 Medium-term
- Multi-repository plan support
- Parallel task execution (respect max agents limit)
- Cost tracking across plans
- Plan templates (reusable workflows)
- Agent skill definitions (specialized agents)

### 8.3 Long-term
- Remote agent execution (cloud-based Docker)
- Team collaboration (shared plans)
- Agent marketplace (pre-configured workflows)
- Integration with other AI CLI tools
- Advanced monitoring and analytics

---

## 9. Related Projects in Repository

The repository contains two other Electron apps:

### 9.1 Claude Settings Manager
- **Purpose**: Visual editor for `~/.claude/settings.json`
- **Tech**: Next.js 16, Electron 40, React Hook Form, Zod
- **Features**: Permissions, sandbox rules, hooks, MCP configs

### 9.2 Otto Schedule
- **Purpose**: Puppy activity schedule tracker
- **Tech**: Next.js 16, Electron 40, Recharts
- **Features**: Daily schedule, vitals tracking, socialization logging

Both share similar tech stack with Bismark but are independent applications.

---

## 10. Conclusion

Bismark represents a sophisticated approach to multi-agent orchestration for Claude Code. Its architecture combines proven desktop technologies (Electron, React, Node-pty) with modern containerization (Docker) and task management (Beads) to create a powerful development tool.

### Key Strengths
- **Unified Dashboard**: Single interface for multiple agents
- **Real-time Integration**: Unix socket hooks provide instant feedback
- **Flexible Execution**: Interactive terminals or headless Docker
- **Git Integration**: Worktree-based isolation enables parallel workflows
- **Extensible Design**: Plugin-ready architecture for future enhancements

### Current Focus
Development is actively focused on:
1. Stabilizing headless Docker agent execution
2. Completing Team Mode plan orchestration
3. Improving error handling and cleanup
4. Testing multi-agent workflows

Bismark demonstrates the potential for IDE-like experiences built around AI agents, paving the way for more sophisticated human-AI collaboration tools.

---

**Research compiled by:** Claude Code Agent (Headless Mode)
**Task ID:** bismark-1mj.1
**Date:** 2026-01-31
