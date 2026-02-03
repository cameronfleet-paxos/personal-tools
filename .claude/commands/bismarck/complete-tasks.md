# Complete All Beads Tasks

Automatically complete all open beads tasks sequentially using the Plan agent to design approaches, auto-accept and implement each task, then verify with CDP before committing and moving on.

## Workflow

For each open beads task:
1. **Plan**: Use the Plan agent to design an implementation approach
2. **Implement**: Auto-accept the plan and implement the changes
3. **Verify**: Use CDP screenshots to verify the changes work
4. **Commit**: Commit the changes with a descriptive message
5. **Close**: Mark the beads task as closed
6. **Repeat**: Move to the next task

## Instructions

### Step 1: Get Ready Tasks

First, check what tasks are available:

```bash
bd --sandbox ready
```

If no tasks are ready, check for blocked tasks:

```bash
bd --sandbox list --status=open
```

### Step 2: Process Each Task

For each ready task, follow this loop:

1. **Start the task**:
   ```bash
   bd --sandbox update <task-id> --status=in_progress
   ```

2. **Use Plan agent**: Enter plan mode to design the approach
   - Use `EnterPlanMode` tool to start planning
   - Thoroughly explore the codebase to understand what needs to change
   - Design a clear implementation approach
   - Exit plan mode when ready

3. **Implement the changes**: Write the code according to the plan

4. **Verify with CDP** (if Bismarck is running):
   - Take screenshots to verify UI changes
   - Check app state
   ```bash
   curl -s localhost:9333/health && curl -s "localhost:9333/screenshot?path=/tmp/claude/verify-$(date +%s).png"
   ```

5. **Commit the changes**:
   ```bash
   git add -A
   git commit -m "Implement <task-title>

   <brief description of changes>

   Closes: <task-id>

   Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
   ```

6. **Close the beads task**:
   ```bash
   bd --sandbox close <task-id>
   ```

7. **Sync beads**:
   ```bash
   bd --sandbox sync
   ```

### Step 3: Repeat Until Done

Continue with the next ready task until all tasks are completed.

## Important Notes

- Always use `bd --sandbox` for all beads commands
- Take screenshots after each implementation to verify changes
- Commit after each task, not all at once
- If a task is blocked, skip it and move to the next ready task
- If implementation fails, keep the task open and note the blocker
- Push to remote after completing all tasks:
  ```bash
  git push
  ```

## Verification Checklist

Before marking each task complete:
- [ ] Code compiles/builds without errors
- [ ] UI changes verified via CDP screenshot (if applicable)
- [ ] Changes committed with descriptive message
- [ ] Beads task marked as closed
