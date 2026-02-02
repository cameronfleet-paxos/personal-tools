# Bismarck Test Suites

This directory contains comprehensive test suites for testing Bismarck UI flows via CDP (Chrome DevTools Protocol).

## Available Test Suites

### Settings Tests (`settings-tests.js`)

Comprehensive test coverage for all settings page flows:

#### General Settings
- Opening and closing settings page
- Operating Mode: Solo ⟷ Team switching
- Attention Mode: Focus ⟷ Expand switching
- Grid Size: Testing all options (1x1, 2x2, 2x3, 3x3)

#### Repositories Settings
- Viewing repositories list or empty state
- Entering and exiting edit mode
- Verifying edit UI components

#### Docker Settings
- Adding Docker images with validation
- Removing Docker images
- Invalid image name error handling
- CPU limit modification
- Memory limit modification

#### Agent Settings
- Verifying all model options (Sonnet, Opus, Haiku)
- Switching between models
- Verifying model selection persistence

## Running Tests

### Prerequisites

1. Start the app with CDP enabled:
   ```bash
   npm run dev:cdp:clean
   ```

   This starts:
   - Vite dev server (port 5173)
   - Electron with CDP (port 9222)
   - CDP HTTP server (port 9333)

2. Verify services are running:
   ```bash
   npm run dev:check
   ```

### Run All Tests

```bash
node scripts/test/suites/settings-tests.js
```

### Run Specific Test Suite

```bash
# General settings only
node scripts/test/suites/settings-tests.js --suite=general

# Repositories settings only
node scripts/test/suites/settings-tests.js --suite=repositories

# Docker settings only
node scripts/test/suites/settings-tests.js --suite=docker

# Agent settings only
node scripts/test/suites/settings-tests.js --suite=agent
```

## Test Output

### Console Output
Tests will print:
- ✅ Pass/Fail status for each test
- 📸 Screenshot paths
- 📊 Summary with total/passed/failed counts

### Screenshots
All screenshots are saved to `/tmp/claude/bismarck-settings-tests/` with timestamps and descriptive names:
- `YYYY-MM-DDTHH-MM-SS-initial-state.png`
- `YYYY-MM-DDTHH-MM-SS-settings-opened.png`
- `YYYY-MM-DDTHH-MM-SS-category-general.png`
- etc.

### Exit Codes
- `0`: All tests passed
- `1`: One or more tests failed or fatal error

## Test Architecture

### CDP Server Integration
Tests use HTTP requests to the CDP server (port 9333) for fast interactions:
- `GET /screenshot?path=...` - Capture screenshots
- `POST /eval` - Execute JavaScript
- `POST /click` - Click elements
- `POST /type` - Type into inputs
- `POST /wait` - Wait for selectors/conditions

### Test Utilities
- `openSettings()` - Opens settings page
- `closeSettings()` - Closes settings page
- `navigateToCategory(name)` - Switches to settings category
- `screenshot(name)` - Takes timestamped screenshot
- `click(selector)` - Clicks element by selector
- `clickText(text)` - Clicks element by text content
- `type(selector, text)` - Types into input
- `evaluate(expr)` - Executes JavaScript
- `waitForSelector(selector, timeout)` - Waits for element

## Adding New Tests

1. Add test function:
   ```javascript
   async function testNewFeature() {
     console.log('\n📋 New Feature Tests\n' + '='.repeat(50));

     await runTest('Test description', async () => {
       // Test implementation
       await openSettings();
       await navigateToCategory('NewCategory');
       // ... test steps ...
       await closeSettings();
     });
   }
   ```

2. Register in main():
   ```javascript
   if (suite === 'all' || suite === 'newfeature') {
     await testNewFeature();
   }
   ```

## Troubleshooting

### CDP Not Connected
```
❌ CDP not connected
```
**Solution**: Start app with `npm run dev:cdp:clean`

### CDP Server Not Available
```
❌ CDP server not available at http://localhost:9333
```
**Solution**: The CDP server starts automatically with `npm run dev:cdp:clean`

### Element Not Found
```
Failed to click: button[data-testid="settings"]
```
**Solutions**:
1. Check screenshot to verify UI state
2. Update selector to match actual DOM
3. Add wait time if element loads slowly
4. Use `waitForSelector()` before interaction

### Tests Flaky
**Common causes**:
1. Missing wait times after interactions
2. Animation/transition delays
3. Async state updates

**Solutions**:
- Add `await new Promise(resolve => setTimeout(resolve, 300))` after interactions
- Use `waitForSelector()` to ensure elements are ready
- Use `waitFor()` for condition-based waits

## Best Practices

1. **Always take screenshots** at key points for debugging
2. **Wait for animations** to complete before assertions
3. **Use descriptive test names** that explain what's being tested
4. **Clean up state** - close dialogs/settings after each test
5. **Handle both success and error paths** where applicable
6. **Use specific selectors** - IDs > data-testid > classes > tag names
7. **Verify state changes** after interactions
8. **Log progress** to console for visibility

## CI/CD Integration

To integrate with CI/CD:

```bash
#!/bin/bash
# Start services
npm run dev:cdp:clean &
sleep 5

# Run tests
node scripts/test/suites/settings-tests.js

# Capture exit code
EXIT_CODE=$?

# Cleanup
killall electron node

exit $EXIT_CODE
```
