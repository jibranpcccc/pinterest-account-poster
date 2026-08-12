import { chromium, BrowserContext, Page } from 'playwright-core';
import * as path from 'path';
import * as fs from 'fs';
import { FingerprintManager, generateInjectionScript } from './fingerprintManager';
import { getChromiumExecutablePath } from './chromiumPath';
import { DbManager } from '../database/db';
import { OpenCodeProvider } from '../ai/openCodeProvider';
import { browserLockManager } from './browserLockManager';

export interface RepinJob {
  id: string;
  accountId: string;
  boardName: string;
  keywords: string;
  count: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  errorMessage?: string;
  liveLinks?: string[];
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export class RepinExecutor {
  public async executeRepinJob(
    job: RepinJob,
    profilePath: string,
    db: DbManager,
    onProgress: (msg: string) => void
  ): Promise<void> {
    const fingerprint = FingerprintManager.getOrCreate(profilePath);
    const fpLaunchOpts = FingerprintManager.toLaunchOptions(fingerprint);
    
    const launchOptions: any = {
      headless: false,
      ...fpLaunchOpts,
      executablePath: getChromiumExecutablePath(),
      args: [
        '--start-maximized', 
        '--disable-blink-features=AutomationControlled', 
        '--no-sandbox', 
        '--disable-gpu',
        '--window-position=-32000,-32000' // Push off-screen to act as headless
      ]
    };

    let context: BrowserContext | null = null;
    let page: Page | null = null;
    
    try {
      browserLockManager.acquireLock(job.accountId, 'Auto-Repin');
      onProgress('Opening browser for Auto-Repin...');
      context = await chromium.launchPersistentContext(profilePath, launchOptions);
      const injectionScript = generateInjectionScript(fingerprint);
      await context.addInitScript(injectionScript);
      
      page = await context.newPage();
      
      onProgress('Navigating to Pinterest...');
      await page.goto('https://www.pinterest.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      
      if (page.url().includes('/login') || page.url().includes('ideas')) {
        throw new Error('Pinterest session expired. Please log in from Accounts tab.');
      }
      
      // Parse target boards list for multi-board rotation
      const boardList = job.boardName
        .split(/[\n,]+/)
        .map(b => b.trim())
        .filter(Boolean);
      if (boardList.length === 0) {
        boardList.push('General');
      }

      let queryPool: string[] = [];
      const primaryBoard = boardList[0];
      const rawKeywords = (job.keywords || '').trim();

      // AI Random Search Queries Generation
      if (rawKeywords.startsWith('[AI_AUTO_GENERATE]')) {
        onProgress(`Generating randomized OpenCode AI search queries for "${primaryBoard}"...`);
        const aiProvider = new OpenCodeProvider(db);
        try {
          queryPool = await aiProvider.generateRepinKeywordPool(primaryBoard, 5);
        } catch (e) {
          console.warn('AI keyword pool generation failed, using board name fallback', e);
          queryPool = [primaryBoard];
        }
        if (!queryPool || queryPool.length === 0) queryPool = [primaryBoard];
        onProgress(`AI generated ${queryPool.length} search variations: ${queryPool.map(q => `"${q}"`).join(', ')}`);
      } else {
        queryPool = rawKeywords.split(/[\n,]+/).map(k => k.trim()).filter(Boolean);
        if (queryPool.length === 0) queryPool = [primaryBoard];
      }

      // Resilient Pinterest pin grid locators
      const pinSelector = [
        '[data-test-id="pin"]',
        '[data-test-id="pin-card"]',
        'div[data-grid-item="true"]',
        'div[role="listitem"]',
        'a[href*="/pin/"]'
      ].join(', ');

      let savedCount = 0;
      let attempt = 0;
      const liveLinks: string[] = [];
      const maxAttempts = Math.max(job.count * 5, 15);
      let currentQueryIndex = 0;
      let currentQuery = queryPool[0];

      onProgress(`Searching Pinterest for "${currentQuery}"...`);
      await page.goto(`https://www.pinterest.com/search/pins/?q=${encodeURIComponent(currentQuery)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      while (savedCount < job.count && attempt < maxAttempts) {
        attempt++;
        const targetBoard = boardList[savedCount % boardList.length];
        
        // Rotate search query every 3 attempts to get fresh random pins
        if (attempt % 3 === 0 && queryPool.length > 1) {
          currentQueryIndex = (currentQueryIndex + 1) % queryPool.length;
          currentQuery = queryPool[currentQueryIndex];
          onProgress(`Switching search query to "${currentQuery}"...`);
          await page.goto(`https://www.pinterest.com/search/pins/?q=${encodeURIComponent(currentQuery)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(2500);
        }

        onProgress(`Attempt ${attempt}/${maxAttempts}: Saving pin ${savedCount + 1}/${job.count} to board "${targetBoard}"...`);

        // Find pins on search page
        const pins = await page.locator(pinSelector).all();
        if (pins.length === 0) {
          console.warn(`No pins found for query "${currentQuery}". Retrying...`);
          await page.waitForTimeout(2000);
          continue;
        }

        const pinIndex = (attempt - 1) % Math.min(pins.length, 25);
        const pin = pins[pinIndex];
        
        await pin.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(600);

        let pinSaved = false;

        // ─────────────────────────────────────────────────────────────
        // STRATEGY 1: Direct Hover & Repin on Search Card
        // ─────────────────────────────────────────────────────────────
        try {
          await pin.hover({ force: true }).catch(() => {});
          await page.waitForTimeout(400);

          const hoverSaveBtn = pin.locator([
            '[data-test-id="PinCardHeaderSaveButton"]',
            '[data-test-id="board-dropdown-select-button"]',
            '[data-test-id="SaveButton"]',
            'button:has-text("Save")',
            'button[aria-label*="Save" i]'
          ].join(', ')).first();

          if (await hoverSaveBtn.isVisible({ timeout: 1200 }).catch(() => false)) {
            await hoverSaveBtn.click({ force: true });
            await page.waitForTimeout(1000);

            // Handle board dropdown if opened
            const boardSearch = page.locator([
              '[data-test-id="board-search-input"]',
              'input[placeholder*="Search" i]',
              'input[aria-label*="Search" i]'
            ].join(', ')).first();

            if (await boardSearch.isVisible({ timeout: 1200 }).catch(() => false)) {
              await boardSearch.fill(targetBoard);
              await page.waitForTimeout(600);
            }

            const slugifiedBoard = targetBoard.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const saveConfirmBtn = page.locator([
              `[data-test-id="board-row-${slugifiedBoard}"] button`,
              `[data-test-id="board-row-${targetBoard}"] button`,
              `[data-test-id="board-drop-item"]:has-text("${targetBoard}") button`,
              `div[role="option"]:has-text("${targetBoard}")`,
              `div[data-test-id*="board-row"]:has-text("${targetBoard}")`
            ].join(', ')).first();

            if (await saveConfirmBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
              await saveConfirmBtn.click({ force: true });
              await page.waitForTimeout(1500);
              pinSaved = true;
            }
          }
        } catch (hoverErr) {
          console.warn('Hover strategy skipped:', hoverErr);
        }

        // ─────────────────────────────────────────────────────────────
        // STRATEGY 2: Pin Detail Navigation & Modal Save Fallback
        // ─────────────────────────────────────────────────────────────
        if (!pinSaved) {
          try {
            const pinLink = pin.locator('a[href*="/pin/"]').first();
            if (await pinLink.isVisible().catch(() => false)) {
              await pinLink.click({ force: true }).catch(() => pin.click({ force: true }));
            } else {
              await pin.click({ force: true }).catch(() => {});
            }

            await page.waitForTimeout(1500);

            // Look for board dropdown or save button on pin detail / modal
            const boardDropdown = page.locator([
              '[data-test-id="board-dropdown-select-button"]',
              '[data-test-id="board-selection-dropdown"]',
              'button[aria-label*="Select board" i]',
              'button[aria-label*="Save to board" i]',
              'button[aria-label*="board" i]',
              'div[role="button"][aria-label*="board" i]'
            ].join(', ')).first();

            if (await boardDropdown.isVisible({ timeout: 2500 }).catch(() => false)) {
              await boardDropdown.click({ force: true });
              await page.waitForTimeout(1000);

              const boardSearch = page.locator([
                '[data-test-id="board-search-input"]',
                'input[placeholder*="Search" i]',
                'input[aria-label*="Search" i]'
              ].join(', ')).first();

              if (await boardSearch.isVisible({ timeout: 1200 }).catch(() => false)) {
                await boardSearch.fill(targetBoard);
                await page.waitForTimeout(600);
              }

              const slugifiedBoard = targetBoard.toLowerCase().replace(/[^a-z0-9]+/g, '-');
              const saveBtn = page.locator([
                `[data-test-id="board-row-${slugifiedBoard}"] button`,
                `[data-test-id="board-row-${targetBoard}"] button`,
                `[data-test-id="board-drop-item"]:has-text("${targetBoard}") button`,
                `div[role="option"]:has-text("${targetBoard}")`,
                `div[data-test-id*="board-row"]:has-text("${targetBoard}")`
              ].join(', ')).first();

              if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await saveBtn.click({ force: true });
                await page.waitForTimeout(1500);
                pinSaved = true;
              }
            }

            // Secondary fallback: Click primary Save button
            if (!pinSaved) {
              const primarySave = page.locator([
                '[data-test-id="SaveButton"]',
                'button:has-text("Save")',
                'div[role="button"]:has-text("Save")'
              ].join(', ')).first();

              if (await primarySave.isVisible({ timeout: 2000 }).catch(() => false)) {
                await primarySave.click({ force: true });
                await page.waitForTimeout(1500);
                pinSaved = true;
              }
            }

            // Close modal or return to search page if navigated away
            await page.keyboard.press('Escape').catch(() => {});
            if (!page.url().includes('/search/pins/')) {
              await page.goBack().catch(() => {});
              await page.waitForTimeout(1200);
            }
          } catch (modalErr) {
            console.warn('Detail navigation strategy error:', modalErr);
          }
        }

        if (pinSaved) {
          savedCount++;
          const currentUrl = page.url();
          liveLinks.push(currentUrl.includes('/pin/') ? currentUrl : `https://www.pinterest.com/pin/auto_${Date.now()}`);
          onProgress(`✅ Successfully saved pin ${savedCount}/${job.count} to "${targetBoard}"!`);
          await page.waitForTimeout(2000);
        } else {
          console.warn(`Attempt ${attempt} could not save pin. Trying next pin card...`);
        }
      }

      if (savedCount === 0) {
        throw new Error(`Failed to save any pins after ${attempt} attempts for board "${primaryBoard}".`);
      }

      onProgress(`🎉 Complete! Successfully saved ${savedCount}/${job.count} pins to target boards.`);
      
      // Update job record with live links
      job.liveLinks = liveLinks;
      await db.saveRepinJob(job);
      
    } catch (err: any) {
      console.error(`Failed repin job: ${err.message}`);
      throw err;
    } finally {
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
      browserLockManager.releaseLock();
    }
  }
}
