const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runInspect() {
  const accountId = 'YWNjOjE3ODI5MDI2MTQ2NjE';
  const profileDir = path.join(process.env.APPDATA, 'pinterest-pin-publisher/local-data/profiles', accountId);
  const imagePath = 'C:\\Users\\jibra\\.gemini\\antigravity\\brain\\8401706f-ac50-4cf6-a76e-f153d34bdd1e\\pinterest_test_pin_1782919139150.png';
  const screenshotPath = 'C:\\Users\\jibra\\.gemini\\antigravity\\brain\\8401706f-ac50-4cf6-a76e-f153d34bdd1e\\pinterest_inspect_screenshot.png';

  console.log('Launching browser context...');
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: null,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  });
  const page = context.pages()[0] || await context.newPage();

  console.log('Navigating to Pin Builder...');
  await page.goto('https://www.pinterest.com/pin-builder/', { waitUntil: 'domcontentloaded' });

  // Wait loop if logged out
  let loggedIn = false;
  while (!loggedIn) {
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/signup') || currentUrl === 'https://www.pinterest.com/') {
      console.log('Waiting for login...');
      await page.waitForTimeout(2000);
    } else if (currentUrl.includes('/pin-builder')) {
      loggedIn = true;
    } else {
      await page.goto('https://www.pinterest.com/pin-builder/', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(3000);
    }
  }

  console.log('Waiting 5s for page stability...');
  await page.waitForTimeout(5000);

  try {
    console.log('Uploading image...');
    await page.locator('input[type="file"]').first().setInputFiles(imagePath);
    await page.waitForTimeout(2000);

    console.log('Filling title...');
    const titleEl = page.locator('input[placeholder*="title"], textarea[placeholder*="title"], [aria-label*="title"]').first();
    await titleEl.click();
    await titleEl.fill('Inspect Test Pin Title');
    await page.waitForTimeout(1000);

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
      await page.waitForTimeout(1500);
      
      const boardName = 'Mid Length Haircut';
      let searchSelector = '';
      let matchedOptionLocator = null;
      const searchSelectors = [
        '[role="listbox"] input',
        '[role="menu"] input',
        'div[class*="popover" i] input',
        'input[id*="board-search" i]',
        '[data-test-id="board-search-input" i]',
        'input[placeholder*="Search" i]:not([id*="searchBoxInput"]):not([data-test-id="search-box-input"])'
      ];

      for (let attempt = 0; attempt < 10; attempt++) {
        for (const sel of searchSelectors) {
          if (await page.locator(sel).first().isVisible().catch(() => false)) {
            searchSelector = sel;
            break;
          }
        }
        if (searchSelector) break;

        const boardOptionSelectors = [
          `[role="option"]:has-text("${boardName}"), button:has-text("${boardName}"), div:has-text("${boardName}")`
        ];
        for (const sel of boardOptionSelectors) {
          const loc = page.locator(sel).first();
          if (await loc.isVisible().catch(() => false)) {
            matchedOptionLocator = loc;
            break;
          }
        }
        if (matchedOptionLocator) break;

        await page.waitForTimeout(500);
      }

      if (searchSelector) {
        console.log('Typing board name in search input...');
        const searchInput = page.locator(searchSelector).first();
        await searchInput.click();
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        await searchInput.fill(boardName);
        await page.waitForTimeout(2000);

        const matchingOption = page.locator(`[role="option"]:has-text("${boardName}"), [role="listitem"]:has-text("${boardName}"), div:has-text("${boardName}")`).first();
        if (await matchingOption.isVisible().catch(() => false)) {
          await matchingOption.click();
        } else {
          const firstOption = page.locator('[role="option"], [role="listitem"]').first();
          if (await firstOption.isVisible().catch(() => false)) {
            await firstOption.click();
          } else {
            console.error(`Board '${boardName}' not found in Pinterest dropdown results.`);
          }
        }
      } else if (matchedOptionLocator) {
        console.log('Board found in list directly, clicking...');
        await matchedOptionLocator.click();
      } else {
        console.error('Could not open board list or find board option.');
      }
    }
    
    await page.waitForTimeout(3000);

    console.log('Taking screenshot for visual diagnostics...');
    await page.screenshot({ path: screenshotPath });
    console.log('Screenshot saved at:', screenshotPath);

    console.log('Dumping HTML of all button tags on the page...');
    const buttonHtmls = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.map(b => ({
        text: b.innerText || b.textContent || '',
        html: b.outerHTML,
        visible: b.offsetWidth > 0 && b.offsetHeight > 0
      }));
    });
    console.log('--- BUTTONS FOUND ---');
    console.log(JSON.stringify(buttonHtmls, null, 2));
    console.log('---------------------');

    await context.close();
  } catch (err) {
    console.error('Inspect failed:', err);
    await context.close();
  }
}

runInspect();
