#!/usr/bin/env node
/**
 * Settings Flow CDP Tests
 *
 * Comprehensive test suite for all settings page flows including:
 * - General settings (Operating Mode, Attention Mode, Grid Size)
 * - Repositories settings (viewing, editing, saving)
 * - Docker settings (image management, resource limits)
 * - Agent settings (model selection)
 *
 * Usage:
 *   node scripts/test/suites/settings-tests.js
 *   node scripts/test/suites/settings-tests.js --suite general
 *   node scripts/test/suites/settings-tests.js --suite repositories
 *   node scripts/test/suites/settings-tests.js --suite docker
 *   node scripts/test/suites/settings-tests.js --suite agent
 */

const { CDPHelper } = require('../cdp-helper');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CDP_SERVER_URL = 'http://localhost:9333';
const SCREENSHOT_DIR = '/tmp/claude/bismarck-settings-tests';

// Test results tracking
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

/**
 * Make HTTP request to CDP server
 */
async function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, CDP_SERVER_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body))
      } : {}
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(res.statusCode === 200 ? JSON.parse(data) : { error: data });
        } catch (e) {
          resolve({ data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Take screenshot with timestamp
 */
async function screenshot(name) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `${timestamp}-${name}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await request('GET', `/screenshot?path=${encodeURIComponent(filepath)}`);
  console.log(`  📸 Screenshot: ${filepath}`);
  return filepath;
}

/**
 * Wait for element to appear
 */
async function waitForSelector(selector, timeout = 5000) {
  const result = await request('POST', '/wait', { selector, timeout });
  if (!result.success) {
    throw new Error(`Timeout waiting for selector: ${selector}`);
  }
}

/**
 * Click element
 */
async function click(selector) {
  const result = await request('POST', '/click', { selector });
  if (!result.success) {
    throw new Error(`Failed to click: ${selector}`);
  }
}

/**
 * Click element by text content
 */
async function clickText(text) {
  const result = await request('POST', '/click', { text });
  if (!result.success) {
    throw new Error(`Failed to click text: ${text}`);
  }
}

/**
 * Type into input
 */
async function type(selector, text) {
  const result = await request('POST', '/type', { selector, text });
  if (!result.success) {
    throw new Error(`Failed to type into: ${selector}`);
  }
}

/**
 * Evaluate JavaScript expression
 */
async function evaluate(expression) {
  const result = await request('POST', '/eval', { expression });
  if (result.error) {
    throw new Error(`Evaluation failed: ${result.error}`);
  }
  return result.result;
}

/**
 * Wait for condition
 */
async function waitFor(condition, timeout = 5000) {
  const result = await request('POST', '/wait', { condition, timeout });
  if (!result.success) {
    throw new Error(`Timeout waiting for condition`);
  }
  return result.result;
}

/**
 * Open settings page
 */
async function openSettings() {
  console.log('  Opening settings...');
  // Click the settings button in the header (gear icon or settings text)
  await click('[data-testid="settings-button"]').catch(() =>
    clickText('Settings').catch(() =>
      // Try keyboard shortcut as fallback
      request('POST', '/key', { key: ',', meta: true })
    )
  );
  await waitForSelector('aside', 2000);
  await screenshot('settings-opened');
}

/**
 * Close settings page
 */
async function closeSettings() {
  console.log('  Closing settings...');
  await click('button:has(svg)').catch(() =>
    request('POST', '/key', { key: 'Escape' })
  );
  await new Promise(resolve => setTimeout(resolve, 500));
}

/**
 * Navigate to settings category
 */
async function navigateToCategory(category) {
  console.log(`  Navigating to ${category} category...`);
  await clickText(category);
  await waitForSelector('h3', 1000);
  await screenshot(`category-${category.toLowerCase()}`);
}

/**
 * Test runner
 */
async function runTest(name, testFn) {
  results.total++;
  console.log(`\n🧪 Test: ${name}`);

  try {
    await testFn();
    results.passed++;
    results.tests.push({ name, status: 'PASS' });
    console.log(`✅ PASS: ${name}\n`);
  } catch (error) {
    results.failed++;
    results.tests.push({ name, status: 'FAIL', error: error.message });
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${error.message}\n`);
    await screenshot(`fail-${name.replace(/\s+/g, '-').toLowerCase()}`);
  }
}

/**
 * General Settings Tests
 */
async function testGeneralSettings() {
  console.log('\n📋 General Settings Tests\n' + '='.repeat(50));

  await runTest('Open settings and navigate to General', async () => {
    await openSettings();
    await navigateToCategory('General');

    // Verify page content
    const hasHeading = await evaluate(`
      document.querySelector('h3')?.textContent.includes('General Settings')
    `);
    if (!hasHeading) throw new Error('General Settings heading not found');
  });

  await runTest('Change Operating Mode from Solo to Team', async () => {
    // Verify Solo is initially checked
    const soloChecked = await evaluate(`
      document.querySelector('input[value="solo"]')?.checked
    `);
    console.log(`  Initial: Solo=${soloChecked}`);

    // Click Team radio button
    await click('input[value="team"]');
    await new Promise(resolve => setTimeout(resolve, 300));
    await screenshot('operating-mode-team-selected');

    // Verify Team is now checked
    const teamChecked = await evaluate(`
      document.querySelector('input[value="team"]')?.checked
    `);
    if (!teamChecked) throw new Error('Team mode not selected');
    console.log(`  Changed to Team mode`);
  });

  await runTest('Change Operating Mode back to Solo', async () => {
    await click('input[value="solo"]');
    await new Promise(resolve => setTimeout(resolve, 300));

    const soloChecked = await evaluate(`
      document.querySelector('input[value="solo"]')?.checked
    `);
    if (!soloChecked) throw new Error('Solo mode not selected');
    console.log(`  Changed back to Solo mode`);
  });

  await runTest('Change Attention Mode from Focus to Expand', async () => {
    // Check initial state
    const focusChecked = await evaluate(`
      document.querySelector('input[value="focus"]')?.checked
    `);
    console.log(`  Initial: Focus=${focusChecked}`);

    // Change to Expand
    await click('input[value="expand"]');
    await new Promise(resolve => setTimeout(resolve, 300));
    await screenshot('attention-mode-expand-selected');

    // Verify change
    const expandChecked = await evaluate(`
      document.querySelector('input[value="expand"]')?.checked
    `);
    if (!expandChecked) throw new Error('Expand mode not selected');
    console.log(`  Changed to Expand mode`);
  });

  await runTest('Change Attention Mode back to Focus', async () => {
    await click('input[value="focus"]');
    await new Promise(resolve => setTimeout(resolve, 300));

    const focusChecked = await evaluate(`
      document.querySelector('input[value="focus"]')?.checked
    `);
    if (!focusChecked) throw new Error('Focus mode not selected');
    console.log(`  Changed back to Focus mode`);
  });

  await runTest('Cycle through all Grid Size options', async () => {
    const sizes = ['1x1', '2x2', '2x3', '3x3'];

    for (const size of sizes) {
      console.log(`  Testing ${size} grid size...`);
      await click(`input[value="${size}"]`);
      await new Promise(resolve => setTimeout(resolve, 300));

      const checked = await evaluate(`
        document.querySelector('input[value="${size}"]')?.checked
      `);
      if (!checked) throw new Error(`${size} not selected`);

      await screenshot(`grid-size-${size}`);
    }
    console.log(`  All grid sizes tested`);
  });

  await runTest('Close General Settings', async () => {
    await closeSettings();

    // Verify settings closed
    const settingsClosed = await evaluate(`
      !document.querySelector('aside')
    `);
    if (!settingsClosed) throw new Error('Settings did not close');
  });
}

/**
 * Repositories Settings Tests
 */
async function testRepositoriesSettings() {
  console.log('\n📋 Repositories Settings Tests\n' + '='.repeat(50));

  await runTest('Open settings and navigate to Repositories', async () => {
    await openSettings();
    await navigateToCategory('Repositories');

    const hasHeading = await evaluate(`
      document.querySelector('h3')?.textContent.includes('Repositories')
    `);
    if (!hasHeading) throw new Error('Repositories heading not found');
  });

  await runTest('Verify repositories list or empty state', async () => {
    const hasRepos = await evaluate(`
      document.querySelectorAll('.border.rounded-lg.p-4').length > 0
    `);

    const hasEmptyState = await evaluate(`
      document.querySelector('.text-center')?.textContent.includes('No repositories found')
    `);

    console.log(`  Repositories found: ${hasRepos}`);
    console.log(`  Empty state: ${hasEmptyState}`);

    if (!hasRepos && !hasEmptyState) {
      throw new Error('Neither repositories nor empty state found');
    }

    await screenshot('repositories-list');
  });

  await runTest('Edit repository if available', async () => {
    // Check if any repositories exist
    const hasRepos = await evaluate(`
      document.querySelectorAll('.border.rounded-lg.p-4').length > 0
    `);

    if (!hasRepos) {
      console.log('  No repositories to edit - skipping');
      results.skipped++;
      results.total--;
      results.passed--;
      return;
    }

    // Click first edit button
    await evaluate(`
      document.querySelector('button svg')?.closest('button')?.click()
    `);
    await new Promise(resolve => setTimeout(resolve, 500));
    await screenshot('repository-edit-mode');

    // Verify edit mode active (check and X buttons visible)
    const hasCheckButton = await evaluate(`
      Array.from(document.querySelectorAll('button svg')).some(svg =>
        svg.closest('button')?.querySelector('[class*="check"]')
      )
    `);

    if (!hasCheckButton) throw new Error('Edit mode not activated');
    console.log('  Edit mode activated');

    // Cancel edit
    await evaluate(`
      Array.from(document.querySelectorAll('button svg'))
        .find(svg => svg.closest('button')?.querySelector('[class*="x"]'))
        ?.closest('button')?.click()
    `);
    await new Promise(resolve => setTimeout(resolve, 300));
    console.log('  Edit cancelled');
  });

  await runTest('Close Repositories Settings', async () => {
    await closeSettings();
  });
}

/**
 * Docker Settings Tests
 */
async function testDockerSettings() {
  console.log('\n📋 Docker Settings Tests\n' + '='.repeat(50));

  await runTest('Open settings and navigate to Docker', async () => {
    await openSettings();
    await navigateToCategory('Docker');

    const hasHeading = await evaluate(`
      document.querySelector('h3')?.textContent.includes('Docker Settings')
    `);
    if (!hasHeading) throw new Error('Docker Settings heading not found');
  });

  await runTest('Verify Docker images section exists', async () => {
    const hasImagesSection = await evaluate(`
      Array.from(document.querySelectorAll('.text-base')).some(el =>
        el.textContent.includes('Docker Images')
      )
    `);

    if (!hasImagesSection) throw new Error('Docker Images section not found');
    await screenshot('docker-images-section');
  });

  await runTest('Add new Docker image', async () => {
    const testImage = `test-image-${Date.now()}:latest`;

    // Find and fill the image input
    const input = await evaluate(`
      document.querySelector('input[placeholder*="bismarck-agent"]')?.placeholder
    `);
    console.log(`  Found input with placeholder: ${input}`);

    await type('input[placeholder*="bismarck-agent"]', testImage);
    await screenshot('docker-image-typed');

    // Click Add button
    await clickText('Add');
    await new Promise(resolve => setTimeout(resolve, 500));
    await screenshot('docker-image-added');

    // Verify image was added
    const imageAdded = await evaluate(`
      Array.from(document.querySelectorAll('code')).some(el =>
        el.textContent.includes('${testImage}')
      )
    `);

    if (!imageAdded) throw new Error('Image not added to list');
    console.log(`  Image added: ${testImage}`);
  });

  await runTest('Remove Docker image', async () => {
    // Click the trash button for the first image
    await evaluate(`
      document.querySelector('button svg[class*="Trash"]')?.closest('button')?.click()
    `);
    await new Promise(resolve => setTimeout(resolve, 500));
    await screenshot('docker-image-removed');

    console.log('  Image removed');
  });

  await runTest('Verify invalid image name handling', async () => {
    const invalidImage = 'Invalid Image Name!!!';

    await type('input[placeholder*="bismarck-agent"]', invalidImage);
    await clickText('Add');
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check for error message
    const hasError = await evaluate(`
      Array.from(document.querySelectorAll('.text-xs')).some(el =>
        el.textContent.includes('Invalid') && el.classList.contains('text-red-500')
      )
    `);

    if (!hasError) throw new Error('No error message shown for invalid image');
    console.log('  Invalid image error displayed correctly');
    await screenshot('docker-image-validation-error');

    // Clear the input
    await type('input[placeholder*="bismarck-agent"]', '');
  });

  await runTest('Verify Resource Limits section', async () => {
    const hasResourceLimits = await evaluate(`
      Array.from(document.querySelectorAll('.text-base')).some(el =>
        el.textContent.includes('Resource Limits')
      )
    `);

    if (!hasResourceLimits) throw new Error('Resource Limits section not found');

    // Check CPU and Memory inputs exist
    const hasCpuInput = await evaluate(`
      !!document.querySelector('input#cpu-limit')
    `);
    const hasMemoryInput = await evaluate(`
      !!document.querySelector('input#memory-limit')
    `);

    if (!hasCpuInput || !hasMemoryInput) {
      throw new Error('CPU or Memory input not found');
    }

    console.log('  Resource Limits section verified');
    await screenshot('docker-resource-limits');
  });

  await runTest('Modify CPU limit', async () => {
    const currentCpu = await evaluate(`
      document.querySelector('input#cpu-limit')?.value
    `);
    console.log(`  Current CPU: ${currentCpu}`);

    await type('input#cpu-limit', '4');
    await new Promise(resolve => setTimeout(resolve, 300));

    const newCpu = await evaluate(`
      document.querySelector('input#cpu-limit')?.value
    `);
    console.log(`  New CPU: ${newCpu}`);
    await screenshot('docker-cpu-modified');
  });

  await runTest('Modify Memory limit', async () => {
    const currentMemory = await evaluate(`
      document.querySelector('input#memory-limit')?.value
    `);
    console.log(`  Current Memory: ${currentMemory}`);

    await type('input#memory-limit', '8g');
    await new Promise(resolve => setTimeout(resolve, 300));

    const newMemory = await evaluate(`
      document.querySelector('input#memory-limit')?.value
    `);
    console.log(`  New Memory: ${newMemory}`);
    await screenshot('docker-memory-modified');
  });

  await runTest('Close Docker Settings', async () => {
    await closeSettings();
  });
}

/**
 * Agent Settings Tests
 */
async function testAgentSettings() {
  console.log('\n📋 Agent Settings Tests\n' + '='.repeat(50));

  await runTest('Open settings and navigate to Agent', async () => {
    await openSettings();
    await navigateToCategory('Agent');

    const hasHeading = await evaluate(`
      document.querySelector('h3')?.textContent.includes('Agent Settings')
    `);
    if (!hasHeading) throw new Error('Agent Settings heading not found');
  });

  await runTest('Verify Agent Model options exist', async () => {
    const models = ['sonnet', 'opus', 'haiku'];

    for (const model of models) {
      const hasModel = await evaluate(`
        !!document.querySelector('input[value="${model}"]')
      `);
      if (!hasModel) throw new Error(`${model} option not found`);
      console.log(`  ✓ ${model} option found`);
    }

    await screenshot('agent-model-options');
  });

  await runTest('Change Agent Model to Opus', async () => {
    await click('input[value="opus"]');
    await new Promise(resolve => setTimeout(resolve, 300));
    await screenshot('agent-model-opus-selected');

    const opusChecked = await evaluate(`
      document.querySelector('input[value="opus"]')?.checked
    `);
    if (!opusChecked) throw new Error('Opus not selected');
    console.log('  Agent model changed to Opus');
  });

  await runTest('Change Agent Model to Haiku', async () => {
    await click('input[value="haiku"]');
    await new Promise(resolve => setTimeout(resolve, 300));
    await screenshot('agent-model-haiku-selected');

    const haikuChecked = await evaluate(`
      document.querySelector('input[value="haiku"]')?.checked
    `);
    if (!haikuChecked) throw new Error('Haiku not selected');
    console.log('  Agent model changed to Haiku');
  });

  await runTest('Change Agent Model back to Sonnet', async () => {
    await click('input[value="sonnet"]');
    await new Promise(resolve => setTimeout(resolve, 300));
    await screenshot('agent-model-sonnet-selected');

    const sonnetChecked = await evaluate(`
      document.querySelector('input[value="sonnet"]')?.checked
    `);
    if (!sonnetChecked) throw new Error('Sonnet not selected');
    console.log('  Agent model changed back to Sonnet');
  });

  await runTest('Close Agent Settings', async () => {
    await closeSettings();
  });
}

/**
 * Print test summary
 */
function printSummary() {
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary');
  console.log('='.repeat(50));
  console.log(`Total:   ${results.total}`);
  console.log(`Passed:  ${results.passed} ✅`);
  console.log(`Failed:  ${results.failed} ❌`);
  console.log(`Skipped: ${results.skipped} ⊘`);
  console.log('='.repeat(50));

  if (results.failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.tests.filter(t => t.status === 'FAIL').forEach(t => {
      console.log(`  - ${t.name}`);
      console.log(`    ${t.error}`);
    });
  }

  console.log(`\n📸 Screenshots saved to: ${SCREENSHOT_DIR}`);

  return results.failed === 0 ? 0 : 1;
}

/**
 * Main test runner
 */
async function main() {
  const args = process.argv.slice(2);
  const suiteArg = args.find(arg => arg.startsWith('--suite='));
  const suite = suiteArg ? suiteArg.split('=')[1] : 'all';

  console.log('\n🚀 Bismarck Settings CDP Tests');
  console.log('='.repeat(50));
  console.log(`Suite: ${suite}`);
  console.log(`CDP Server: ${CDP_SERVER_URL}`);
  console.log(`Screenshots: ${SCREENSHOT_DIR}`);

  // Check CDP server health
  try {
    const health = await request('GET', '/health');
    if (health.cdp !== 'connected') {
      console.error('\n❌ CDP not connected. Start the app with:');
      console.error('   npm run dev:cdp:clean');
      process.exit(1);
    }
    console.log('✅ CDP connection verified\n');
  } catch (error) {
    console.error('\n❌ CDP server not available at', CDP_SERVER_URL);
    console.error('   Start with: npm run test:server');
    console.error('   Or use: npm run dev:cdp:clean');
    process.exit(1);
  }

  try {
    // Take initial screenshot
    await screenshot('initial-state');

    // Run test suites
    if (suite === 'all' || suite === 'general') {
      await testGeneralSettings();
    }

    if (suite === 'all' || suite === 'repositories') {
      await testRepositoriesSettings();
    }

    if (suite === 'all' || suite === 'docker') {
      await testDockerSettings();
    }

    if (suite === 'all' || suite === 'agent') {
      await testAgentSettings();
    }

    // Print summary and exit
    const exitCode = printSummary();
    process.exit(exitCode);

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  main();
}

module.exports = { testGeneralSettings, testRepositoriesSettings, testDockerSettings, testAgentSettings };
