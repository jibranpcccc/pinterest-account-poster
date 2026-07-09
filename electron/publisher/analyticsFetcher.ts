import { chromium, BrowserContext, Page } from 'playwright-core';
import * as path from 'path';
import * as fs from 'fs';
import { FingerprintManager, generateInjectionScript } from './fingerprintManager';
import { getChromiumExecutablePath } from './chromiumPath';
import { browserLockManager } from './browserLockManager';

export interface AnalyticsResult {
  accountId: string;
  followers: string;
  monthlyViews: string;
  impressions?: string;
  engagements?: string;
  outboundClicks?: string;
  saves?: string;
  timestamp: string;
}

export class AnalyticsFetcher {
  public async fetchAnalytics(accountId: string, profilePath: string): Promise<AnalyticsResult> {
    const fingerprint = FingerprintManager.getOrCreate(profilePath);
    const fpLaunchOpts = FingerprintManager.toLaunchOptions(fingerprint);
    
    const launchOptions: any = {
      headless: false, // Must be false per AGENTS.md rules to prevent silent crash
      ...fpLaunchOpts,
      executablePath: getChromiumExecutablePath(),
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-gpu', '--window-position=-32000,-32000']
    };

    let context: BrowserContext | null = null;
    let page: Page | null = null;
    
    try {
      browserLockManager.acquireLock(accountId, 'Fetch Analytics');
      context = await chromium.launchPersistentContext(profilePath, launchOptions);
      const injectionScript = generateInjectionScript(fingerprint);
      await context.addInitScript(injectionScript);
      
      page = await context.newPage();
      
      // Step 1: Get Followers and Monthly Views from profile
      await page.goto('https://www.pinterest.com/me/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000); // Wait for redirect and render
      
      const currentUrl = page.url();
      if (currentUrl.includes('/login')) {
        throw new Error('Not logged in.');
      }
      
      const result: AnalyticsResult = {
        accountId,
        followers: '0',
        monthlyViews: '0',
        timestamp: new Date().toISOString()
      };
      
      // Attempt to scrape followers
      try {
        const followersLoc = page.locator('div:text-matches("\\\\d+ followers", "i")').first();
        if (await followersLoc.isVisible().catch(() => false)) {
          const text = await followersLoc.innerText();
          const match = text.match(/([\d,\.]+[kKmM]?)/);
          if (match) result.followers = match[1];
        }
      } catch (e) {}
      
      // Attempt to scrape monthly views
      try {
        const viewsLoc = page.locator('div:text-matches("\\\\d+ monthly views", "i")').first();
        if (await viewsLoc.isVisible().catch(() => false)) {
          const text = await viewsLoc.innerText();
          const match = text.match(/([\d,\.]+[kKmM]?)/);
          if (match) result.monthlyViews = match[1];
        }
      } catch (e) {}
      
      // Step 2: Try to get Business Hub metrics if available
      try {
        await page.goto('https://www.pinterest.com/business/hub/', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(3000);
        
        if (!page.url().includes('/login')) {
          const scrapeMetric = async (label: string) => {
            try {
              // Locate the box containing the label, then get the big number inside it
              const loc = page.locator(`div:has-text("${label}")`).locator('div[title]').first();
              if (await loc.isVisible().catch(() => false)) {
                return await loc.innerText();
              }
            } catch (e) {}
            return undefined;
          };
          
          result.impressions = await scrapeMetric('Impressions');
          result.engagements = await scrapeMetric('Engagements');
          result.outboundClicks = await scrapeMetric('Outbound clicks');
          result.saves = await scrapeMetric('Saves');
        }
      } catch (e) {
        console.warn('Failed to scrape business hub', e);
      }
      
      return result;
    } catch (err: any) {
      console.error(`Failed to fetch analytics: ${err.message}`);
      throw err;
    } finally {
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
      browserLockManager.releaseLock();
    }
  }
}
