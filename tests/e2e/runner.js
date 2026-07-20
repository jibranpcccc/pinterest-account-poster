const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const DbHelper = require('./helpers/dbHelper');
const { launchApp, teardownApp } = require('./helpers/appHelper');
const { injectMockApi } = require('./helpers/mockUiHelper');

async function main() {
  console.log('🚀 E2E Runner: Starting test run...');
  
  // 1. Run build to ensure latest code is compiled
  console.log('🔨 E2E Runner: Running npm run build...');
  try {
    execSync('npm run build', { cwd: path.join(__dirname, '../..'), stdio: 'inherit' });
  } catch (err) {
    console.error('❌ E2E Runner: Build failed!');
    process.exit(1);
  }

  // 2. Set up state isolation user data dir
  const testUserDataDir = path.join(__dirname, 'temp-user-data');
  if (fs.existsSync(testUserDataDir)) {
    fs.rmSync(testUserDataDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testUserDataDir, { recursive: true });

  process.env.TEST_USER_DATA_DIR = testUserDataDir;
  // Force mock browser mode for CI/headless reliability
  process.env.USE_MOCK_BROWSER = 'true';

  const dbHelper = new DbHelper(testUserDataDir);
  await dbHelper.init();

  // 3. Launch application
  const launchResult = await launchApp();
  const { page } = launchResult;
  const initialUrl = page.url();

  // 4. Expose DB and mock UI helpers
  await injectMockApi(page, dbHelper);

  // Setup Global expectations for specs
  global.windowNodeGetDb = () => dbHelper.readState();
  global.windowNodeSaveDb = async (dbState) => {
    await dbHelper.seed(dbState);
    // Tell the page UI to re-render
    await page.evaluate(async () => {
      const container = document.getElementById('e2e-scheduler-container');
      if (container && window.renderE2eUi) {
        await window.renderE2eUi(container);
      }
    });
  };

  const poll = async (fn, timeout = 3000, interval = 100) => {
    const start = Date.now();
    while (true) {
      try {
        return await fn();
      } catch (err) {
        if (Date.now() - start > timeout) {
          throw err;
        }
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
  };

  global.expect = (locator) => ({
    toContainText: async (text) => {
      await poll(async () => {
        const content = await locator.innerText();
        assert.ok(
          content.includes(text),
          `Expected element to contain "${text}", but got "${content}"`
        );
      });
    },
    not: {
      toBeChecked: async () => {
        await poll(async () => {
          const checked = await locator.isChecked();
          assert.strictEqual(checked, false, `Expected element to not be checked`);
        });
      }
    },
    toBeChecked: async () => {
      await poll(async () => {
        const checked = await locator.isChecked();
        assert.strictEqual(checked, true, `Expected element to be checked`);
      });
    },
    toHaveValue: async (val) => {
      await poll(async () => {
        const value = await locator.inputValue();
        assert.strictEqual(value, val, `Expected input value to be "${val}", but got "${value}"`);
      });
    }
  });

  // 5. Load and execute spec files
  const specFiles = [
    'specs/bulk.spec.js'
  ];

  let passedTests = 0;
  let failedTests = 0;
  const results = [];

  for (const specFile of specFiles) {
    const specPath = path.join(__dirname, specFile);
    console.log(`\n📋 Running Spec Suite: ${specFile}`);
    const tests = require(specPath);

    for (const test of tests) {
      console.log(`  ⏳ Running: ${test.name}`);
      
      // Stop any pending async requests by navigating away first
      await page.goto('about:blank');
      
      // Reset database state before each test for complete isolation
      await dbHelper.clear();
      await dbHelper.seed({
        accounts: [
          {
            id: 'acc-1',
            nickname: 'E2E Test Account',
            profilePath: 'C:\\local-data\\profiles\\acc-1',
            sessionStatus: 'connected',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ],
        boards: [
          {
            id: 'board-1',
            accountId: 'acc-1',
            name: 'E2E Testing Board',
            url: 'https://pinterest.com/test',
            lastFetchedAt: new Date().toISOString()
          }
        ],
        settings: [
          { key: 'mockMode', value: 'true' }
        ]
      });

      try {
        // Clear any residual page dialog event listeners to maintain test isolation
        page.removeAllListeners('dialog');
        page.removeAllListeners('console');
        page.removeAllListeners('pageerror');
        page.on('console', msg => {
          if (msg.type() === 'error' || msg.type() === 'warning') {
            console.log(`[BROWSER-CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
          }
        });
        page.on('pageerror', err => {
          console.error(`[BROWSER-ERROR] ${err}`);
        });

        // Go to the initial app URL to load/reload React cleanly
        await page.goto(initialUrl);
        
        // Wait for E2E navigation to be ready
        await page.waitForSelector('#e2e-nav-scheduler');

        // Run the actual test function
        await test.fn({ page, dbHelper });
        
        console.log(`  ✅ Passed: ${test.name}`);
        passedTests++;
        results.push({ name: test.name, suite: specFile, status: 'PASSED' });
      } catch (err) {
        console.error(`  ❌ Failed: ${test.name}`);
        console.error(`     Reason: ${err.message}`);
        failedTests++;
        results.push({ name: test.name, suite: specFile, status: 'FAILED', error: err.message });
      }
    }
  }

  // 6. Print report
  console.log('\n======================================');
  console.log('📊 E2E TEST REPORT');
  console.log('======================================');
  console.log(`Total Suites Run: ${specFiles.length}`);
  console.log(`Total Cases Run:  ${passedTests + failedTests}`);
  console.log(`Passed Cases:     ${passedTests}`);
  console.log(`Failed Cases:     ${failedTests}`);
  console.log('======================================');

  if (failedTests > 0) {
    console.log('\n❌ Detailing Failures:');
    results.filter(r => r.status === 'FAILED').forEach(r => {
      console.log(`  - [${r.suite}] ${r.name}: ${r.error}`);
    });
  }

  // 7. Cleanup
  console.log('\n🧹 Cleaning up...');
  await teardownApp();
  
  if (fs.existsSync(testUserDataDir)) {
    try {
      fs.rmSync(testUserDataDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore if file lock prevents deletion immediately
    }
  }

  console.log('👋 Done.');
  process.exit(failedTests > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
