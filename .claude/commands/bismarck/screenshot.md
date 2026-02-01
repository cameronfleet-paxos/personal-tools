# Bismark Screenshot

Capture a screenshot of the current Bismark app state.

## Prerequisites

1. The app must be running with CDP enabled. Use `/bismark:start-test` to start it.

2. CDP server must be running:
   ```bash
   curl -s localhost:9333/health
   ```
   If not running, start it:
   ```bash
   cd /Users/cameronfleet/dev/personal-tools/bismark && npm run test:server &
   ```

## Take Screenshot

```bash
curl -s "localhost:9333/screenshot?path=/tmp/claude/bismark-screenshot.png"
```

## Output

Screenshot saved to `/tmp/claude/bismark-screenshot.png`

After taking the screenshot, read it to show the user:

```
Read the file at /tmp/claude/bismark-screenshot.png
```

## Notes

- The CDP server maintains a persistent connection, so screenshots are fast (~50ms)
- If the server returns an error about CDP connection, the app may not be running with debugging enabled
