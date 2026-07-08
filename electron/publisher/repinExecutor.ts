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
      args: ['--start-maximized', '--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-gpu']
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
      
      let finalKeywords = job.keywords;
      
      // Handle AI Keyword Generation if requested
      if (finalKeywords.startsWith('[AI_AUTO_GENERATE]')) {
        onProgress('Analyzing board name with AI to generate optimal keywords...');
        const aiProvider = new OpenCodeProvider(db);
        finalKeywords = await aiProvider.generateRepinKeywords(job.boardName);
        onProgress(`AI selected keywords: "${finalKeywords}"`);
      }

      const searchUrl = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(finalKeywords)}`;
      onProgress(`Searching for: ${finalKeywords}`);
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
      
      let savedCount = 0;
      let attempt = 0;
      
      while (savedCount < job.count && attempt < job.count * 3) {
        attempt++;
        onProgress(`Saving pin ${savedCount + 1}/${job.count}...`);
        
        // Find pins on the page
        const pins = await page.locator('[data-test-id="pin"]').all();
        if (pins.length === 0) {
          throw new Error('No pins found for these keywords.');
        }
        
        // Pick a pin that we haven't interacted with
        const pin = pins[Math.min(attempt - 1, pins.length - 1)];
        await pin.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);
        
        // Click the pin to open it
        await pin.click();
        await page.waitForTimeout(3000);
        
        // Ensure we are on the pin closeup page
        if (!page.url().includes('/pin/')) {
          await page.goBack();
          await page.waitForTimeout(2000);
          continue;
        }

        // Try to save the pin to the specific board
        try {
          // 1. Click board dropdown
          const boardDropdown = page.locator('[data-test-id="board-dropdown-select-button"]');
          if (await boardDropdown.isVisible()) {
            await boardDropdown.click();
            await page.waitForTimeout(1500);
            
            // 2. Search for board
            const boardSearch = page.locator('[data-test-id="board-search-input"]');
            if (await boardSearch.isVisible()) {
              await boardSearch.fill(job.boardName);
              await page.waitForTimeout(1000);
            }
            
            // 3. Click Save next to the board
            const saveBtn = page.locator(`[data-test-id="board-row-${job.boardName}"] button`).first();
            if (await saveBtn.isVisible()) {
              await saveBtn.click();
              await page.waitForTimeout(2000);
              savedCount++;
            } else {
              throw new Error(`Board "${job.boardName}" not found in dropdown.`);
            }
          } else {
            // Alternatively, it might just have a primary Save button if it remembers the last board
            const primarySave = page.locator('[data-test-id="SaveButton"]');
            if (await primarySave.isVisible()) {
              await primarySave.click();
              savedCount++;
              await page.waitForTimeout(2000);
            }
          }
        } catch (e: any) {
          console.warn('Failed to save pin on closeup', e);
        }
        
        // Go back to search results
        await page.goBack();
        await page.waitForTimeout(3000);
      }
      
      onProgress(`Successfully saved ${savedCount}/${job.count} pins.`);
      
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
