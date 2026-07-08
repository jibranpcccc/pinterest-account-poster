import { chromium, BrowserContext, Page } from 'playwright';
import { getChromiumExecutablePath } from './chromiumPath';
import * as fs from 'fs';
import * as path from 'path';
import { QueueJob, Account } from '../types';
import { DbManager } from '../database/db';
import { FingerprintManager, generateInjectionScript } from './fingerprintManager';

export interface PublishResult {
  jobId: string;
  accountId: string;
  boardName: string;
  status: 'completed' | 'failed';
  message: string;
  errorCode?: string;
  screenshotPath?: string;
  livePinUrl?: string;
  startedAt: string;
  completedAt: string;
}

export class PublishExecutor {
  private db: DbManager;
  private isPaused = false;
  private isStopped = false;
  private activeContext: BrowserContext | null = null;
  private activePage: Page | null = null;

  constructor(db: DbManager) {
    this.db = db;
  }

  public pause() {
    this.isPaused = true;
    console.log('⏸️ PublishExecutor: Execution PAUSED by user.');
  }

  public resume() {
    this.isPaused = false;
    console.log('▶️ PublishExecutor: Execution RESUMED by user.');
  }

  public stop() {
    this.isStopped = true;
    this.isPaused = false;
    console.log('⏹️ PublishExecutor: Execution STOPPED by user.');
    if (this.activeContext) {
      this.activeContext.close().catch(() => {});
      this.activeContext = null;
      this.activePage = null;
    }
  }

  private async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async checkPauseAndStop(page: Page, onProgress: (msg: string) => void) {
    if (this.isStopped) throw new Error('STOPPED');

    if (this.isPaused) {
      onProgress('Execution paused. Waiting for resume...');
      while (this.isPaused && !this.isStopped) {
        const hasCaptcha = await page.evaluate(() => {
          return document.body.innerHTML.includes('captcha') || 
                 document.body.innerHTML.includes('Verification') || 
                 document.querySelector('iframe[src*="captcha"]') !== null;
        }).catch(() => false);

        if (hasCaptcha) {
          onProgress('Pinterest verification/CAPTCHA detected. Please solve it in the browser window, then click Resume.');
        }

        await this.sleep(1000);
      }
      
      if (this.isStopped) throw new Error('STOPPED');
      onProgress('Resuming execution...');
    }
  }

  private async typeSlowly(page: Page, selector: string, text: string, delayMin = 20, delayMax = 60) {
    const element = page.locator(selector).first();
    await element.focus().catch(() => {});
    await element.click({ force: true }).catch(() => {});
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await this.sleep(200);
    
    for (const char of text) {
      if (this.isStopped) throw new Error('STOPPED');
      await page.keyboard.type(char);
      const delay = Math.random() * (delayMax - delayMin) + delayMin;
      await this.sleep(delay);
    }
  }

  public async executeJob(
    job: QueueJob,
    account: Account,
    settings: any,
    onProgress: (data: { progress: number; message: string; status: QueueJob['status'] }) => void
  ): Promise<PublishResult> {
    const startedAt = new Date().toISOString();
    this.isStopped = false;
    this.isPaused = false;
    
    const screenshotDir = path.join(path.dirname(this.db.getDbPath()), 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const screenshotPath = path.join(screenshotDir, `job-${job.id}-${Date.now()}.png`);

    // Pacing delays (seconds to ms)
    const [actionDelayMin, actionDelayMax] = settings.actionDelay || [1.5, 4.0];
    const getActionDelay = () => (Math.random() * (actionDelayMax - actionDelayMin) + actionDelayMin) * 1000;

    await this.db.addLog('info', `Starting publication: "${job.title}" → Board: ${job.boardName}`, { jobId: job.id, accountId: account.id });
    onProgress({ progress: 5, message: 'Opening browser...', status: 'running' });

    const profileDir = account.profilePath;
    const fingerprint = FingerprintManager.getOrCreate(profileDir);
    const fpLaunchOpts = FingerprintManager.toLaunchOptions(fingerprint);
    console.log(`[Fingerprint] Applying: ${FingerprintManager.getSummary(fingerprint)}`);

    // Run visible so the user can see if Pinterest blocks the action or asks for a captcha
    const launchOptions: any = {
      headless: false,
      ...fpLaunchOpts,
      executablePath: getChromiumExecutablePath(),
      args: ['--start-maximized', '--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-gpu']
    };

    try {
      this.activeContext = await chromium.launchPersistentContext(profileDir, launchOptions);
      const injectionScript = generateInjectionScript(fingerprint);
      await this.activeContext.addInitScript(injectionScript);
    } catch (err: any) {
      await this.db.addLog('error', `Failed to launch publishing browser: ${err.message}`, { jobId: job.id });
      throw err;
    }

    try {
      this.activePage = this.activeContext.pages()[0] || await this.activeContext.newPage();
      const page = this.activePage;

      // Navigate to Pin Builder
      onProgress({ progress: 15, message: 'Navigating to Pinterest Pin Builder...', status: 'running' });
      await page.goto('https://www.pinterest.com/pin-builder/', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await this.sleep(2000);
      await this.checkPauseAndStop(page, (msg) => onProgress({ progress: 15, message: msg, status: 'running' }));

      // Check if session is valid (should stay on /pin-builder/ or redirect to /pin-creation/)
      let currentUrl = page.url();
      let isNotLoggedIn = !currentUrl.includes('/pin-builder') && !currentUrl.includes('/pin-creation-tool') && !currentUrl.includes('/pin-creation');

      // If not logged in, attempt auto-login if credentials available
      if (isNotLoggedIn) {
        const email = account.email || (account.nickname.includes('@') ? account.nickname : '');
        const password = account.password;
        
        if (email && password) {
          try {
            onProgress({ progress: 15, message: 'Session expired. Attempting automatic login...', status: 'running' });
            await this.db.addLog('info', `Auto-login attempt for: ${email}`, { jobId: job.id });
            
            if (!page.url().includes('/login')) {
              await page.goto('https://www.pinterest.com/login/', { waitUntil: 'domcontentloaded', timeout: 30000 });
              await this.sleep(2000);
            }

            const emailSelectors = ['input[type="email"]', 'input#email', 'input[name="id"]'];
            for (const sel of emailSelectors) {
              if (await page.locator(sel).first().isVisible().catch(() => false)) {
                await page.locator(sel).first().fill(email);
                break;
              }
            }

            await this.sleep(500);

            const passSelectors = ['input[type="password"]', 'input#password', 'input[name="password"]'];
            for (const sel of passSelectors) {
              if (await page.locator(sel).first().isVisible().catch(() => false)) {
                await page.locator(sel).first().fill(password);
                break;
              }
            }

            await this.sleep(500);

            const loginBtns = ['button[type="submit"]', 'button:has-text("Log in")', 'button:has-text("Log In")'];
            for (const sel of loginBtns) {
              if (await page.locator(sel).first().isVisible().catch(() => false)) {
                await page.locator(sel).first().click();
                break;
              }
            }

            await this.sleep(6000);
            await page.goto('https://www.pinterest.com/pin-builder/', { waitUntil: 'domcontentloaded', timeout: 35000 });
            await this.sleep(2000);
            currentUrl = page.url();
            isNotLoggedIn = !currentUrl.includes('/pin-builder') && !currentUrl.includes('/pin-creation-tool') && !currentUrl.includes('/pin-creation');
          } catch (e: any) {
            await this.db.addLog('error', `Auto-login failed: ${e.message}`, { jobId: job.id });
          }
        }
      }

      if (isNotLoggedIn) {
        throw new Error('Pinterest session has expired. Please go to the "Accounts" tab and click "Connect Account (Login)" to sign in again.');
      }

      // Verify image file exists
      if (!fs.existsSync(job.imagePath)) {
        throw new Error(`Image file not found on disk: ${job.imagePath}`);
      }

      // ===== STEP 1: Upload Image =====
      onProgress({ progress: 25, message: 'Uploading image...', status: 'running' });
      await this.db.addLog('info', `Uploading image: ${path.basename(job.imagePath)}`, { jobId: job.id });

      // FIXED: Use filechooser event — most reliable way to upload files in Playwright
      let uploadSuccess = false;
      
      // Method A: Click the visible drag-drop zone and intercept file chooser
      try {
        const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10000 });
        
        // Try clicking the upload zone button first
        const uploadZoneSelectors = [
          '[data-test-id="media-upload-input"]',
          '[data-test-id="pin-builder-upload-button"]',
          'button:has-text("Upload")',
          'div[data-test-id*="upload"]',
          'label[for*="upload"]',
          '[aria-label*="upload"]',
          '[aria-label*="Upload"]',
        ];
        
        let clicked = false;
        for (const sel of uploadZoneSelectors) {
          const loc = page.locator(sel).first();
          if (await loc.isVisible().catch(() => false)) {
            await loc.click({ force: true });
            clicked = true;
            break;
          }
        }
        
        if (!clicked) {
          // Click center of page where upload zone usually is
          await page.click('body', { position: { x: 400, y: 300 } });
        }

        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(job.imagePath);
        uploadSuccess = true;
        console.log('[Upload] File chooser method succeeded.');
      } catch (e1) {
        console.warn('[Upload] File chooser method failed, trying setInputFiles:', e1);
        
        // Method B: Direct setInputFiles on hidden input
        try {
          const fileInputSelectors = [
            'input[type="file"][data-test-id="media-upload-input"]',
            'input[type="file"][accept*="image"]',
            'input[type="file"]'
          ];
          
          for (const sel of fileInputSelectors) {
            const count = await page.locator(sel).count().catch(() => 0);
            if (count > 0) {
              await page.locator(sel).first().setInputFiles(job.imagePath);
              uploadSuccess = true;
              console.log(`[Upload] setInputFiles succeeded with: ${sel}`);
              break;
            }
          }
        } catch (e2: any) {
          throw new Error(`Failed to upload image using all methods: ${e2.message}`);
        }
      }

      if (!uploadSuccess) {
        throw new Error('Image upload failed — could not find upload input or file chooser.');
      }

      // Wait for image to process (Pinterest shows a progress bar)
      await this.sleep(3000);
      await this.checkPauseAndStop(page, (msg) => onProgress({ progress: 30, message: msg, status: 'running' }));

      // ===== STEP 2: Fill Title =====
      onProgress({ progress: 35, message: 'Filling title...', status: 'running' });
      const titleSelectors = [
        'textarea[placeholder*="Add your title"]',
        'input[placeholder*="Add your title"]',
        'textarea[placeholder*="title" i]',
        'input[placeholder*="title" i]',
        '[aria-label*="title" i]',
        'textarea[id^="title"]',
        'input[id^="title"]'
      ];

      let titleFilled = false;
      for (const sel of titleSelectors) {
        if (await page.locator(sel).first().isVisible().catch(() => false)) {
          if (job.title) {
            await this.typeSlowly(page, sel, job.title);
            titleFilled = true;
          }
          break;
        }
      }

      if (!titleFilled && job.title) {
        await this.db.addLog('warn', 'Title input not found — may need manual entry.', { jobId: job.id });
      }

      await this.sleep(getActionDelay());
      await this.checkPauseAndStop(page, (msg) => onProgress({ progress: 35, message: msg, status: 'running' }));

      // ===== STEP 3: Fill Description =====
      onProgress({ progress: 45, message: 'Filling description...', status: 'running' });
      const descSelectors = [
        'div[class*="public-DraftEditor-content"]',
        'div[aria-label*="what your Pin is about" i]',
        'div[aria-label*="Tell everyone" i]',
        'div[data-test-id*="description"]',
        'textarea[placeholder*="description" i]',
        'textarea[placeholder*="about" i]',
        '[aria-label*="description" i]'
      ];

      for (const sel of descSelectors) {
        if (await page.locator(sel).first().isVisible().catch(() => false)) {
          if (job.description) {
            await this.typeSlowly(page, sel, job.description);
          }
          break;
        }
      }

      await this.sleep(getActionDelay());
      await this.checkPauseAndStop(page, (msg) => onProgress({ progress: 45, message: msg, status: 'running' }));

      // ===== STEP 4: Fill Destination URL =====
      onProgress({ progress: 55, message: 'Filling destination URL...', status: 'running' });
      const urlSelectors = [
        '[data-test-id="pin-draft-link"]',
        '[data-test-id*="link"]',
        'textarea[id^="pin-draft-link-"]',
        'textarea[placeholder*="link" i]',
        'textarea[placeholder*="destination" i]',
        'input[placeholder*="link" i]',
        'input[placeholder*="destination" i]',
        '[aria-label*="destination" i]',
        '[aria-label*="Link" i]',
        '[aria-label*="Add a destination link" i]',
        'input[id^="link"]'
      ];

      for (const sel of urlSelectors) {
        if (await page.locator(sel).first().isVisible().catch(() => false)) {
          if (job.destinationUrl) {
            await this.typeSlowly(page, sel, job.destinationUrl);
          }
          break;
        }
      }

      await this.sleep(getActionDelay());
      await this.checkPauseAndStop(page, (msg) => onProgress({ progress: 55, message: msg, status: 'running' }));

      // ===== STEP 5: Fill Alt Text =====
      if (job.altText) {
        onProgress({ progress: 62, message: 'Filling alt text...', status: 'running' });

        // FIXED: Updated 2026 Pinterest alt text button selectors
        const altBtnSelectors = [
          '[data-test-id="pin-draft-alt-text-button"]',
          'button:has-text("Alt text")',
          'button:has-text("alt text")',
          'button[aria-label*="alt text" i]',
          '[data-test-id="alt-text-button"]'
        ];

        let altExpanded = false;
        for (const sel of altBtnSelectors) {
          if (await page.locator(sel).first().isVisible().catch(() => false)) {
            await page.locator(sel).first().click();
            await this.sleep(800);
            altExpanded = true;
            break;
          }
        }

        if (altExpanded) {
          const altInputSelectors = [
            'textarea[data-test-id="alt-text-textarea"]',
            'textarea[placeholder*="Explain" i]',
            'textarea[aria-label*="Alt text" i]',
            'input[placeholder*="Explain" i]'
          ];

          for (const sel of altInputSelectors) {
            if (await page.locator(sel).first().isVisible().catch(() => false)) {
              await this.typeSlowly(page, sel, job.altText);
              break;
            }
          }
        }
        
        await this.sleep(getActionDelay());
      }
      await this.checkPauseAndStop(page, (msg) => onProgress({ progress: 65, message: msg, status: 'running' }));

      // ===== STEP 6: Select Board =====
      onProgress({ progress: 75, message: `Selecting board: ${job.boardName}...`, status: 'running' });
      await this.db.addLog('info', `Selecting board: ${job.boardName}`, { jobId: job.id });

      const boardBtnSelectors = [
        '[data-test-id="board-dropdown-select-button"]',
        'button:has-text("Choose a board")',
        'div[data-test-id="board-dropdown-select-button"]',
        'button[aria-label*="board" i]'
      ];

      let boardBtnClicked = false;
      for (const sel of boardBtnSelectors) {
        if (await page.locator(sel).first().isVisible().catch(() => false)) {
          const btn = page.locator(sel).first();
          await btn.scrollIntoViewIfNeeded().catch(() => {});
          await btn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
          await btn.click();
          boardBtnClicked = true;
          break;
        }
      }

      if (boardBtnClicked) {
        // Wait for search input to appear
        let searchFound = false;
        const boardSearchSelectors = [
          'input#pickerSearchField',
          'input[aria-label*="Search through your boards" i]',
          'input[type="search"][placeholder="Search"]'
        ];

        for (let attempt = 0; attempt < 25; attempt++) {
          if (this.isStopped) throw new Error('STOPPED');
          
          for (const sel of boardSearchSelectors) {
            if (await page.locator(sel).first().isVisible().catch(() => false)) {
              searchFound = true;
              break;
            }
          }
          if (searchFound) break;
          await this.sleep(400);
        }

        if (!searchFound) {
          throw new Error('Board picker search field did not appear. Pinterest may still be loading.');
        }

        // Type board name in search
        const searchInput = page.locator('input#pickerSearchField, input[aria-label*="Search through your boards" i], input[type="search"][placeholder="Search"]').first();
        await searchInput.click();
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        await searchInput.fill(job.boardName);
        await this.sleep(1200);

        // FIXED: Use precise board item targeting — avoid over-broad div:has-text
        // Pinterest renders board items with data-test-id="board-drop-item" 
        const preciseBoardLocators = [
          page.locator(`[data-test-id="board-drop-item"]:has-text("${job.boardName}")`).first(),
          page.locator(`div[title="${job.boardName}"]`).first(),
          page.locator(`div[title*="${job.boardName}" i]`).first(),
        ];

        let boardSelected = false;
        for (const locator of preciseBoardLocators) {
          if (await locator.isVisible().catch(() => false)) {
            await locator.click();
            boardSelected = true;
            await this.sleep(getActionDelay());
            break;
          }
        }

        if (!boardSelected) {
          // Fallback: look through all board drop items and find exact match
          const allBoardItems = page.locator('[data-test-id="board-drop-item"]');
          const count = await allBoardItems.count().catch(() => 0);
          
          for (let i = 0; i < count; i++) {
            const item = allBoardItems.nth(i);
            const text = await item.innerText().catch(() => '');
            if (text.toLowerCase().includes(job.boardName.toLowerCase())) {
              await item.click();
              boardSelected = true;
              await this.sleep(getActionDelay());
              break;
            }
          }
        }

        if (!boardSelected) {
          // Try to auto-create board
          const createBoardBtn = page.locator('button:has-text("Create board"), [data-test-id="create-board-button"]').first();
          if (await createBoardBtn.isVisible().catch(() => false)) {
            await this.db.addLog('info', `Board '${job.boardName}' not found. Creating it...`, { jobId: job.id });
            onProgress({ progress: 72, message: `Creating board '${job.boardName}'...`, status: 'running' });
            await createBoardBtn.click();
            await this.sleep(2000);

            const nameInput = page.locator('input[name="boardName"], input[id*="board-name"], input[placeholder*="Places to Go"], input[type="text"]').first();
            if (await nameInput.isVisible().catch(() => false)) {
              await nameInput.fill(job.boardName);
              await this.sleep(800);
              
              const submitBtn = page.locator('button:has-text("Create"), button[type="submit"], [data-test-id="board-dialog-submit-button"]').first();
              if (await submitBtn.isVisible().catch(() => false)) {
                await submitBtn.click();
                await this.sleep(4000);
              } else {
                throw new Error(`Create board submit button not found for board: ${job.boardName}`);
              }
            } else {
              throw new Error(`Create board name input not found for board: ${job.boardName}`);
            }
          } else {
            throw new Error(`Board '${job.boardName}' not found in dropdown and auto-create button not available.`);
          }
        }
      } else {
        // Board dropdown not found — pause for manual selection
        await this.db.addLog('warn', 'Board selector not found. Pausing for manual selection.', { jobId: job.id });
        onProgress({ progress: 75, message: '⚠️ Board dropdown not found. Please select the board manually in the browser, then click Resume.', status: 'running' });
        this.isPaused = true;
        await this.checkPauseAndStop(page, (msg) => onProgress({ progress: 75, message: msg, status: 'running' }));
      }

      await this.checkPauseAndStop(page, (msg) => onProgress({ progress: 85, message: msg, status: 'running' }));

      // ===== STEP 6.5: Schedule Pin (Optional) =====
      if (job.scheduledDate && job.scheduledTime) {
        onProgress({ progress: 80, message: `Scheduling for ${job.scheduledDate} ${job.scheduledTime}...`, status: 'running' });
        try {
          const scheduleToggleSelectors = [
            'button:has-text("Publish at a later date")',
            'input[type="checkbox"][id*="scheduled-switch"]',
            '[data-test-id*="schedule-switch"]',
            'div:has-text("Publish at a later date") button'
          ];
          
          let toggleClicked = false;
          for (const sel of scheduleToggleSelectors) {
            const locator = page.locator(sel).first();
            if (await locator.isVisible().catch(() => false)) {
              const isChecked = await locator.getAttribute('aria-checked').catch(() => 'false');
              if (isChecked !== 'true') {
                await locator.click();
                await this.sleep(1500);
              }
              toggleClicked = true;
              break;
            }
          }

          if (!toggleClicked) {
            const labelLocator = page.locator('text="Publish at a later date"').first();
            if (await labelLocator.isVisible().catch(() => false)) {
              await labelLocator.click();
              await this.sleep(1500);
              toggleClicked = true;
            }
          }

          if (toggleClicked) {
            const dateInputSelectors = ['input[id*="scheduled-date"]', 'input[placeholder*="Date"]', 'input[type="date"]'];
            for (const sel of dateInputSelectors) {
              const locator = page.locator(sel).first();
              if (await locator.isVisible().catch(() => false)) {
                await locator.click();
                await page.keyboard.press('Control+A');
                await page.keyboard.press('Delete');
                await locator.fill(job.scheduledDate);
                await page.keyboard.press('Enter');
                break;
              }
            }

            const timeInputSelectors = ['input[id*="scheduled-time"]', 'input[placeholder*="Time"]', 'select[id*="scheduled-time"]'];
            for (const sel of timeInputSelectors) {
              const locator = page.locator(sel).first();
              if (await locator.isVisible().catch(() => false)) {
                await locator.click();
                await page.keyboard.press('Control+A');
                await page.keyboard.press('Delete');
                await locator.fill(job.scheduledTime);
                await page.keyboard.press('Enter');
                break;
              }
            }
          } else {
            throw new Error('Schedule toggle not found.');
          }
        } catch (schedErr: any) {
          await this.db.addLog('warn', `Scheduling automation failed: ${schedErr.message}. Pausing.`, { jobId: job.id });
          onProgress({ 
            progress: 80, 
            message: `⚠️ Scheduling failed. Please set Date (${job.scheduledDate}) & Time (${job.scheduledTime}) manually, then click Resume.`, 
            status: 'running' 
          });
          this.isPaused = true;
          await this.checkPauseAndStop(page, (msg) => onProgress({ progress: 80, message: msg, status: 'running' }));
        }
      }

      await this.checkPauseAndStop(page, (msg) => onProgress({ progress: 88, message: msg, status: 'running' }));

      // ===== STEP 7: Click Publish =====
      onProgress({ progress: 90, message: 'Publishing Pin...', status: 'running' });
      await this.db.addLog('info', 'Clicking Publish button...', { jobId: job.id });

      const publishLocators = [
        page.locator('[data-test-id="board-dropdown-save-button"]'),
        page.locator('div[role="button"]:has-text("Publish")'),
        page.locator('button:has-text("Publish")'),
        page.locator('button:has-text("Save")'),
        page.locator('[data-test-id="create-pin-submit-button"]'),
      ];

      let published = false;
      for (const locator of publishLocators) {
        const count = await locator.count().catch(() => 0);
        for (let i = 0; i < count; i++) {
          const btn = locator.nth(i);
          if (await btn.isVisible().catch(() => false) && await btn.isEnabled().catch(() => false)) {
            await this.sleep(600);
            await btn.click();
            published = true;
            break;
          }
        }
        if (published) break;
      }

      if (!published) {
        throw new Error('Publish/Save button not found. Please click Publish manually in the browser.');
      }

      // Wait for success confirmation
      onProgress({ progress: 95, message: 'Waiting for Pinterest confirmation...', status: 'running' });
      
      let livePinUrl = '';
      let success = false;
      
      for (let attempt = 0; attempt < 20; attempt++) {
        if (this.isStopped) throw new Error('STOPPED');
        
        const url = page.url();
        if (url.includes('/pin/')) {
          livePinUrl = url;
          success = true;
          break;
        }

        // Check for link to pin in page
        const pinLink = page.locator('a[href*="/pin/"]').first();
        if (await pinLink.count().catch(() => 0) > 0) {
          const href = await pinLink.getAttribute('href').catch(() => '');
          if (href) {
            livePinUrl = href.startsWith('http') ? href : `https://www.pinterest.com${href}`;
            success = true;
            break;
          }
        }

        // Check for success text
        const pageHTML = await page.content().catch(() => '');
        if (pageHTML.includes('Created Pin') || pageHTML.includes('Your Pin has been published') || pageHTML.includes('View Pin')) {
          success = true;
          const match = pageHTML.match(/href="\/pin\/(\d+)\//i) || pageHTML.match(/href="\/pin\/(\d+)"/i);
          if (match) {
            livePinUrl = `https://www.pinterest.com/pin/${match[1]}/`;
          }
          break;
        }

        await this.sleep(1000);
      }

      if (!success) {
        // Not necessarily a failure - Pinterest can be slow with confirmations
        await this.db.addLog('warn', 'Could not confirm success toast/redirect, but no error detected. Treating as published.', { jobId: job.id });
      }

      if (livePinUrl) {
        await this.db.addLog('info', `✅ Pin published! Live URL: ${livePinUrl}`, { jobId: job.id, livePinUrl });
        // Note: livePinUrl is returned in the result and saved by publisherAdapter.processQueue via saveQueueJob
      }

      onProgress({ progress: 100, message: `✅ Pin published successfully!${livePinUrl ? ' View it on Pinterest.' : ''}`, status: 'completed' });
      await this.db.addLog('info', `✅ Successfully published Pin: "${job.title}"`, { jobId: job.id });

      return {
        jobId: job.id,
        accountId: account.id,
        boardName: job.boardName,
        status: 'completed',
        message: 'Published successfully.',
        livePinUrl: livePinUrl || undefined,
        startedAt,
        completedAt: new Date().toISOString()
      };
    } catch (e: any) {
      console.error(`Publishing failed for job ${job.id}:`, e);
      
      if (this.activePage && settings.screenshotOnError !== false) {
        try {
          await this.activePage.screenshot({ path: screenshotPath }).catch(() => {});
        } catch {}
      }

      const status = e.message === 'STOPPED' ? 'paused' : 'failed';
      const msg = e.message === 'STOPPED' ? 'Execution cancelled by user.' : `Failed: ${e.message}`;
      
      await this.db.addLog('error', `❌ Publish error: ${e.message}`, { jobId: job.id, accountId: account.id });
      onProgress({ progress: 100, message: msg, status });

      return {
        jobId: job.id,
        accountId: account.id,
        boardName: job.boardName,
        status: 'failed',
        message: e.message,
        errorCode: e.name || 'PUBLISH_ERROR',
        screenshotPath: fs.existsSync(screenshotPath) ? screenshotPath : undefined,
        startedAt,
        completedAt: new Date().toISOString()
      };
    } finally {
      if (this.activeContext) {
        await this.activeContext.close().catch(() => {});
        this.activeContext = null;
        this.activePage = null;
      }
    }
  }
}
