import { chromium, BrowserContext } from 'playwright';
import { getChromiumExecutablePath } from './chromiumPath';
import * as fs from 'fs';
import * as path from 'path';
import { Account, Board } from '../types';
import { DbManager } from '../database/db';
import { FingerprintManager, generateInjectionScript } from './fingerprintManager';
import { browserLockManager } from './browserLockManager';

export class BoardResolver {
  private db: DbManager;

  constructor(db: DbManager) {
    this.db = db;
  }

  /**
   * Navigates to Pinterest, extracts boards, and saves them to the database.
   */
  public async fetchBoards(account: Account): Promise<Board[]> {
    const profileDir = account.profilePath;
    if (!fs.existsSync(profileDir)) {
      throw new Error(`Profile path does not exist for: ${account.nickname}`);
    }

    await this.db.addLog('info', `Starting automated board retrieval for: ${account.nickname}`, { accountId: account.id });

    // Load fingerprint for consistent device identity
    const fingerprint = FingerprintManager.getOrCreate(profileDir);
    const fpOpts = FingerprintManager.toLaunchOptions(fingerprint);
    console.log(`[Fingerprint] Board scraper using: ${FingerprintManager.getSummary(fingerprint)}`);

    const launchOptions: any = {
      headless: true, // Run headlessly for background scraping
      userAgent: fpOpts.userAgent,
      locale: fpOpts.locale,
      timezoneId: fpOpts.timezoneId,
      executablePath: getChromiumExecutablePath(),
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-gpu']
    };

    let context: BrowserContext | null = null;
    try {
      browserLockManager.acquireLock(account.id, 'Fetch Boards');
      console.log(`Launching board resolver with bundled Chromium...`);
      context = await chromium.launchPersistentContext(profileDir, launchOptions);
      
      // Inject fingerprint overrides
      const injectionScript = generateInjectionScript(fingerprint);
      await context.addInitScript(injectionScript);
    } catch (err: any) {
      console.error(`Failed to launch board resolver with bundled Chromium: ${err.message}`);
      await this.db.addLog('error', `Failed to launch board scraper browser: ${err.message}`, { accountId: account.id });
      browserLockManager.releaseLock();
      throw err;
    }

    try {
      const page = await context!.newPage();

      // Go to Pinterest Settings directly (only accessible when logged in)
      await page.goto('https://www.pinterest.com/settings/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);

      // Verify login — if redirected completely off Pinterest, the session is invalid
      const settingsUrl = page.url();
      console.log(`Settings page URL loaded: ${settingsUrl}`);
      
      if (!settingsUrl.includes('pinterest.com')) {
        throw new Error('Account session has expired or is not authenticated. Please go to the Accounts tab and click "Connect Account (Login)" to sign in again.');
      }

      // Settings URL is usually https://www.pinterest.com/settings/profile/ or similar
      // Let's get username from the profile button or setting inputs
      let username: string | null = null;

      // Try reading from the setting input if present
      try {
        const usernameInput = await page.locator('input[name="username"]').first();
        if (await usernameInput.isVisible()) {
          username = await usernameInput.inputValue();
        }
      } catch (e) {}

      // Fallback: Try reading from URL or navigation selectors
      if (!username) {
        // Find profile button link
        try {
          const profileLink = await page.locator('a[href^="/"]').evaluateAll((links) => {
            // Find links that might be profile links
            for (const link of links) {
              const href = link.getAttribute('href');
              if (href && href !== '/' && href !== '/homefeed/' && !href.startsWith('/settings') && !href.startsWith('/business') && !href.startsWith('/pin/')) {
                // If it's a simple path like /username/, return it
                const parts = href.split('/').filter(Boolean);
                if (parts.length === 1) {
                  return parts[0];
                }
              }
            }
            return null;
          });
          username = profileLink;
        } catch (e) {}
      }

      if (!username) {
        // Last fallback: try parsing from cookie or user profile button text
        await page.goto('https://www.pinterest.com/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
        // Find profile button in header
        try {
          const profileBtn = await page.locator('[data-test-id="header-profile-button"] a').first();
          if (await profileBtn.isVisible()) {
            const href = await profileBtn.getAttribute('href');
            if (href) {
              username = href.split('/').filter(Boolean)[0];
            }
          }
        } catch (e) {}
      }

      if (!username) {
        throw new Error('Could not resolve Pinterest username from profile settings or header.');
      }

      console.log(`👤 Found Pinterest username: ${username}`);
      await this.db.addLog('info', `Found username '${username}' for '${account.nickname}'. Fetching boards...`, { accountId: account.id });

      // Navigate to saved pins/boards page (usually https://www.pinterest.com/username/_saved/)
      await page.goto(`https://www.pinterest.com/${username}/_saved/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(5000);

      // Aggressive dynamic scroll down to load ALL boards
      let previousHeight = 0;
      let currentHeight = await page.evaluate('document.body.scrollHeight') as number;
      let scrollAttempts = 0;

      while (previousHeight !== currentHeight && scrollAttempts < 15) {
        previousHeight = currentHeight;
        await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
        await page.waitForTimeout(2000);
        currentHeight = await page.evaluate('document.body.scrollHeight') as number;
        scrollAttempts++;
      }

      // Extract boards links
      // Boards links look like /username/board-name/
      const boardsData = await page.evaluate((uname) => {
        const list: { name: string; url: string }[] = [];
        const links = document.querySelectorAll('a[href^="/"]');
        const seenUrls = new Set<string>();

        links.forEach((link) => {
          const href = link.getAttribute('href');
          if (!href) return;
          
          // Match /username/board-name/ or similar, but ignore subpaths like /username/_saved/
          const cleanHref = href.split('?')[0];
          const parts = cleanHref.split('/').filter(Boolean);
          
          if (parts.length === 2 && parts[0].toLowerCase() === uname.toLowerCase()) {
            const boardName = parts[1];
            if (boardName === '_saved' || boardName === '_created' || boardName === 'settings' || boardName === 'pins') {
              return;
            }

            const fullUrl = `https://www.pinterest.com${cleanHref}`;
            if (!seenUrls.has(fullUrl)) {
              seenUrls.add(fullUrl);
              
              // Get board title
              let boardTitle = '';
              // Try to find board title text inside card
              const titleEl = link.querySelector('[title], h2, div[style*="font-weight"]');
              if (titleEl) {
                boardTitle = titleEl.getAttribute('title') || titleEl.textContent || '';
              }
              if (!boardTitle) {
                // Try siblings or textContent
                boardTitle = link.textContent || '';
              }
              
              // Clean up title
              boardTitle = boardTitle.trim().replace(/\s+/g, ' ');
              if (!boardTitle) {
                // Format from URL slug
                boardTitle = boardName.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
              }

              list.push({
                name: boardTitle,
                url: fullUrl
              });
            }
          }
        });
        return list;
      }, username);

      console.log(`📋 Found ${boardsData.length} boards on page:`, boardsData);

      const savedBoards: Board[] = [];
      const now = new Date().toISOString();

      for (const b of boardsData) {
        // Generate a deterministic board ID
        const boardId = Buffer.from(`${account.id}:${b.url}`).toString('base64').replace(/=/g, '');
        const board = await this.db.saveBoard({
          id: boardId,
          accountId: account.id,
          name: b.name,
          url: b.url,
          lastFetchedAt: now
        });
        savedBoards.push(board);
      }

      await this.db.addLog('info', `Successfully fetched and saved ${savedBoards.length} boards for '${account.nickname}'.`, { accountId: account.id });
      return savedBoards;
    } catch (e: any) {
      console.error('Failed to fetch boards automatically:', e);
      await this.db.addLog('warn', `Automatic board retrieval failed: ${e.message}. You can still add boards manually in the Boards tab.`, { accountId: account.id });
      throw e;
    } finally {
      if (context) {
        await context.close().catch(() => {});
      }
      browserLockManager.releaseLock();
    }
  }
}
