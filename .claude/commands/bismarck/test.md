# Bismarck UI Test

Run automated tests against the running Bismarck app using the CDP server.

## Prerequisites

1. Bismark must be running with remote debugging enabled. Use `/bismarck:start-test` to start it.

2. CDP server must be running. Start it in the background:
   ```bash
   cd /Users/cameronfleet/dev/personal-tools/bismarck && npm run test:server &
   ```

3. Verify the server is running:
   ```bash
   curl -s localhost:9333/health
   ```

## Available Tests

### Screenshot
Take a screenshot of the current app state:

```bash
curl -s "localhost:9333/screenshot?path=/tmp/claude/bismarck-screenshot.png"
```

### Get App State
Check the current app state:

```bash
curl -s localhost:9333/state
```

### Toggle Dev Console
Toggle the dev console (Cmd+Shift+D):

```bash
curl -s localhost:9333/toggle-dev-console
```

### Start Mock Agent
Start a mock agent for testing:

```bash
curl -s -X POST localhost:9333/mock-agent -d '{"taskId":"test-1"}'
```

### Evaluate JavaScript
Run arbitrary JavaScript in the renderer:

```bash
curl -s -X POST localhost:9333/eval -d 'document.title'
```

### Click Element
Click by CSS selector:

```bash
curl -s -X POST localhost:9333/click -d '{"selector":"button.submit"}'
```

Click by text content:

```bash
curl -s -X POST localhost:9333/click -d '{"text":"Submit"}'
```

### Type Text
Type into an input field:

```bash
curl -s -X POST localhost:9333/type -d '{"selector":"input.name","text":"Hello"}'
```

### Press Key
Press a keyboard key with modifiers:

```bash
curl -s -X POST localhost:9333/key -d '{"key":"d","meta":true,"shift":true}'
```

### Wait for Element
Wait for an element to appear:

```bash
curl -s -X POST localhost:9333/wait -d '{"selector":".loaded","timeout":5000}'
```

## Instructions

1. First verify CDP server is running:
   ```bash
   curl -s localhost:9333/health
   ```
   If not running, start it in the background.

2. Run the appropriate test based on the user's request

3. After running tests, take a screenshot to verify the result and show it to the user

4. All curl commands run quickly (~50ms) since the server maintains the CDP connection

## Usage Examples

- `/bismarck:test screenshot` - Take a screenshot
- `/bismarck:test mock-agent` - Test mock agent flow
- `/bismarck:test dev-console` - Test dev console toggle
- `/bismarck:test state` - Get current app state
