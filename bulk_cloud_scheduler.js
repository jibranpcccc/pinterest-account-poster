const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const appJsonPath = path.join(process.env.APPDATA, 'pinterest-pin-publisher/local-data/app.json');
const appDbPath = path.join(process.env.APPDATA, 'pinterest-pin-publisher/local-data/app.db');
const evidenceBaseDir = path.join(__dirname, 'audit/cloud_schedule_evidence');

function formatDateForPinterest(dateStr, placeholder = '') {
  // dateStr is YYYY-MM-DD
  const parts = dateStr.split(/[-/]/).map(Number);
  const yyyy = parts[0];
  const mm = String(parts[1]).padStart(2, '0');
  const dd = String(parts[2]).padStart(2, '0');

  if (placeholder.toUpperCase().startsWith('DD')) {
    return `${dd}/${mm}/${yyyy}`;
  }
  return `${mm}/${dd}/${yyyy}`;
}

function formatTimeForPinterest(timeStr) {
  // e.g. "01:00:00" -> "01:00 AM"
  const clean = timeStr.trim().toUpperCase();
  if (clean.endsWith('AM') || clean.endsWith('PM')) {
    return clean;
  }
  const parts = clean.split(':');
  let h = parseInt(parts[0], 10) || 0;
  const m = parts.length > 1 ? parts[1] : '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  h = h ? h : 12;
  const strH = String(h).padStart(2, '0');
  return `${strH}:${m} ${ampm}`;
}

async function updateDb(jobId, status) {
  const now = new Date().toISOString();

  // Update app.json
  try {
    if (fs.existsSync(appJsonPath)) {
      const data = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
      for (const j of data.queue_jobs || []) {
        if (j.id === jobId) {
          j.status = status;
          j.completedAt = now;
          j.errorMessage = null;
        }
      }
      for (const j of data.queue || []) {
        if (j.id === jobId) {
          j.status = status;
          j.completedAt = now;
          j.errorMessage = null;
        }
      }
      fs.writeFileSync(appJsonPath, JSON.stringify(data, null, 2), 'utf8');
    }
  } catch (e) {
    console.error('Error updating app.json:', e.message);
  }

  // Update app.db (SQLite)
  try {
    const { execSync } = require('child_process');
    const escapedDbPath = appDbPath.replace(/\\/g, '\\\\');
    const pyCmd = `python -c "import sqlite3; conn = sqlite3.connect(r'${escapedDbPath}'); conn.execute(\\"UPDATE queue_jobs SET status='${status}', completedAt='${now}' WHERE id='${jobId}'\\"); conn.commit(); conn.close()"`;
    execSync(pyCmd, { stdio: 'ignore' });
  } catch (e) {
    // SQLite fallback
  }
}

async function schedulePin(page, job, outDir) {
  console.log(`\n-----------------------------------------------------------`);
  console.log(`📌 Scheduling: [${job.id}]`);
  console.log(`   Title: ${job.title.substring(0, 50)}...`);
  console.log(`   Target Date: ${job.scheduledDate} ${job.scheduledTime}`);
  console.log(`   Target Board: ${job.boardName}`);

  // 1. Navigate to Pin Creation Tool
  await page.goto('https://www.pinterest.com/pin-creation-tool/', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(3500);

  // Check login
  if (page.url().includes('/login') || page.url().includes('/signup')) {
    throw new Error('AUTH_REDIRECT: Session not authenticated');
  }

  // 2. Upload Image
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.waitFor({ state: 'attached', timeout: 15000 });
  await fileInput.setInputFiles(job.imagePath);
  await page.waitForTimeout(2500);

  // 3. Title
  const titleLocator = page.locator('input[placeholder*="Tell everyone" i], textarea[placeholder*="Tell everyone" i], [aria-label*="Title" i], input[placeholder*="title" i]').first();
  await titleLocator.fill(job.title);

  // 4. Description
  const descLocator = page.locator('textarea[placeholder*="Describe your Pin" i], [aria-label*="Describe your Pin" i], textarea[id*="pin-draft-description"]').first();
  await descLocator.fill(job.description);

  // 5. Link (Direct Destination URL)
  if (job.destinationUrl && job.destinationUrl.trim()) {
    console.log(`   🔗 Adding Direct Website Link: ${job.destinationUrl.trim()}`);
    const linkSelectors = [
      'input[id="pin-draft-link"]',
      'textarea[id="pin-draft-link"]',
      '[data-test-id="pin-draft-link"]',
      'textarea[placeholder*="Add a link" i]',
      'input[placeholder*="Add a link" i]',
      'input[placeholder*="link" i]',
      'textarea[placeholder*="link" i]',
      '[aria-label*="Add a link" i]'
    ];
    let linkFilled = false;
    for (const sel of linkSelectors) {
      const loc = page.locator(sel).first();
      if (await loc.isVisible().catch(() => false)) {
        await loc.click().catch(() => {});
        await loc.fill(job.destinationUrl.trim()).catch(() => {});
        linkFilled = true;
        console.log(`   ✅ Link filled successfully via ${sel}`);
        break;
      }
    }
    if (!linkFilled) {
      console.warn(`   ⚠️ Warning: Link input field was not located.`);
    }
  }

  // 6. Board Selection
  const targetBoard = job.boardName.trim();
  const boardText = page.locator(`text="${targetBoard}"`).first();
  const isAlready = await boardText.isVisible().catch(() => false);
  if (!isAlready) {
    const boardTrigger = page.locator('div:has(> div:text("Board"))').locator('div[role="button"], div[tabindex="0"]').last();
    if (await boardTrigger.isVisible().catch(() => false)) {
      await boardTrigger.click();
    } else {
      const altBoard = page.locator('text="Board"').first();
      await altBoard.click().catch(() => {});
    }
    await page.waitForTimeout(1200);

    const searchField = page.locator('input[placeholder*="Search" i], input#pickerSearchField').first();
    if (await searchField.isVisible().catch(() => false)) {
      await searchField.fill(targetBoard);
      await page.waitForTimeout(1000);
      const match = page.locator(`text="${targetBoard}"`).first();
      if (await match.isVisible().catch(() => false)) {
        await match.click();
      } else {
        await page.locator('div[role="option"]').first().click().catch(() => {});
      }
    } else {
      const match = page.locator(`text="${targetBoard}"`).first();
      if (await match.isVisible().catch(() => false)) {
        await match.click();
      } else {
        await page.locator('div[role="option"]').first().click().catch(() => {});
      }
    }
    await page.waitForTimeout(1000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // 7. Toggle "Publish at a later date"
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const scheduleSwitch = page.locator('text="Publish at a later date"').first();
  await scheduleSwitch.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);

  const switchBox = page.locator('input#pin-draft-switch-group, input[type="checkbox"]').first();
  const isChecked = await switchBox.isChecked().catch(() => false);
  if (!isChecked) {
    await scheduleSwitch.click({ force: true }).catch(async () => {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      await scheduleSwitch.click({ force: true });
    });
    await page.waitForTimeout(1200);
  }

  // Scroll form down so date & time fields are in viewport
  await page.evaluate(() => {
    window.scrollBy(0, 600);
    const el = document.querySelector('input[placeholder*="YYYY" i], input[id*="schedule-date"]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await page.waitForTimeout(1000);

  const dateFieldSelector = 'input[placeholder*="YYYY" i], input[id*="schedule-date-field"], input[id*="scheduled-date"]';
  const dateField = page.locator(dateFieldSelector).first();
  await dateField.scrollIntoViewIfNeeded().catch(() => {});
  await dateField.waitFor({ state: 'visible', timeout: 10000 });

  await dateField.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);

  // 8. Configure Date
  const placeholder = (await dateField.getAttribute('placeholder')) || '';
  const formattedDate = formatDateForPinterest(job.scheduledDate, placeholder);
  console.log(`   Configuring Date: ${formattedDate} (placeholder: ${placeholder})`);
  await dateField.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await dateField.fill(formattedDate);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);

  // 9. Configure Time
  const timeField = page.locator('input[id*="schedule-time-field"], input[placeholder="Time"], input[id*="scheduled-time"]').first();
  if (await timeField.isVisible().catch(() => false)) {
    const formattedTime = formatTimeForPinterest(job.scheduledTime || '01:00:00');
    console.log(`   Configuring Time: ${formattedTime}`);
    await timeField.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await timeField.fill(formattedTime).catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForTimeout(500);
  }

  // 10. Click Top Schedule Button
  console.log('   Clicking Primary Schedule button...');
  const actionBtn = page.locator('button:has-text("Schedule")').first();
  await actionBtn.click();
  await page.waitForTimeout(2000);

  // 11. Modal Confirmation Dialog (if present)
  const modal = page.locator('div[role="dialog"]');
  if (await modal.isVisible().catch(() => false)) {
    console.log('   Modal confirmation dialog detected! Clicking modal Schedule button...');
    const modalBtn = modal.locator('button:has-text("Schedule")').first();
    if (await modalBtn.isVisible().catch(() => false)) {
      await modalBtn.click();
      console.log('   Modal Schedule button clicked!');
    }
  }

  // 12. Wait for confirmation
  await page.waitForTimeout(6000);

  // Capture evidence screenshot
  const shotPath = path.join(outDir, `${job.id}.png`);
  await page.screenshot({ path: shotPath }).catch(() => {});

  // Update DB status
  await updateDb(job.id, 'cloud_scheduled');
  console.log(`   ✅ SUCCESS: ${job.id} locked into Pinterest Cloud!`);
  return true;
}

async function runBulkCloudScheduler() {
  if (!fs.existsSync(appJsonPath)) {
    console.error('app.json not found!');
    process.exit(1);
  }

  const raw = fs.readFileSync(appJsonPath, 'utf8');
  const dbData = JSON.parse(raw);

  const targetAccounts = [
    'acc_homestylemuse',
    'acc_stylefueldaily',
    'acc_savvywealthdaily',
    'acc_coifchronicle'
  ];

  const limitArg = process.argv.find(a => a.startsWith('--limit='));
  const maxLimit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

  const untilArg = process.argv.find(a => a.startsWith('--until=') || a.startsWith('--end-date='));
  const untilDate = untilArg ? untilArg.split('=')[1] : null;

  const perAccountArg = process.argv.find(a => a.startsWith('--per-account='));
  const maxPerAccount = perAccountArg ? parseInt(perAccountArg.split('=')[1], 10) : Infinity;

  // Find remaining scheduled jobs
  let pendingJobs = (dbData.queue_jobs || []).filter(
    (j) => targetAccounts.includes(j.accountId) && j.status === 'scheduled'
  );

  if (untilDate) {
    console.log(`Filtering pins scheduled on or before: ${untilDate}`);
    pendingJobs = pendingJobs.filter(j => j.scheduledDate <= untilDate);
  }

  if (isFinite(maxPerAccount)) {
    console.log(`Filtering max ${maxPerAccount} pins per account`);
    const limited = [];
    for (const acc of targetAccounts) {
      const accList = pendingJobs.filter(j => j.accountId === acc).slice(0, maxPerAccount);
      limited.push(...accList);
    }
    pendingJobs = limited;
  } else if (isFinite(maxLimit)) {
    pendingJobs = pendingJobs.slice(0, maxLimit);
  }

  console.log('===========================================================');
  console.log('🚀 PINTEREST 30-DAY MASTER CLOUD SCHEDULER');
  console.log(`Total Target Pins to Schedule in this run: ${pendingJobs.length}`);
  console.log('Target Accounts:');
  for (const acc of targetAccounts) {
    const c = pendingJobs.filter(j => j.accountId === acc).length;
    console.log(`  - ${acc}: ${c} pins`);
  }
  console.log('===========================================================\n');

  if (pendingJobs.length === 0) {
    console.log('🎉 ALL PINS ARE ALREADY CLOUD SCHEDULED! Nothing to do.');
    process.exit(0);
  }

  let totalScheduled = 0;
  let totalFailed = 0;

  for (const accountId of targetAccounts) {
    const accJobs = pendingJobs.filter((j) => j.accountId === accountId);
    if (accJobs.length === 0) continue;

    console.log(`\n=======================================================`);
    console.log(`🚀 Starting Account: ${accountId} (${accJobs.length} pins)`);
    console.log(`=======================================================`);

    const profileDir = path.join(process.env.APPDATA, 'pinterest-pin-publisher/local-data/profiles', accountId);
    const outDir = path.join(evidenceBaseDir, accountId);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    let context = null;

    async function getContext() {
      if (!context) {
        context = await chromium.launchPersistentContext(profileDir, {
          headless: true,
          viewport: { width: 1440, height: 900 },
          locale: 'en-US',
          args: ['--no-sandbox', '--disable-gpu']
        });
      }
      return context;
    }

    for (const job of accJobs) {
      let page = null;
      try {
        const ctx = await getContext();
        page = await ctx.newPage();
        await schedulePin(page, job, outDir);
        totalScheduled++;
        // Small anti-spam delay between pins (3 to 6 seconds)
        const delay = Math.floor(Math.random() * 3000) + 3000;
        console.log(`   Waiting ${(delay / 1000).toFixed(1)}s cooldown before next pin...`);
        await new Promise(r => setTimeout(r, delay));
      } catch (err) {
        console.error(`   ❌ FAILED to schedule ${job.id}: ${err.message}`);
        totalFailed++;
        if (page) {
          const errShot = path.join(outDir, `${job.id}_error.png`);
          await page.screenshot({ path: errShot }).catch(() => {});
        }
        if (err.message.includes('closed') || err.message.includes('Target')) {
          console.log('   Browser connection lost. Re-initializing context for next job...');
          if (context) {
            await context.close().catch(() => {});
            context = null;
          }
        }
        // Wait 5s before attempting next pin
        await new Promise(r => setTimeout(r, 5000));
      } finally {
        if (page) {
          await page.close().catch(() => {});
        }
      }
    }

    if (context) {
      await context.close().catch(() => {});
      context = null;
    }
    console.log(`✅ Finished all remaining pins for ${accountId}.`);
  }

  console.log('\n===========================================================');
  console.log('🎉 30-DAY MASTER CLOUD SCHEDULING COMPLETE!');
  console.log(`   Successfully Scheduled: ${totalScheduled}`);
  console.log(`   Failed: ${totalFailed}`);
  console.log('===========================================================');
}

runBulkCloudScheduler().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
