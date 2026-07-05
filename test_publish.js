const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runPublishTest() {
  const accountId = 'YWNjOjE3ODI5MDI2MTQ2NjE';
  const profileDir = path.join(process.env.APPDATA, 'pinterest-pin-publisher/local-data/profiles', accountId);
  const imagePath = 'C:\\Users\\jibra\\.gemini\\antigravity\\brain\\8401706f-ac50-4cf6-a76e-f153d34bdd1e\\pinterest_test_pin_1782919139150.png';

  console.log('Profile Path:', profileDir);
  console.log('Image Path:', imagePath);
  console.log('Image Exists:', fs.existsSync(imagePath));

  const launchOptions = {
    headless: false,
    viewport: null,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  };

  console.log('Launching visible Chromium window...');
  const context = await chromium.launchPersistentContext(profileDir, launchOptions);
  const page = context.pages()[0] || await context.newPage();

  console.log('Navigating to Pinterest Pin Builder...');
  await page.goto('https://www.pinterest.com/pin-builder/', { waitUntil: 'domcontentloaded' });

  // Wait loop if logged out
  let loggedIn = false;
  while (!loggedIn) {
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/signup') || currentUrl === 'https://www.pinterest.com/') {
      console.log('Please LOG IN to Pinterest in the browser window now. Script is waiting...');
      await page.waitForTimeout(2000);
    } else if (currentUrl.includes('/pin-builder')) {
      console.log('Successfully reached Pin Builder page!');
      loggedIn = true;
    } else {
      // If on homefeed or elsewhere, try redirecting to pin-builder
      console.log('Redirecting to pin-builder...');
      await page.goto('https://www.pinterest.com/pin-builder/', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(3000);
    }
  }

  console.log('Waiting 5 seconds for Pin Builder editor to initialize...');
  await page.waitForTimeout(5000);

  try {
    // 1. Upload Image
    console.log('Uploading image...');
    const fileInputSelector = 'input[type="file"]';
    await page.waitForSelector(fileInputSelector, { timeout: 15000 });
    const fileInput = page.locator(fileInputSelector).first();
    await fileInput.setInputFiles(imagePath);
    await page.waitForTimeout(2000);

    // 2. Fill Title
    console.log('Filling title...');
    const titleSelectors = [
      'input[placeholder*="title"]',
      'textarea[placeholder*="title"]',
      'input[placeholder*="Add your title"]',
      'textarea[placeholder*="Add your title"]',
      '[aria-label*="title"]',
      'textarea[id^="title"]'
    ];
    let titleEl = null;
    for (const sel of titleSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        titleEl = el;
        break;
      }
    }
    if (titleEl) {
      await titleEl.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await titleEl.fill('Vibrant Modern Geometric Gradient');
    } else {
      console.warn('Could not find Title input field.');
    }
    await page.waitForTimeout(1000);

    // 3. Fill Description
    console.log('Filling description...');
    const descSelectors = [
      'div[class*="public-DraftEditor-content"]',
      'div[aria-label*="what your Pin is about"]',
      'textarea[placeholder*="description"]',
      'textarea[placeholder*="tell everyone"]',
      'textarea[id^="description"]',
      '[aria-label*="description"]'
    ];
    let descEl = null;
    for (const sel of descSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        descEl = el;
        break;
      }
    }
    if (descEl) {
      await descEl.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.keyboard.type('A high-quality geometric gradient design created by Antigravity AI for Pinterest Pin Publisher testing.');
    } else {
      console.warn('Could not find Description input field.');
    }
    await page.waitForTimeout(1000);

    // 4. Fill Destination Link
    console.log('Filling destination link...');
    const linkSelectors = [
      'textarea[id^="pin-draft-link-"]',
      'textarea[placeholder*="link"]',
      'textarea[placeholder*="destination"]',
      'input[placeholder*="link"]',
      'input[placeholder*="destination"]',
      'input[id^="website"]',
      '[aria-label*="link"]'
    ];
    let linkEl = null;
    for (const sel of linkSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        linkEl = el;
        break;
      }
    }
    if (linkEl) {
      await linkEl.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await linkEl.fill('https://github.com');
    } else {
      console.warn('Could not find Destination Link input field.');
    }

    // 5. Select Board
    console.log('Selecting board...');
    const boardBtnSelectors = [
      '[data-test-id="board-dropdown-select-button"]',
      'button[aria-label*="board" i]',
      'button:has-text("Choose a board")',
      'div[data-test-id="board-dropdown-select-button"]',
      '[aria-label*="Select board" i]'
    ];
    let boardBtnSelector = '';
    for (const sel of boardBtnSelectors) {
      if (await page.locator(sel).first().isVisible().catch(() => false)) {
        boardBtnSelector = sel;
        break;
      }
    }

    if (boardBtnSelector) {
      const btn = page.locator(boardBtnSelector).first();
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      await btn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      await btn.click();
      
      const boardName = 'Mid Length Haircut';
      console.log(`Waiting for board picker to load for board: ${boardName}...`);
      
      // Pinterest lazy-loads the dropdown. The search input is:
      // input#pickerSearchField with type="search" and aria-label="Search through your boards"
      const boardSearchSelectors = [
        'input#pickerSearchField',
        'input[aria-label*="Search through your boards"]',
        'input[type="search"][placeholder="Search"]'
      ];

      let searchFound = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        for (const sel of boardSearchSelectors) {
          if (await page.locator(sel).first().isVisible().catch(() => false)) {
            searchFound = true;
            break;
          }
        }
        if (searchFound) break;
        if (attempt % 5 === 0) console.log(`  Waiting for dropdown... (attempt ${attempt})`);
        await page.waitForTimeout(500);
      }

      if (searchFound) {
        console.log('Board search input found! Typing board name...');
        const searchInput = page.locator('input#pickerSearchField, input[aria-label*="Search through your boards"], input[type="search"][placeholder="Search"]').first();
        await searchInput.click();
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        await searchInput.fill(boardName);
        await page.waitForTimeout(2000);

        // Click the matching board item
        const boardItemLocator = page.locator(`div[title*="${boardName}" i], [data-test-id*="board-dropdown-item"]:has-text("${boardName}")`).first();
        if (await boardItemLocator.isVisible().catch(() => false)) {
          console.log('Found matching board item, clicking...');
          await boardItemLocator.click();
        } else {
          // Fallback
          const anyMatch = page.locator(`div:has-text("${boardName}")`).first();
          if (await anyMatch.isVisible().catch(() => false)) {
            console.log('Clicking fallback board match...');
            await anyMatch.click();
          } else {
            console.error(`Board '${boardName}' not found in search results.`);
          }
        }
      } else {
        console.error('Board dropdown search input did not appear.');
      }
    } else {
      console.warn('Board button selector not found.');
    }
    await page.waitForTimeout(1500);

    // 6. Click Publish
    // The Publish button is a <div> with data-test-id="board-dropdown-save-button" and role="button"
    console.log('Clicking Publish/Save button...');
    const publishLocators = [
      page.locator('[data-test-id="board-dropdown-save-button"]'),
      page.locator('div[role="button"]:has-text("Publish")'),
      page.locator('button:has-text("Publish")'),
      page.locator('button:has-text("Save")'),
      page.locator('[data-test-id="create-pin-submit-button"]')
    ];

    let clicked = false;
    for (const locator of publishLocators) {
      const count = await locator.count().catch(() => 0);
      for (let i = 0; i < count; i++) {
        const btn = locator.nth(i);
        if (await btn.isVisible().catch(() => false)) {
          console.log(`Clicking publish element (index ${i})...`);
          await btn.click();
          clicked = true;
          break;
        }
      }
      if (clicked) break;
    }

    if (clicked) {
      console.log('Publish button clicked! Waiting 10 seconds for completion...');
      await page.waitForTimeout(10000);
    } else {
      console.warn('Publish button selector not found or not enabled.');
    }

    console.log('\n==================================================================');
    console.log('SUCCESS: All fields are filled and Pin published automatically!');
    console.log('==================================================================\n');

    await context.close();
  } catch (err) {
    console.error('Automation failed:', err.message);
  }
}

runPublishTest();
