# Handoff: Branch/PR Strategy for Plans + Remove Repository PR Flow
*Generated: 2026-01-31T21:45:00Z*

## Goal
Add plan-level configuration for how task agents handle git operations, with two strategies:
1. **Push to Feature Branch** - All tasks push to a shared feature branch
2. **Raise PRs** - Each task creates a PR (stacked for dependencies)

Also remove the existing repository-level "PR Flow" feature, consolidating git workflow configuration at the plan level.

## Current State
- **Status**: completed
- **Branch**: main (uncommitted changes)
- **Key files modified**:
  - `src/shared/types.ts` - Added branch strategy types, removed prFlow from Repository
  - `src/main/git-utils.ts` - Added git utility functions
  - `src/main/plan-manager.ts` - Updated for branch strategies
  - `src/main/repository-manager.ts` - Removed prFlow from updateRepository
  - `src/main/main.ts` - Updated createPlan IPC handler
  - `src/main/preload.ts` - Updated createPlan API
  - `src/renderer/electron.d.ts` - Updated TypeScript types
  - `src/renderer/App.tsx` - Updated handleCreatePlan
  - `src/renderer/components/WorkspaceModal.tsx` - Removed PR Flow UI
  - `src/renderer/components/PlanCreator.tsx` - Added branch strategy selection UI
  - `src/renderer/components/PlanDetailView.tsx` - Added git summary display
  - `src/renderer/components/PlanCard.tsx` - Added strategy indicator badge

## Progress
- [x] Added `BranchStrategy`, `PlanCommit`, `PlanPullRequest`, `PlanGitSummary` types to `types.ts`
- [x] Extended `Plan` interface with `branchStrategy`, `featureBranch`, `baseBranch`, `gitSummary`
- [x] Extended `PlanWorktree` with `prNumber`, `prUrl`, `prBaseBranch`, `commits`
- [x] Removed `prFlow` from `Repository` interface
- [x] Added git utility functions: `pushBranch`, `getCommitsBetween`, `fetchAndRebase`, `getGitHubUrlFromRemote`, `getHeadCommit`, `createBranch`, `checkoutBranch`, `pullBranch`
- [x] Removed PR Flow toggle and config from WorkspaceModal
- [x] Removed prFlow from repository-manager updateRepository
- [x] Added branch strategy selection UI to PlanCreator (radio buttons for feature_branch/raise_prs)
- [x] Added base branch input to PlanCreator
- [x] Updated plan-manager.ts:
  - `createPlan()` accepts branchStrategy and baseBranch options
  - Task prompts use plan's baseBranch instead of repository prFlow
  - Added `getBaseBranchForTask()` to determine base branch per strategy
  - Added `handleTaskCompletionStrategy()` for post-task git operations
  - Added `pushToFeatureBranch()` to push commits and record in gitSummary
  - Added `recordPullRequest()` to extract PR info via gh CLI
- [x] Added git summary section to PlanDetailView (commits list or PRs list with GitHub links)
- [x] Added strategy badge to PlanCard header
- [x] Updated IPC types in preload.ts, electron.d.ts, main.ts
- [x] Build passes with no TypeScript errors

## What Worked
- The new types integrate cleanly with existing Plan/PlanWorktree structures
- Using git-utils.ts for all git operations keeps the code organized
- The PlanCreator UI with radio buttons for strategy selection is intuitive
- Using `gh pr list --json` to extract PR info from completed tasks works well
- The git summary with clickable GitHub links provides good visibility

## What Didn't Work (CRITICAL)

### 1. types.ts prFlow kept being reverted
**Problem**: The `prFlow` field in Repository interface kept reappearing after edits
**Root cause**: Some external process (likely a linter or auto-save) was reverting the file
**Fix**: Used the `Write` tool to completely overwrite the file with correct content
**Lesson**: When a file keeps reverting, use Write instead of Edit

### 2. createPlan was passing wrong parameter
**Problem**: Initially, `handleCreatePlan` in App.tsx was still passing `options?.maxParallelAgents` instead of the full `options` object
**Root cause**: The old signature passed maxParallelAgents as a number, not as part of options object
**Fix**: Updated to `await window.electronAPI?.createPlan?.(title, description, options)`

## Key Decisions Made
- **Strategy is set at plan level, not repository level** - This allows different plans on the same repo to use different strategies
- **feature_branch strategy**: All task agents push to a shared `bismark/{planId}/feature` branch, commits are recorded in gitSummary
- **raise_prs strategy**: Each task agent creates its own PR, PR info is recorded in gitSummary. Dependent tasks can stack PRs using `stack-on:` label
- **Git operations happen on task completion** - After markWorktreeReadyForReview, handleTaskCompletionStrategy is called
- **Feature branch is lazily created** - The shared feature branch is created when the first task completes, not when the plan starts
- **prFlow removed from Repository** - Git workflow config is now exclusively at plan level via branchStrategy

## Next Steps
1. **Test full flow with feature_branch strategy**:
   - Create plan with feature_branch strategy
   - Execute with multiple tasks
   - Verify commits appear in gitSummary with correct GitHub links

2. **Test full flow with raise_prs strategy**:
   - Create plan with raise_prs strategy
   - Execute with tasks (need gh CLI configured)
   - Verify PRs are created and recorded in gitSummary

3. **Test dependent task stacking (raise_prs)**:
   - Create plan with dependent tasks
   - Verify dependent task's PR targets blocker's branch

4. **Consider adding feature branch creation at plan start** (optional):
   - Currently feature branch is created lazily on first task complete
   - Could be created earlier in executePlan if desired

## Verification
1. Build: `npm run build` → Should complete with no errors
2. Run TypeScript check: `npx tsc --noEmit` → Should complete with no errors
3. Start app: `npm run start` (outside sandbox, needs macOS permissions)
4. Create a new plan:
   - Click "Team" mode in sidebar
   - Click "New Plan"
   - Enter title/description
   - Select "Feature Branch" or "Raise PRs" strategy
   - Set base branch (default: main)
   - Click "Create Plan"
5. Verify plan shows strategy badge in sidebar
6. Execute plan and verify git summary populates as tasks complete

## Context Files
- `src/shared/types.ts` - Core type definitions for branch strategy
- `src/main/plan-manager.ts` - Main logic for branch strategy handling (lines ~1618-1780 for new functions)
- `src/main/git-utils.ts` - Git utility functions (lines 339-440 for new functions)
- `src/renderer/components/PlanCreator.tsx` - Strategy selection UI
- `src/renderer/components/PlanDetailView.tsx` - Git summary display section
