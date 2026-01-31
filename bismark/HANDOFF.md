# Handoff: Fix Headless Agent Visibility in Bismark UI
*Generated: 2026-01-31T13:20:00Z*

## Goal
When headless Docker task agents run (`useHeadlessMode = true`), they should:
1. Appear in the sidebar with a "Headless" badge (no play button)
2. Render a HeadlessTerminal component in the plan tab grid showing Docker output
3. Be stoppable via a stop button

## Current State
- **Status**: in-progress (partially working)
- **Branch**: main (uncommitted changes)
- **Key files modified**:
  - `bismark/src/shared/types.ts` - Added `isHeadless?: boolean` to Agent interface
  - `bismark/src/main/plan-manager.ts` - Set isHeadless flag, exported stopHeadlessTaskAgent, fixed orchestratorTabId emit order
  - `bismark/src/main/main.ts` - Added stop-headless-agent IPC handler
  - `bismark/src/main/preload.ts` - Added stopHeadlessAgent method
  - `bismark/src/renderer/electron.d.ts` - Added stopHeadlessAgent type
  - `bismark/src/renderer/components/WorkspaceCard.tsx` - Added Headless badge, stop button, hide play button
  - `bismark/src/renderer/App.tsx` - Added handleStopHeadlessAgent, onStopHeadless callback, debug logging

## Progress
- [x] Added `isHeadless?: boolean` flag to Agent/Workspace type
- [x] Set `isHeadless: true` when creating task agents in headless mode
- [x] WorkspaceCard shows "Headless" badge with Container icon
- [x] WorkspaceCard hides play button for headless agents, shows stop button
- [x] Added `stop-headless-agent` IPC handler
- [x] Fixed `orchestratorTabId` being null in plan-update events (was emitted BEFORE tab was created)
- [x] Added debug logging to trace headlessAgents state

## What Worked
- The `isHeadless` flag is correctly set on task agent workspaces
- The "Headless" badge renders correctly in the sidebar
- Moving `emitPlanUpdate()` to AFTER setting `orchestratorTabId` fixed the plan lookup issue
- The `headlessAgents` Map in renderer IS being populated (size: 2 shown in logs)
- The `getHeadlessAgentsForTab` function now finds the plan correctly when `orchestratorTabId` is set

## What Didn't Work (CRITICAL)

### 1. orchestratorTabId was null in renderer state
**Problem**: `getHeadlessAgentsForTab` couldn't find the plan because all plans had `orchestratorTabId: null`
**Root cause**: In `executePlan()`, the code was:
```typescript
savePlan(plan)
emitPlanUpdate(plan)  // Emitted BEFORE orchestratorTabId was set!
const orchestratorTab = createTab(...)
plan.orchestratorTabId = orchestratorTab.id  // Set AFTER emit
```
**Fix**: Reordered to create tab and set ID before emitting:
```typescript
const orchestratorTab = createTab(...)
plan.orchestratorTabId = orchestratorTab.id
savePlan(plan)
emitPlanUpdate(plan)
```
**File**: `bismark/src/main/plan-manager.ts` lines ~277-286

### 2. Tool proxy port EADDRINUSE
**Problem**: Starting headless agent fails with `listen EADDRINUSE: address already in use`
**Root cause**: The tool proxy from previous test runs stays alive even after plan cancellation. Port 3100 remains bound.
**Error**: `Failed to start headless agent for bismark-ghx.1 - listen EADDRINUSE: address`
**Workaround**: `kill $(lsof -t -i :3100)` to free the port
**Real fix needed**: The `startToolProxy()` function in `tool-proxy.ts` should either:
  - Check if proxy is already running and reuse it
  - Kill existing proxy before starting new one
  - Use a different port if 3100 is busy

### 3. HeadlessTerminal not rendering even with data
**Problem**: Even when `headlessAgents.size: 2` in renderer state, HeadlessTerminal doesn't render
**Possible causes** (not fully debugged):
  - The tab being rendered might not be the plan tab (`tab.isPlanTab` check)
  - The `shouldShowTab` logic might be hiding the content
  - The `getHeadlessAgentsForTab` might return empty array due to planId mismatch

## Key Decisions Made
- HeadlessTerminal renders in plan tabs only (where `tab.isPlanTab === true`)
- Headless agents are tracked by `taskId` in a Map
- The sidebar shows headless agents but they can't be manually started (no play button)
- Stop button calls IPC to kill Docker container

## Next Steps
1. **Fix tool proxy port reuse** - Modify `startToolProxy()` in `bismark/src/main/tool-proxy.ts` to handle existing proxy
2. **Test full flow** - Start a new plan after killing port 3100, verify HeadlessTerminal renders
3. **Debug HeadlessTerminal rendering** - If still not rendering, add more logging in the plan tab rendering section of App.tsx (around line 1000)
4. **Verify events flow** - Check that `headless-agent-started` and `headless-agent-update` IPC events are received when container starts

## Verification
1. Kill any existing proxy: `kill $(lsof -t -i :3100) 2>/dev/null`
2. Rebuild: `npm run build`
3. Start app: `npm run start`
4. Start a new plan in team mode
5. Wait for Plan Agent to create tasks and Orchestrator to mark one as `bismark-ready`
6. Check console for:
   - `[Renderer] Received plan-update { orchestratorTabId: "tab-xxx", status: "delegating" }`
   - `[Renderer] Received headless-agent-started { taskId: "...", planId: "..." }`
   - `[Renderer] headlessAgents state changed: X [...]` (X > 0)
   - `[Renderer] getHeadlessAgentsForTab: { agentsFound: X }` (X > 0)
7. Verify Docker container starts: `docker ps`
8. HeadlessTerminal should appear in plan tab grid

## Context Files
- `bismark/src/main/plan-manager.ts` - Main headless agent logic, processReadyTask(), startHeadlessTaskAgent()
- `bismark/src/main/tool-proxy.ts` - Tool proxy that needs port handling fix
- `bismark/src/renderer/App.tsx` - getHeadlessAgentsForTab(), HeadlessTerminal rendering (~line 1000)
- `bismark/src/renderer/components/HeadlessTerminal.tsx` - The terminal component for headless output
- `bismark/src/main/headless-agent.ts` - HeadlessAgent class that spawns Docker containers
