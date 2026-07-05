const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runDiag() {
  const accountId = 'YWNjOjE3ODI5MDI2MTQ2NjE';
  const profileDir = path.join(process.env.APPDATA, 'pinterest-pin-publisher/local-data/profiles', accountId);
  const imagePath = 'C:\\Users\\jibra\\.gemini\\antigravity\\brain\\8401706f-ac50-4cf6-a76e-f153d34bdd1e\\pinterest_test_pin_1782919139150.png';

  console.log('Launching browser...');
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false, viewport: null,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  });
  const page = context.pages()[0] || await context.newPage();

  await page.goto('https://www.pinterest.com/pin-builder/', { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 15; i++) {
    if (page.url().includes('/pin-builder')) break;
    await page.waitForTimeout(2000);
  }
  console.log('Waiting 5s...');
  await page.waitForTimeout(5000);

  // Upload
  await page.locator('input[type="file"]').first().setInputFiles(imagePath);
  await page.waitForTimeout(3000);

  // Click board dropdown
  console.log('Clicking board dropdown...');
  await page.locator('[data-test-id="board-dropdown-select-button"]').first().click();

  // Now poll for the search input to appear (the spinner needs to finish)
  console.log('Polling for dropdown content to load (up to 15s)...');
  for (let attempt = 0; attempt < 30; attempt++) {
    const state = await page.evaluate(() => {
      const allInputs = Array.from(document.querySelectorAll('input'));
      const textInputs = allInputs.filter(i => 
        (i.type === 'text' || i.type === 'search' || !i.type) && 
        i.offsetWidth > 0 && i.offsetHeight > 0
      );
      return {
        textInputCount: textInputs.length,
        textInputs: textInputs.map(i => ({
          placeholder: i.placeholder,
          id: i.id,
          type: i.type,
          dataTestId: i.getAttribute('data-test-id'),
          ariaLabel: i.getAttribute('aria-label'),
          className: i.className.substring(0, 80),
        })),
        // Check for any board-like list items
        boardItems: Array.from(document.querySelectorAll('div[title], [data-test-id*="board"]')).filter(e => e.offsetWidth > 0).length,
      };
    });

    if (state.textInputCount > 0 || state.boardItems > 3) {
      console.log(`Dropdown loaded at attempt ${attempt}!`);
      console.log(JSON.stringify(state, null, 2));
      break;
    }
    
    if (attempt % 5 === 0) console.log(`  attempt ${attempt}: waiting... (textInputs=${state.textInputCount}, boardItems=${state.boardItems})`);
    await page.waitForTimeout(500);
  }

  // Take screenshot after dropdown has loaded
  const ssPath = 'C:\\Users\\jibra\\.gemini\\antigravity\\brain\\8401706f-ac50-4cf6-a76e-f153d34bdd1e\\diag_screenshot2.png';
  await page.screenshot({ path: ssPath });
  console.log(`Screenshot saved: ${ssPath}`);

  // Full dump of the dropdown area
  const fullDump = await page.evaluate(() => {
    const allInputs = Array.from(document.querySelectorAll('input'));
    const visibleTextInputs = allInputs.filter(i => 
      (i.type === 'text' || i.type === 'search' || !i.type) && 
      i.offsetWidth > 0 && i.offsetHeight > 0
    );
    
    // Find all clickable board-like items
    const boardItems = Array.from(document.querySelectorAll('[data-test-id*="board-dropdown-item"]'));
    
    return {
      visibleTextInputs: visibleTextInputs.map(i => ({
        outerHTML: i.outerHTML.substring(0, 300),
        placeholder: i.placeholder,
        id: i.id,
        type: i.type,
        rect: i.getBoundingClientRect(),
      })),
      boardDropdownItems: boardItems.map(e => ({
        dataTestId: e.getAttribute('data-test-id'),
        text: e.textContent?.trim()?.substring(0, 100),
        visible: e.offsetWidth > 0,
        tag: e.tagName,
        role: e.getAttribute('role'),
      })),
      // Also check for any element with "Search" placeholder
      searchPlaceholderInputs: Array.from(document.querySelectorAll('input[placeholder*="Search" i], input[placeholder*="search" i]')).map(i => ({
        outerHTML: i.outerHTML.substring(0, 300),
        visible: i.offsetWidth > 0 && i.offsetHeight > 0,
        rect: i.getBoundingClientRect(),
      })),
    };
  });
  console.log('\n=== FULL DUMP ===');
  console.log(JSON.stringify(fullDump, null, 2));

  await context.close();
  console.log('Done.');
}

runDiag().catch(e => console.error('FATAL:', e));
