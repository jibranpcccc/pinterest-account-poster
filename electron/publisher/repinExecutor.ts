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
      onProgress('Opening browser...');
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
      
      // Parse multi-board list for rotation across target boards
      const boardList = job.boardName
        .split(',')
        .map(b => b.trim())
        .filter(Boolean);
      if (boardList.length === 0) {
        boardList.push('General');
      }

      let finalKeywords = (job.keywords || '').trim();
      const primaryBoardForAi = boardList[0];
      
      // Handle AI Keyword Generation if requested
      if (finalKeywords.startsWith('[AI_AUTO_GENERATE]')) {
        onProgress('Analyzing board name with AI to generate optimal keywords...');
        const aiProvider = new OpenCodeProvider(db);
        try {
          finalKeywords = await aiProvider.generateRepinKeywords(primaryBoardForAi);
        } catch (e) {
          console.warn('AI keyword generation failed, using board name fallback', e);
          finalKeywords = primaryBoardForAi;
        }

        // Fallback / sanitization if AI returned empty, bracketed text, or original tag
        if (!finalKeywords || finalKeywords.includes('[AI_AUTO_GENERATE]')) {
          finalKeywords = primaryBoardForAi;
        }
        // Remove any residual leading/trailing quotes or commas that Pinterest search doesn't like
        finalKeywords = finalKeywords.replace(/['"]/g, '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
        onProgress(`AI selected keywords: "${finalKeywords}"`);
      }

      const searchUrl = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(finalKeywords)}`;
      onProgress(`Searching for: ${finalKeywords}`);
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Resilient pin search grid locator supporting modern Pinterest variations
      const pinSelector = [
        '[data-test-id="pin"]',
        '[data-test-id="pin-card"]',
        'div[data-grid-item="true"]',
        'div[role="listitem"] a[href*="/pin/"]',
        'a[href*="/pin/"]'
      ].join(', ');

      try {
        await page.waitForSelector(pinSelector, { timeout: 10000 });
      } catch {
        await page.waitForTimeout(3000);
      }

      let savedCount = 0;
      let attempt = 0;
      const liveLinks: string[] = [];
      const maxAttempts = job.count * 4;
      
      while (savedCount < job.count && attempt < maxAttempts) {
        attempt++;
        const targetBoard = boardList[savedCount % boardList.length];
        onProgress(`Saving pin ${savedCount + 1}/${job.count} to board "${targetBoard}"...`);
        
        // Find pins on the page using resilient selector
        const pins = await page.locator(pinSelector).all();
        if (pins.length === 0) {
          throw new Error(`No pins found for search keywords: "${finalKeywords}".`);
        }
        
        // Pick pin card with bounds wrapping
        const pinIndex = (attempt - 1) % pins.length;
        const pin = pins[pinIndex];
        await pin.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(800);
        
        const searchPageUrl = page.url();

        // Click anchor link inside pin card or the pin card itself
        const pinLink = pin.locator('a[href*="/pin/"]').first();
        if (await pinLink.isVisible().catch(() => false)) {
          await pinLink.click({ force: true }).catch(() => pin.click({ force: true }));
        } else {
          await pin.click({ force: true }).catch(() => {});
        }
        
        // Wait for pin closeup page navigation or popup save modal
        let navigatedToCloseup = false;
        try {
          await page.waitForURL(url => url.toString().includes('/pin/'), { timeout: 5000 });
          navigatedToCloseup = true;
        } catch {
          const modalVisible = await page.locator([
            '[data-test-id="board-dropdown-select-button"]',
            '[data-test-id="SaveButton"]',
            'button:has-text("Save")'
          ].join(', ')).first().isVisible({ timeout: 2000 }).catch(() => false);
          if (modalVisible) {
            navigatedToCloseup = true;
          }
        }

        if (!navigatedToCloseup) {
          // If navigation didn't happen and search URL didn't change, do not trigger goBack
          if (page.url() !== searchPageUrl && !page.url().includes('/search/pins/')) {
            await page.goBack().catch(() => {});
            await page.waitForTimeout(1500);
          }
          continue;
        }

        // Try to save the pin to the target board
        try {
          let pinSaved = false;

          // 1. Locate board dropdown button
          const boardDropdown = page.locator([
            '[data-test-id="board-dropdown-select-button"]',
            '[data-test-id="board-selection-dropdown"]',
            'button[aria-label*="Select board" i]',
            'button[aria-label*="board" i]',
            'div[role="button"][aria-label*="board" i]'
          ].join(', ')).first();

          if (await boardDropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
            await boardDropdown.click({ force: true });
            await page.waitForTimeout(1200);
            
            // 2. Search for target board in dropdown
            const boardSearch = page.locator([
              '[data-test-id="board-search-input"]',
              'input[placeholder*="Search" i]',
              'input[aria-label*="Search" i]'
            ].join(', ')).first();

            if (await boardSearch.isVisible({ timeout: 1500 }).catch(() => false)) {
              await boardSearch.fill(targetBoard);
              await page.waitForTimeout(800);
            }
            
            // 3. Match board row or save button next to row
            const slugifiedBoard = targetBoard.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const saveBtn = page.locator([
              `[data-test-id="board-row-${slugifiedBoard}"] button`,
              `[data-test-id="board-row-${targetBoard}"] button`,
              `[data-test-id="board-drop-item"]:has-text("${targetBoard}") button`,
              `div[title*="${targetBoard}" i] button`,
              `div[role="option"]:has-text("${targetBoard}")`,
              `div[data-test-id*="board-row"]:has-text("${targetBoard}")`
            ].join(', ')).first();

            if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
              await saveBtn.click({ force: true });
              await page.waitForTimeout(2000);
              pinSaved = true;
            } else {
              // Option row text match fallback
              const optionRow = page.locator(`[role="option"]:has-text("${targetBoard}"), [data-test-id="board-drop-item"]:has-text("${targetBoard}")`).first();
              if (await optionRow.isVisible({ timeout: 1500 }).catch(() => false)) {
                await optionRow.click({ force: true });
                await page.waitForTimeout(2000);
                pinSaved = true;
              } else {
                // Secondary fallback: click first visible save button inside dropdown
                const fallbackSave = page.locator('[data-test-id="board-drop-item"] button, [data-test-id="board-selection-save-button"]').first();
                if (await fallbackSave.isVisible({ timeout: 1500 }).catch(() => false)) {
                  await fallbackSave.click({ force: true });
                  await page.waitForTimeout(2000);
                  pinSaved = true;
                }
              }
            }
          }

          // If dropdown flow was not triggered or didn't complete, try primary Save button
          if (!pinSaved) {
            const primarySave = page.locator([
              '[data-test-id="SaveButton"]',
              'button:has-text("Save")',
              'div[role="button"]:has-text("Save")'
            ].join(', ')).first();

            if (await primarySave.isVisible({ timeout: 2000 }).catch(() => false)) {
              await primarySave.click({ force: true });
              await page.waitForTimeout(2000);
              pinSaved = true;
            }
          }

          if (pinSaved) {
            savedCount++;
            liveLinks.push(page.url());
          } else {
            console.warn(`Could not save pin to board "${targetBoard}" on closeup.`);
          }
        } catch (e: any) {
          console.warn('Failed to save pin on closeup', e);
        }
        
        // Return to search results if URL moved
        if (page.url() !== searchPageUrl) {
          await page.goBack().catch(() => {});
          await page.waitForTimeout(1500);
        }
      }
      
      onProgress(`Successfully saved ${savedCount}/${job.count} pins.`);
      
      // Update job with live links
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
