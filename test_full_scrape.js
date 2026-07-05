const { chromium } = require('playwright');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');
const fs = require('fs');

const dbPath = path.join(os.homedir(), 'AppData/Roaming/pinterest-pin-publisher/local-data/app.db');
console.log('Database Path:', dbPath);

const db = new sqlite3.Database(dbPath);

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

async function start() {
  try {
    const accounts = await query('SELECT * FROM accounts');
    if (accounts.length === 0) {
      console.error('No accounts found in the database. Please add an account first.');
      db.close();
      return;
    }

    const account = accounts[0];
    console.log(`Target Account: ${account.nickname} (ID: ${account.id})`);

    const profileDir = account.profilePath;
    console.log(`Using profile path: ${profileDir}`);

    const launchOptions = {
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    };

    console.log('Launching persistent context with bundled Chromium...');
    const context = await chromium.launchPersistentContext(profileDir, launchOptions);
    const page = await context.newPage();

    console.log('Navigating to https://www.pinterest.com/...');
    await page.goto('https://www.pinterest.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    const currentUrl = page.url();
    console.log('Landing URL:', currentUrl);

    if (currentUrl.includes('/login') || currentUrl.includes('/signup')) {
      throw new Error('Not logged in to Pinterest in this profile. Please run the app and click "Connect Account (Login)" first.');
    }

    console.log('Navigating to settings to fetch username...');
    await page.goto('https://www.pinterest.com/settings/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    const settingsUrl = page.url();
    console.log('Settings URL:', settingsUrl);
    if (settingsUrl === 'https://www.pinterest.com/' || settingsUrl.includes('/login')) {
      throw new Error('Redirected to landing page. Session is expired.');
    }

    let username = null;
    try {
      const usernameInput = await page.locator('input[name="username"]').first();
      if (await usernameInput.isVisible()) {
        username = await usernameInput.inputValue();
      }
    } catch (e) {}

    if (!username) {
      try {
        const profileBtn = await page.locator('[data-test-id="header-profile-button"] a').first();
        if (await profileBtn.isVisible()) {
          const href = await profileBtn.getAttribute('href');
          if (href) username = href.split('/').filter(Boolean)[0];
        }
      } catch (e) {}
    }

    if (!username) {
      throw new Error('Could not resolve username from profile settings.');
    }

    console.log(`Found Username: ${username}`);

    const boardsUrl = `https://www.pinterest.com/${username}/_saved/`;
    console.log(`Navigating to Saved Boards page: ${boardsUrl}`);
    await page.goto(boardsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    // Scroll down to load all boards
    console.log('Scrolling page...');
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(1500);
    }

    console.log('Extracting boards...');
    const boards = await page.evaluate((uname) => {
      const list = [];
      const links = document.querySelectorAll('a[href^="/"]');
      links.forEach((link) => {
        const href = link.getAttribute('href');
        if (!href) return;
        const cleanHref = href.split('?')[0];
        const parts = cleanHref.split('/').filter(Boolean);
        
        if (parts.length === 2 && parts[0].toLowerCase() === uname.toLowerCase()) {
          const boardName = parts[1];
          if (['_saved', '_created', 'settings', 'pins'].includes(boardName)) return;
          
          let title = '';
          const titleEl = link.querySelector('[title], h2, div[style*="font-weight"]');
          if (titleEl) {
            title = titleEl.getAttribute('title') || titleEl.textContent || '';
          }
          if (!title) title = link.textContent || '';
          title = title.trim().replace(/\s+/g, ' ');
          if (!title) {
            title = boardName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          }

          list.push({
            name: title,
            url: `https://www.pinterest.com${cleanHref}`
          });
        }
      });
      return list;
    }, username);

    console.log(`Scraped ${boards.length} boards. Saving to database...`);

    const now = new Date().toISOString();
    for (const b of boards) {
      const boardId = Buffer.from(`${account.id}:${b.url}`).toString('base64').replace(/=/g, '');
      
      // Check if board already exists
      const existing = await query('SELECT * FROM boards WHERE id = ?', [boardId]);
      if (existing.length > 0) {
        await run('UPDATE boards SET name = ?, url = ?, lastFetchedAt = ? WHERE id = ?', [b.name, b.url, now, boardId]);
      } else {
        await run('INSERT INTO boards (id, accountId, name, url, lastFetchedAt) VALUES (?, ?, ?, ?, ?)', [boardId, account.id, b.name, b.url, now]);
      }
    }

    console.log('SUCCESS! All boards saved to database.');
    boards.forEach(b => console.log(`- ${b.name}: ${b.url}`));

    await context.close();
  } catch (e) {
    console.error('ERROR OCCURRED:', e.message);
  } finally {
    db.close();
  }
}

start();
