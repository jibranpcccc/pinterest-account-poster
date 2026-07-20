module.exports = [
  {
    name: "T3_COV_1: Bulk schedule form inputs exist and accept values",
    fn: async ({ page, dbHelper }) => {
      // 1. Seed two pending jobs
      const db = await windowNodeGetDb();
      db.queue_jobs = [
        {
          id: 'job-pending-1',
          accountId: 'acc-1',
          boardName: 'E2E Testing Board',
          title: 'Pending Pin 1',
          description: 'Desc 1',
          imagePath: 'C:\\images\\pin.jpg',
          status: 'pending',
          createdAt: new Date().toISOString()
        },
        {
          id: 'job-pending-2',
          accountId: 'acc-1',
          boardName: 'E2E Testing Board',
          title: 'Pending Pin 2',
          description: 'Desc 2',
          imagePath: 'C:\\images\\pin.jpg',
          status: 'pending',
          createdAt: new Date().toISOString()
        }
      ];
      await windowNodeSaveDb(db);
      await page.reload();

      // 2. Navigate to real Publish Queue screen
      await page.click('button:has-text("Publish Queue")');
      await page.waitForTimeout(500);

      // 3. Select all pending jobs
      await page.click('label:has-text("Select All Pending")');

      // 4. Click Bulk Schedule button to open the modal
      await page.click('button:has-text("Bulk Schedule")');

      // 5. Locate inputs inside the modal
      const startDateInput = page.locator('input[type="date"]').first();
      const endDateInput = page.locator('input[type="date"]').nth(1);
      const postsPerDayInput = page.locator('input[type="number"]').first();
      const startTimeInput = page.locator('input[type="time"]');

      // 6. Fill values
      await startDateInput.fill('2026-07-16');
      await endDateInput.fill('2026-07-20');
      await postsPerDayInput.fill('5');
      await startTimeInput.fill('08:00');

      // 7. Assert values are accepted
      await expect(startDateInput).toHaveValue('2026-07-16');
      await expect(endDateInput).toHaveValue('2026-07-20');
      await expect(postsPerDayInput).toHaveValue('5');
      await expect(startTimeInput).toHaveValue('08:00');
    }
  },
  {
    name: "T3_COV_2: Clicking generate bulk schedules creates new database entries",
    fn: async ({ page, dbHelper }) => {
      // Seed three pending jobs
      const db = await windowNodeGetDb();
      db.queue_jobs = Array.from({ length: 3 }, (_, i) => ({
        id: `job-pending-${i}`,
        accountId: 'acc-1',
        boardName: 'E2E Testing Board',
        title: `Pending Pin ${i}`,
        imagePath: 'C:\\images\\pin.jpg',
        status: 'pending',
        createdAt: new Date().toISOString()
      }));
      await windowNodeSaveDb(db);
      await page.reload();

      await page.click('button:has-text("Publish Queue")');
      await page.waitForTimeout(500);
      await page.click('label:has-text("Select All Pending")');
      await page.click('button:has-text("Bulk Schedule")');

      // Fill dates and submit preview
      await page.locator('input[type="date"]').first().fill('2026-07-16');
      await page.locator('input[type="date"]').nth(1).fill('2026-07-18');
      await page.locator('input[type="number"]').first().fill('3');
      await page.locator('input[type="time"]').fill('09:00');

      await page.click('button:has-text("Generate Preview")');
      await page.click('button:has-text("Confirm & Save")');

      // Verify DB entries are now scheduled
      let updatedDb;
      let scheduledCount = 0;
      for (let i = 0; i < 20; i++) {
        updatedDb = await windowNodeGetDb();
        scheduledCount = updatedDb.queue_jobs.filter(j => j.status === 'scheduled').length;
        if (scheduledCount === 3) break;
        await page.waitForTimeout(100);
      }

      if (scheduledCount !== 3) {
        throw new Error(`Expected 3 scheduled jobs, but found ${scheduledCount}`);
      }
    }
  },
  {
    name: "T3_COV_3: Generated jobs have status set to scheduled",
    fn: async ({ page, dbHelper }) => {
      // Seed two pending jobs
      const db = await windowNodeGetDb();
      db.queue_jobs = Array.from({ length: 2 }, (_, i) => ({
        id: `job-pending-${i}`,
        accountId: 'acc-1',
        boardName: 'E2E Testing Board',
        title: `Pending Pin ${i}`,
        imagePath: 'C:\\images\\pin.jpg',
        status: 'pending',
        createdAt: new Date().toISOString()
      }));
      await windowNodeSaveDb(db);
      await page.reload();

      await page.click('button:has-text("Publish Queue")');
      await page.waitForTimeout(500);
      await page.click('label:has-text("Select All Pending")');
      await page.click('button:has-text("Bulk Schedule")');

      await page.click('button:has-text("Generate Preview")');
      await page.click('button:has-text("Confirm & Save")');

      // Polling database check
      let updatedDb;
      let scheduledJobs = [];
      for (let i = 0; i < 20; i++) {
        updatedDb = await windowNodeGetDb();
        scheduledJobs = updatedDb.queue_jobs.filter(j => j.status === 'scheduled');
        if (scheduledJobs.length === 2) break;
        await page.waitForTimeout(100);
      }

      if (scheduledJobs.length !== 2) {
        throw new Error(`Expected 2 scheduled jobs, got ${scheduledJobs.length}`);
      }
      scheduledJobs.forEach(job => {
        if (job.status !== 'scheduled') {
          throw new Error(`Expected job status to be scheduled, got ${job.status}`);
        }
      });
    }
  },
  {
    name: "T3_COV_4: Bulk distribution spreads scheduled dates across requested days",
    fn: async ({ page, dbHelper }) => {
      // Seed six pending jobs
      const db = await windowNodeGetDb();
      db.queue_jobs = Array.from({ length: 6 }, (_, i) => ({
        id: `job-pending-${i}`,
        accountId: 'acc-1',
        boardName: 'E2E Testing Board',
        title: `Pending Pin ${i}`,
        imagePath: 'C:\\images\\pin.jpg',
        status: 'pending',
        createdAt: new Date().toISOString()
      }));
      await windowNodeSaveDb(db);
      await page.reload();

      await page.click('button:has-text("Publish Queue")');
      await page.waitForTimeout(500);
      await page.click('label:has-text("Select All Pending")');
      await page.click('button:has-text("Bulk Schedule")');

      // Distribute across 3 days: 2026-07-16 to 2026-07-18
      await page.locator('input[type="date"]').first().fill('2026-07-16');
      await page.locator('input[type="date"]').nth(1).fill('2026-07-18');
      await page.locator('input[type="number"]').first().fill('5'); // posts per day limit
      await page.locator('input[type="time"]').fill('09:00');

      await page.click('button:has-text("Generate Preview")');
      await page.click('button:has-text("Confirm & Save")');

      // Polling check
      let updatedDb;
      let dates = [];
      for (let i = 0; i < 20; i++) {
        updatedDb = await windowNodeGetDb();
        dates = updatedDb.queue_jobs.map(j => j.scheduledDate).filter(Boolean);
        const uniqueDates = [...new Set(dates)];
        if (uniqueDates.length >= 2) break;
        await page.waitForTimeout(100);
      }

      const uniqueDates = [...new Set(dates)];
      if (uniqueDates.length < 2) {
        throw new Error(`Expected dates to spread across multiple days, unique dates: ${uniqueDates.join(', ')}`);
      }
    }
  },
  {
    name: "T3_COV_5: Generates toast message on successful bulk schedule generation",
    fn: async ({ page, dbHelper }) => {
      // Seed four pending jobs
      const db = await windowNodeGetDb();
      db.queue_jobs = Array.from({ length: 4 }, (_, i) => ({
        id: `job-pending-${i}`,
        accountId: 'acc-1',
        boardName: 'E2E Testing Board',
        title: `Pending Pin ${i}`,
        imagePath: 'C:\\images\\pin.jpg',
        status: 'pending',
        createdAt: new Date().toISOString()
      }));
      await windowNodeSaveDb(db);
      await page.reload();

      await page.click('button:has-text("Publish Queue")');
      await page.waitForTimeout(500);
      await page.click('label:has-text("Select All Pending")');
      await page.click('button:has-text("Bulk Schedule")');

      // Set posts per day limit to 4 to allow 4 jobs on same day
      await page.locator('input[type="number"]').first().fill('4');

      await page.click('button:has-text("Generate Preview")');
      await page.click('button:has-text("Confirm & Save")');

      // Verify specific toast text using text locator instead of just class to avoid conflict
      const toast = page.locator('div:has-text("Successfully scheduled 4 jobs!")').first();
      await expect(toast).toContainText('Successfully scheduled 4 jobs!');
    }
  },
  {
    name: "T3_BND_1: Handles count of 1 pin by scheduling it correctly",
    fn: async ({ page, dbHelper }) => {
      // Seed one pending job
      const db = await windowNodeGetDb();
      db.queue_jobs = [
        {
          id: 'job-pending-1',
          accountId: 'acc-1',
          boardName: 'E2E Testing Board',
          title: 'Pending Pin 1',
          imagePath: 'C:\\images\\pin.jpg',
          status: 'pending',
          createdAt: new Date().toISOString()
        }
      ];
      await windowNodeSaveDb(db);
      await page.reload();

      await page.click('button:has-text("Publish Queue")');
      await page.waitForTimeout(500);
      await page.click('label:has-text("Select All Pending")');
      await page.click('button:has-text("Bulk Schedule")');

      await page.click('button:has-text("Generate Preview")');
      await page.click('button:has-text("Confirm & Save")');

      // Polling database check
      let updatedDb;
      let scheduledCount = 0;
      for (let i = 0; i < 20; i++) {
        updatedDb = await windowNodeGetDb();
        scheduledCount = updatedDb.queue_jobs.filter(j => j.status === 'scheduled').length;
        if (scheduledCount === 1) break;
        await page.waitForTimeout(100);
      }

      if (scheduledCount !== 1) {
        throw new Error(`Expected 1 scheduled job, got ${scheduledCount}`);
      }
    }
  },
  {
    name: "T3_BND_2: Scheduled hours stay strictly within the start and end hour range",
    fn: async ({ page, dbHelper }) => {
      // Seed 6 pending jobs
      const db = await windowNodeGetDb();
      db.queue_jobs = Array.from({ length: 6 }, (_, i) => ({
        id: `job-pending-${i}`,
        accountId: 'acc-1',
        boardName: 'E2E Testing Board',
        title: `Pending Pin ${i}`,
        imagePath: 'C:\\images\\pin.jpg',
        status: 'pending',
        createdAt: new Date().toISOString()
      }));
      await windowNodeSaveDb(db);
      await page.reload();

      await page.click('button:has-text("Publish Queue")');
      await page.waitForTimeout(500);
      await page.click('label:has-text("Select All Pending")');
      await page.click('button:has-text("Bulk Schedule")');

      // Schedule for same day with 10:00 start time and 4 hours spread (strictly 10:00 to 14:00)
      const today = new Date();
      const format = (n) => String(n).padStart(2, '0');
      const todayStr = `${today.getFullYear()}-${format(today.getMonth() + 1)}-${format(today.getDate())}`;

      await page.locator('input[type="date"]').first().fill(todayStr);
      await page.locator('input[type="date"]').nth(1).fill(todayStr);
      await page.locator('input[type="number"]').first().fill('10');
      await page.locator('input[type="time"]').fill('10:00');
      await page.locator('input[type="number"]').nth(1).fill('4'); // Spread hours

      await page.click('button:has-text("Generate Preview")');
      await page.click('button:has-text("Confirm & Save")');

      // Polling database check
      let updatedDb;
      let scheduledCount = 0;
      for (let i = 0; i < 20; i++) {
        updatedDb = await windowNodeGetDb();
        scheduledCount = updatedDb.queue_jobs.filter(j => j.status === 'scheduled').length;
        if (scheduledCount === 6) break;
        await page.waitForTimeout(100);
      }

      updatedDb.queue_jobs.forEach(job => {
        if (job.status === 'scheduled' && job.scheduledTime) {
          // Time is e.g. "10:00 AM" or "01:12 PM". Parse standard format conversion
          const timeParts = job.scheduledTime.toUpperCase();
          let hour = parseInt(timeParts.split(':')[0]);
          const isPM = timeParts.includes('PM');
          if (isPM && hour !== 12) hour += 12;
          if (!isPM && hour === 12) hour = 0;

          if (hour < 10 || hour > 14) {
            throw new Error(`Scheduled time ${job.scheduledTime} fell outside boundaries (10:00 - 14:00)`);
          }
        }
      });
    }
  },
  {
    name: "T3_BND_3: Supports scheduling over 0 days (same-day distribution)",
    fn: async ({ page, dbHelper }) => {
      // Seed 3 pending jobs
      const db = await windowNodeGetDb();
      db.queue_jobs = Array.from({ length: 3 }, (_, i) => ({
        id: `job-pending-${i}`,
        accountId: 'acc-1',
        boardName: 'E2E Testing Board',
        title: `Pending Pin ${i}`,
        imagePath: 'C:\\images\\pin.jpg',
        status: 'pending',
        createdAt: new Date().toISOString()
      }));
      await windowNodeSaveDb(db);
      await page.reload();

      await page.click('button:has-text("Publish Queue")');
      await page.waitForTimeout(500);
      await page.click('label:has-text("Select All Pending")');
      await page.click('button:has-text("Bulk Schedule")');

      const today = new Date();
      const format = (n) => String(n).padStart(2, '0');
      const todayStr = `${today.getFullYear()}-${format(today.getMonth() + 1)}-${format(today.getDate())}`;

      await page.locator('input[type="date"]').first().fill(todayStr);
      await page.locator('input[type="date"]').nth(1).fill(todayStr);
      await page.locator('input[type="number"]').first().fill('3');
      await page.locator('input[type="time"]').fill('09:00');

      await page.click('button:has-text("Generate Preview")');
      await page.click('button:has-text("Confirm & Save")');

      // Polling database check
      let updatedDb;
      let scheduledCount = 0;
      for (let i = 0; i < 20; i++) {
        updatedDb = await windowNodeGetDb();
        scheduledCount = updatedDb.queue_jobs.filter(j => j.status === 'scheduled').length;
        if (scheduledCount === 3) break;
        await page.waitForTimeout(100);
      }

      updatedDb.queue_jobs.forEach(job => {
        if (job.status === 'scheduled' && job.scheduledDate !== todayStr) {
          throw new Error(`Expected same-day schedule (${todayStr}), but got ${job.scheduledDate}`);
        }
      });
    }
  },
  {
    name: "T3_BND_4: Invalid count falls back to robust defaults",
    fn: async ({ page, dbHelper }) => {
      // Seed one pending job
      const db = await windowNodeGetDb();
      db.queue_jobs = [
        {
          id: 'job-pending-1',
          accountId: 'acc-1',
          boardName: 'E2E Testing Board',
          title: 'Pending Pin 1',
          imagePath: 'C:\\images\\pin.jpg',
          status: 'pending',
          createdAt: new Date().toISOString()
        }
      ];
      await windowNodeSaveDb(db);
      await page.reload();

      await page.click('button:has-text("Publish Queue")');
      await page.waitForTimeout(500);
      await page.click('label:has-text("Select All Pending")');
      await page.click('button:has-text("Bulk Schedule")');

      // Test clamp/fallback on Posts Per Day
      const postsPerDayInput = page.locator('input[type="number"]').first();
      await postsPerDayInput.fill('-5');

      // Clamping logic sets it to 1
      await expect(postsPerDayInput).toHaveValue('1');
    }
  },
  {
    name: "T3_BND_5: Large count of bulk generation processes smoothly",
    fn: async ({ page, dbHelper }) => {
      // Seed 30 pending jobs
      const db = await windowNodeGetDb();
      db.queue_jobs = Array.from({ length: 30 }, (_, i) => ({
        id: `job-pending-${i}`,
        accountId: 'acc-1',
        boardName: 'E2E Testing Board',
        title: `Pending Pin ${i}`,
        imagePath: 'C:\\images\\pin.jpg',
        status: 'pending',
        createdAt: new Date().toISOString()
      }));
      await windowNodeSaveDb(db);
      await page.reload();

      await page.click('button:has-text("Publish Queue")');
      await page.waitForTimeout(500);
      await page.click('label:has-text("Select All Pending")');
      await page.click('button:has-text("Bulk Schedule")');

      // Date range: 3 days span
      const today = new Date();
      const future = new Date();
      future.setDate(today.getDate() + 2);
      const format = (n) => String(n).padStart(2, '0');
      const todayStr = `${today.getFullYear()}-${format(today.getMonth() + 1)}-${format(today.getDate())}`;
      const futureStr = `${future.getFullYear()}-${format(future.getMonth() + 1)}-${format(future.getDate())}`;

      await page.locator('input[type="date"]').first().fill(todayStr);
      await page.locator('input[type="date"]').nth(1).fill(futureStr);
      await page.locator('input[type="number"]').first().fill('10'); // Max limit of 10 posts per day

      await page.click('button:has-text("Generate Preview")');
      await page.click('button:has-text("Confirm & Save")');

      // Polling database check to wait for all 30 writes to finish
      let updatedDb;
      let scheduledCount = 0;
      for (let i = 0; i < 40; i++) {
        updatedDb = await windowNodeGetDb();
        scheduledCount = updatedDb.queue_jobs.filter(j => j.status === 'scheduled').length;
        if (scheduledCount === 30) break;
        await page.waitForTimeout(150);
      }

      if (scheduledCount !== 30) {
        throw new Error(`Expected 30 bulk scheduled jobs, got ${scheduledCount}`);
      }
    }
  }
];
