import { chromium, BrowserContext } from 'playwright';
import { getChromiumExecutablePath } from './chromiumPath';
import * as path from 'path';
import * as fs from 'fs';
import { Account } from '../types';
import { DbManager } from '../database/db';
import { FingerprintManager, generateInjectionScript } from './fingerprintManager';

export class PinterestSessionAdapter {
  private db: DbManager;
  private activeContexts: Map<string, BrowserContext> = new Map();

  constructor(db: DbManager) {
    this.db = db;
  }

  /**
   * Opens a visible Chromium window for manual user login.
   * Resolves when the browser is closed by the user.
   */
  public async openLoginSession(account: Account, onBrowserStatusChange?: (status: { accountId: string; isOpen: boolean; message: string }) => void): Promise<boolean> {
    const profileDir = account.profilePath;
    
    // Ensure the profile directory exists
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    await this.db.addLog('info', `Opening manual login browser window for account: ${account.nickname}`, { accountId: account.id });

    // Load or create fingerprint for this account
    const fingerprint = FingerprintManager.getOrCreate(profileDir);
    const fpLaunchOpts = FingerprintManager.toLaunchOptions(fingerprint);
    console.log(`[Fingerprint] Login session using: ${FingerprintManager.getSummary(fingerprint)}`);

    const launchOptions: any = {
      headless: false,
      ...fpLaunchOpts,
      executablePath: getChromiumExecutablePath(),
      args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
    };

    try {
      // Notify UI that browser is now open
      if (onBrowserStatusChange) {
        onBrowserStatusChange({ accountId: account.id, isOpen: true, message: 'Browser window is open. Please log in to Pinterest, then close this window.' });
      }

      const context = await chromium.launchPersistentContext(profileDir, launchOptions);
      this.activeContexts.set(account.id, context);

      // Inject fingerprint overrides
      const injectionScript = generateInjectionScript(fingerprint);
      await context.addInitScript(injectionScript);

      const page = context.pages()[0] || await context.newPage();
      await page.goto('https://www.pinterest.com/login/');

      // Wait for browser close — DO NOT call onBrowserStatusChange(isOpen:false)
      // until AFTER verifySession completes and DB is updated.
      // This prevents App.tsx fetchAccounts() from reading stale data.
      return new Promise<boolean>((resolve) => {
        context.on('close', async () => {
          this.activeContexts.delete(account.id);

          // Notify UI: verifying in progress (browser still "open" from UI perspective)
          if (onBrowserStatusChange) {
            onBrowserStatusChange({ accountId: account.id, isOpen: true, message: '🔄 Browser closed. Verifying Pinterest session...' });
          }

          console.log(`🔒 Login browser closed for ${account.nickname}. Waiting 6s for Chromium to release profile lock...`);
          // Wait longer to ensure Chromium fully releases the profile directory lock
          await new Promise(r => setTimeout(r, 6000));

          console.log(`🔒 Verifying session for ${account.nickname}...`);
          const isConnected = await this.verifySession(account);
          
          // Retrieve the updated account details from DB (including the scraped username/avatarUrl)
          const updatedAccounts = await this.db.getAccounts();
          const dbAccount = updatedAccounts.find(a => a.id === account.id) || account;

          // Double-save here with lastUsedAt update for consistency.
          await this.db.saveAccount({
            ...dbAccount,
            sessionStatus: isConnected ? 'connected' : 'disconnected',
            lastUsedAt: new Date().toISOString()
          });

          await this.db.addLog(
            isConnected ? 'info' : 'warn',
            isConnected 
              ? `✅ Manual login verified. Account '${account.nickname}' is now connected.`
              : `⚠️ Manual login verification failed. Account '${account.nickname}' is not logged in. Please try again.`,
            { accountId: account.id }
          );

          // NOW notify UI with isOpen:false — DB is fully updated at this point.
          // App.tsx will call fetchAccounts() AFTER this, reading the correct status.
          if (onBrowserStatusChange) {
            onBrowserStatusChange({ 
              accountId: account.id, 
              isOpen: false, 
              message: isConnected 
                ? '✅ Session verified! Account is now Connected.' 
                : '⚠️ Not logged in. Please click "Connect Account" again and complete the Pinterest login.' 
            });
          }

          resolve(isConnected);
        });
      });
    } catch (e: any) {
      console.error('Failed to open login browser:', e);
      await this.db.addLog('error', `Failed to open browser for ${account.nickname}: ${e.message}`, { accountId: account.id });
      if (onBrowserStatusChange) {
        onBrowserStatusChange({ accountId: account.id, isOpen: false, message: `Failed to open: ${e.message}` });
      }
      return false;
    }
  }

  private async scrapeProfileInfo(page: any, nickname: string): Promise<{ username: string | null; avatarUrl: string | null }> {
    let username: string | null = null;
    let avatarUrl: string | null = null;
    try {
      // 1. Scrape username from header profile button link
      const profileLinkLocator = page.locator('a[data-test-id="header-profile-button"], [data-test-id="header-profile-button"] a, a[aria-label*="profile" i], a[aria-label*="Profile" i], a[href*="/settings" i]').first();
      if (await profileLinkLocator.isVisible()) {
        const href = await profileLinkLocator.getAttribute('href');
        if (href) {
          const cleanedHref = href.split('/').filter(Boolean);
          if (cleanedHref.length > 0 && !cleanedHref[0].startsWith('settings')) {
            // Pinterest handles are always the first path segment (e.g. /username/)
            username = cleanedHref[0];
          }
        }
      }

      // Check current URL for username fallback (e.g. if navigated to settings or profile page)
      if (!username) {
        const currentUrl = page.url();
        if (currentUrl.includes('pinterest.com/')) {
          const pathSegments = new URL(currentUrl).pathname.split('/').filter(Boolean);
          if (pathSegments.length === 1 && pathSegments[0] !== 'settings' && pathSegments[0] !== 'homefeed') {
            username = pathSegments[0];
          }
        }
      }

      // 2. Scrape avatar picture using username-based or header profile locators
      const avatarSelectors = [
        username ? `a[href*="/${username}/"] img` : '',
        username ? `a[href="/${username}/"] img` : '',
        '[data-test-id="header-profile-button"] img',
        '[data-test-id="header-profile"] img',
        'a[aria-label*="profile" i] img',
        'a[aria-label*="Profile" i] img'
      ].filter(Boolean);

      for (const selector of avatarSelectors) {
        try {
          const imgLocator = page.locator(selector).first();
          if (await imgLocator.isVisible()) {
            const src = await imgLocator.getAttribute('src');
            if (src && (src.startsWith('http') || src.startsWith('data:'))) {
              avatarUrl = src;
              break;
            }
          }
        } catch (e) {}
      }
      
      console.log(`[Scraper] Scraped details for ${nickname}: username='${username}', avatarUrl='${avatarUrl}'`);
    } catch (scrapeErr: any) {
      console.warn(`[Scraper] Failed to scrape profile info for ${nickname}: ${scrapeErr.message}`);
    }
    return { username, avatarUrl };
  }

  /**
   * Verifies if the session is logged in by navigating to /settings/account/ in a headless browser.
   * Pinterest ALWAYS redirects logged-out users away from /settings/account/.
   * Logged-in users stay on /settings/account/ or /settings/.
   */
  public async verifySession(account: Account): Promise<boolean> {
    await this.closeLoginSession(account.id);
    const profileDir = account.profilePath;
    if (!fs.existsSync(profileDir)) {
      return false;
    }

    // Apply the same fingerprint as the login browser to avoid bot detection
    const fingerprint = FingerprintManager.getOrCreate(profileDir);
    const fpLaunchOpts = FingerprintManager.toLaunchOptions(fingerprint);

    const launchOptions: any = {
      headless: true,
      ...fpLaunchOpts,
      executablePath: getChromiumExecutablePath(),
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
    };

    let context: BrowserContext | null = null;
    let retries = 4;
    while (retries > 0) {
      try {
        context = await chromium.launchPersistentContext(profileDir, launchOptions);
        this.activeContexts.set(account.id, context);
        // Inject fingerprint overrides to match the login session
        const injectionScript = generateInjectionScript(fingerprint);
        await context.addInitScript(injectionScript);
        break;
      } catch (err: any) {
        console.warn(`VerifySession launch attempt failed: ${err.message}. Retrying in 2s... (${retries - 1} left)`);
        retries--;
        if (retries === 0) {
          await this.db.addLog('error', `Failed to launch verification browser after all retries: ${err.message}`, { accountId: account.id });
          return false;
        }
        // Longer wait on first retry — Chromium profile lock can take a few seconds to release
        await new Promise(r => setTimeout(r, retries === 3 ? 3000 : 2000));
      }
    }

    try {
      const page = await context!.newPage();
      
      // /settings/account/ is ONLY accessible to logged-in users.
      // Logged-out users are hard-redirected to the landing page or /login/.
      await page.goto('https://www.pinterest.com/', { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });
      
      // Wait for any client-side redirects to settle
      await page.waitForTimeout(4000);

      const currentUrl = page.url();
      console.log(`🔍 Verification URL for '${account.nickname}': ${currentUrl}`);
      await this.db.addLog('info', `Session verification reached URL: ${currentUrl}`, { accountId: account.id });

      // Look for DOM elements to confirm login state
      let isLoggedIn = false;
      
      // Check for elements that only exist when logged OUT
      const isLoggedOut = await page.locator('[data-test-id="login-button"], div:has-text("Log in"), button:has-text("Log in")').first().isVisible().catch(() => false);
      
      // Check for elements that only exist when logged IN
      const hasProfileMenu = await page.locator('[data-test-id="header-profile"], [data-test-id="header-account-menu"], [aria-label="Accounts and more options"]').first().isVisible().catch(() => false);

      if (hasProfileMenu) {
        isLoggedIn = true;
      } else if (isLoggedOut) {
        isLoggedIn = false;
      } else {
        // Fallback to URL checking if DOM elements aren't found
        isLoggedIn = (
          currentUrl.includes('/homefeed') ||
          currentUrl.includes('/ideas') ||
          currentUrl.includes('/today') ||
          currentUrl.includes('/business') ||
          currentUrl.includes('/pin-creation') ||
          currentUrl.includes('/settings')
        ) && !currentUrl.includes('/login') && !currentUrl.includes('/auth/');
      }

      console.log(`🔍 Session for '${account.nickname}': ${isLoggedIn ? 'CONNECTED ✅' : 'DISCONNECTED ❌'}`);
      
      let username = account.username || null;
      let avatarUrl = account.avatarUrl || null;
      if (isLoggedIn) {
        const profile = await this.scrapeProfileInfo(page, account.nickname);
        if (profile.username) username = profile.username;
        if (profile.avatarUrl) avatarUrl = profile.avatarUrl;
      }

      // Update account status in DB
      await this.db.saveAccount({
        ...account,
        sessionStatus: isLoggedIn ? 'connected' : 'disconnected',
        lastUsedAt: new Date().toISOString(),
        username,
        avatarUrl
      });

      return isLoggedIn;
    } catch (e: any) {
      console.error('Session verification check failed:', e);
      await this.db.addLog('error', `Session verification failed: ${e.message}`, { accountId: account.id });
      return false;
    } finally {
      if (context) {
        await context.close().catch(() => {});
        this.activeContexts.delete(account.id);
      }
    }
  }

  /**
   * Performs automatic login for an account if email and password are provided.
   */
  public async autoLoginAccount(account: Account): Promise<boolean> {
    await this.closeLoginSession(account.id);
    const email = account.email || (account.nickname.includes('@') ? account.nickname : '');
    const password = account.password;
    if (!email || !password) {
      console.log(`[AutoLogin] Account ${account.nickname} does not have saved email/password. Skipping.`);
      return false;
    }

    console.log(`[AutoLogin] Starting background auto-login for: ${account.nickname} (${email})`);
    await this.db.addLog('info', `Attempting background auto-login for: ${email}`, { accountId: account.id });

    const profileDir = account.profilePath;
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    const fingerprint = FingerprintManager.getOrCreate(profileDir);
    const fpLaunchOpts = FingerprintManager.toLaunchOptions(fingerprint);

    const launchOptions: any = {
      headless: true,
      ...fpLaunchOpts,
      executablePath: getChromiumExecutablePath(),
      args: ['--disable-blink-features=AutomationControlled'],
    };

    let context: BrowserContext | null = null;
    try {
      context = await chromium.launchPersistentContext(profileDir, launchOptions);
      this.activeContexts.set(account.id, context);
      const injectionScript = generateInjectionScript(fingerprint);
      await context.addInitScript(injectionScript);

      const page = context.pages()[0] || await context.newPage();
      
      // Navigate to login page
      await page.goto('https://www.pinterest.com/login/', { waitUntil: 'domcontentloaded', timeout: 35000 });
      await new Promise(r => setTimeout(r, 2500));

      // Fill email
      const emailSelectors = ['input[type="email"]', 'input#email', 'input[name="id"]', 'input#email-address'];
      let emailFilled = false;
      for (const sel of emailSelectors) {
        if (await page.locator(sel).first().isVisible().catch(() => false)) {
          await page.locator(sel).first().click();
          await page.keyboard.press('Control+A');
          await page.keyboard.press('Backspace');
          await page.locator(sel).first().fill(email);
          emailFilled = true;
          break;
        }
      }

      if (!emailFilled) {
        throw new Error('Email input field not found on Pinterest login page.');
      }

      // Fill password
      const passSelectors = ['input[type="password"]', 'input#password', 'input[name="password"]'];
      let passFilled = false;
      for (const sel of passSelectors) {
        if (await page.locator(sel).first().isVisible().catch(() => false)) {
          await page.locator(sel).first().click();
          await page.keyboard.press('Control+A');
          await page.keyboard.press('Backspace');
          await page.locator(sel).first().fill(password);
          passFilled = true;
          break;
        }
      }

      if (!passFilled) {
        throw new Error('Password input field not found on Pinterest login page.');
      }

      // Click login button
      const loginBtnSelectors = ['button[type="submit"]', 'button:has-text("Log in")', 'button:has-text("Log In")', 'div[role="button"]:has-text("Log in")'];
      let loginClicked = false;
      for (const sel of loginBtnSelectors) {
        if (await page.locator(sel).first().isVisible().catch(() => false)) {
          await page.locator(sel).first().click();
          loginClicked = true;
          break;
        }
      }

      if (!loginClicked) {
        throw new Error('Login button not found on Pinterest login page.');
      }

      // Wait for login completion
      await new Promise(r => setTimeout(r, 8000));
      
      // Navigate to homepage to verify (most reliable auth check)
      await page.goto('https://www.pinterest.com/', { waitUntil: 'domcontentloaded', timeout: 25000 });
      await new Promise(r => setTimeout(r, 3000));

      const currentUrl = page.url();
      let isLoggedIn = false;
      const hasProfileMenu = await page.locator('[data-test-id="header-profile"], [data-test-id="header-account-menu"], [aria-label="Accounts and more options"]').first().isVisible().catch(() => false);
      const isLoggedOut = await page.locator('[data-test-id="login-button"], div:has-text("Log in"), button:has-text("Log in")').first().isVisible().catch(() => false);
      
      if (hasProfileMenu) {
        isLoggedIn = true;
      } else if (isLoggedOut) {
        isLoggedIn = false;
      } else {
        isLoggedIn = (
          currentUrl.includes('/homefeed') ||
          currentUrl.includes('/ideas') ||
          currentUrl.includes('/today') ||
          currentUrl.includes('/business') ||
          currentUrl.includes('/pin-creation') ||
          currentUrl.includes('/settings')
        ) && !currentUrl.includes('/login') && !currentUrl.includes('/auth/');
      }
      
      let username = account.username || null;
      let avatarUrl = account.avatarUrl || null;
      if (isLoggedIn) {
        const profile = await this.scrapeProfileInfo(page, account.nickname);
        if (profile.username) username = profile.username;
        if (profile.avatarUrl) avatarUrl = profile.avatarUrl;
      }

      await this.db.saveAccount({
        ...account,
        sessionStatus: isLoggedIn ? 'connected' : 'disconnected',
        lastUsedAt: new Date().toISOString(),
        username,
        avatarUrl
      });

      if (isLoggedIn) {
        await this.db.addLog('info', `✅ Background auto-login succeeded for account: ${account.nickname}`, { accountId: account.id });
        console.log(`[AutoLogin] Succeeded for ${account.nickname}`);
        return true;
      } else {
        await this.db.addLog('warn', `⚠️ Background auto-login failed: redirected to ${currentUrl}`, { accountId: account.id });
        console.log(`[AutoLogin] Failed for ${account.nickname}: ended up at ${currentUrl}`);
        return false;
      }
    } catch (err: any) {
      console.error(`[AutoLogin] Error for ${account.nickname}:`, err);
      await this.db.addLog('error', `Background auto-login failed: ${err.message}`, { accountId: account.id });
      return false;
    } finally {
      if (context) {
        await context.close().catch(() => {});
        this.activeContexts.delete(account.id);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  public getActiveContext(accountId: string): BrowserContext | undefined {
    return this.activeContexts.get(accountId);
  }

  public async closeLoginSession(accountId: string): Promise<void> {
    const context = this.activeContexts.get(accountId);
    if (context) {
      console.log(`[SessionAdapter] Closing active browser for account: ${accountId}`);
      await context.close().catch(() => {});
      this.activeContexts.delete(accountId);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}
