import { chromium, BrowserContext, Page } from 'playwright-core';
import * as path from 'path';
import * as fs from 'fs';
import { FingerprintManager, generateInjectionScript } from './fingerprintManager';
import { getChromiumExecutablePath } from './chromiumPath';

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
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-gpu']
    };

    let context: BrowserContext | null = null;
    let page: Page | null = null;
    
    try {
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
          const match = text.match(/([\d,km]+)\s*followers/i);
          if (match) result.followers = match[1];
        } else {
          // Alternative fallback
          const allText = await page.content();
          const fallbackMatch = allText.match(/([\d,km]+)\s*followers/i);
          if (fallbackMatch) result.followers = fallbackMatch[1];
        }
      } catch (e) {
        console.warn('Failed to scrape followers', e);
      }
      
      // Attempt to scrape monthly views
      try {
        const viewsLoc = page.locator('div:text-matches("\\\\d+ monthly views", "i")').first();
        if (await viewsLoc.isVisible().catch(() => false)) {
          const text = await viewsLoc.innerText();
          const match = text.match(/([\d,km]+)\s*monthly views/i);
          if (match) result.monthlyViews = match[1];
        } else {
          const allText = await page.content();
          const fallbackMatch = allText.match(/([\d,km]+)\s*monthly views/i);
          if (fallbackMatch) result.monthlyViews = fallbackMatch[1];
        }
      } catch (e) {
        console.warn('Failed to scrape monthly views', e);
      }
      
      // Step 2: Attempt Business Analytics (Optional)
      try {
        await page.goto('https://www.pinterest.com/business/hub/', { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(4000);
        
        if (!page.url().includes('/login')) {
          const scrapeMetric = async (label: string) => {
            const loc = page.locator(`text="${label}"`).first();
            if (await loc.isVisible().catch(() => false)) {
              // Get innerText of parent tree and regex for numbers
              const allText = await page.content();
              // This is a naive heuristic since Pinterest DOM is complex
              const regex = new RegExp(`>([\\d,\\.kKmM]+)<.*?${label}`, 'i');
              const match = allText.match(regex);
              if (match) return match[1];
            }
            return 'N/A';
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
    }
  }
}
