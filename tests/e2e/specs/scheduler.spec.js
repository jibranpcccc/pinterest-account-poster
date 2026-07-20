module.exports = [
  {
    name: "T1_COV_1: Scheduler status is active",
    fn: async ({ page, dbHelper }) => {
      await page.click('#e2e-nav-scheduler');
      const badge = page.locator('#e2e-scheduler-active-badge');
      await expect(badge).toContainText('ACTIVE');
    }
  },
  {
    name: "T1_COV_2: Scheduler queries database and finds scheduled jobs",
    fn: async ({ page, dbHelper }) => {
      // Seed a scheduled job
      const db = await windowNodeGetDb();
      db.queue_jobs.push({
        id: 'job-t1-cov2',
        accountId: 'acc-1',
        title: 'Query Check Pin',
        status: 'scheduled',
        scheduledDate: '2026-07-16',
        scheduledTime: '12:00:00',
        createdAt: new Date().toISOString()
      });
      await windowNodeSaveDb(db);

      // Reload page and check UI list
      await page.click('#e2e-nav-scheduler');
      const count = page.locator('#e2e-queue-count');
      await expect(count).toContainText('1');
    }
  },
  {
    name: "T1_COV_3: Scheduler fires due jobs in the past",
    fn: async ({ page, dbHelper }) => {
      const db = await windowNodeGetDb();
      db.queue_jobs.push({
        id: 'job-t1-cov3',
        accountId: 'acc-1',
        title: 'Past Pin',
        status: 'scheduled',
        scheduledDate: '2026-01-01',
        scheduledTime: '09:00:00',
        createdAt: new Date().toISOString()
      });
      await windowNodeSaveDb(db);

      await page.click('#e2e-nav-scheduler');
      await page.click('#e2e-btn-tick');

      // Check results
      const res = page.locator('#e2e-tick-result');
      await expect(res).toContainText('Fired 1 due jobs');
    }
  },
  {
    name: "T1_COV_4: Scheduler updates fired job status to completed",
    fn: async ({ page, dbHelper }) => {
      const db = await windowNodeGetDb();
      db.queue_jobs.push({
        id: 'job-t1-cov4',
        accountId: 'acc-1',
        title: 'Status Update Pin',
        status: 'scheduled',
        scheduledDate: '2026-01-01',
        scheduledTime: '09:00:00',
        createdAt: new Date().toISOString()
      });
      await windowNodeSaveDb(db);

      await page.click('#e2e-nav-scheduler');
      await page.click('#e2e-btn-tick');

      const finalDb = await windowNodeGetDb();
      const job = finalDb.queue_jobs.find(j => j.id === 'job-t1-cov4');
      if (job.status !== 'completed') {
        throw new Error(`Expected status completed, got ${job.status}`);
      }
    }
  },
  {
    name: "T1_COV_5: Scheduler generates success notification on execution",
    fn: async ({ page, dbHelper }) => {
      const db = await windowNodeGetDb();
      db.queue_jobs.push({
        id: 'job-t1-cov5',
        accountId: 'acc-1',
        title: 'Notification Pin',
        status: 'scheduled',
        scheduledDate: '2026-01-01',
        scheduledTime: '09:00:00',
        createdAt: new Date().toISOString()
      });
      await windowNodeSaveDb(db);

      await page.click('#e2e-nav-scheduler');
      await page.click('#e2e-btn-tick');

      const notif = page.locator('#e2e-notif-message');
      await expect(notif).toContainText('Scheduler Fired: Successfully processed 1');
    }
  },
  {
    name: "T1_BND_1: Scheduler does NOT fire jobs scheduled in the future",
    fn: async ({ page, dbHelper }) => {
      const db = await windowNodeGetDb();
      db.queue_jobs.push({
        id: 'job-t1-bnd1',
        accountId: 'acc-1',
        title: 'Future Pin',
        status: 'scheduled',
        scheduledDate: '2030-01-01',
        scheduledTime: '09:00:00',
        createdAt: new Date().toISOString()
      });
      await windowNodeSaveDb(db);

      await page.click('#e2e-nav-scheduler');
      await page.click('#e2e-btn-tick');

      const res = page.locator('#e2e-tick-result');
      await expect(res).toContainText('Fired 0 due jobs');

      const finalDb = await windowNodeGetDb();
      const job = finalDb.queue_jobs.find(j => j.id === 'job-t1-bnd1');
      if (job.status !== 'scheduled') {
        throw new Error(`Expected job to remain scheduled, got ${job.status}`);
      }
    }
  },
  {
    name: "T1_BND_2: Scheduler fires jobs scheduled precisely now",
    fn: async ({ page, dbHelper }) => {
      const now = new Date();
      const format = (n) => String(n).padStart(2, '0');
      const dateStr = `${now.getFullYear()}-${format(now.getMonth() + 1)}-${format(now.getDate())}`;
      const timeStr = `${format(now.getHours())}:${format(now.getMinutes())}:00`;

      const db = await windowNodeGetDb();
      db.queue_jobs.push({
        id: 'job-t1-bnd2',
        accountId: 'acc-1',
        title: 'Precisely Now Pin',
        status: 'scheduled',
        scheduledDate: dateStr,
        scheduledTime: timeStr,
        createdAt: new Date().toISOString()
      });
      await windowNodeSaveDb(db);

      await page.click('#e2e-nav-scheduler');
      await page.click('#e2e-btn-tick');

      const res = page.locator('#e2e-tick-result');
      await expect(res).toContainText('Fired 1 due jobs');
    }
  },
  {
    name: "T1_BND_3: Scheduler ignores pending jobs (status is not scheduled)",
    fn: async ({ page, dbHelper }) => {
      const db = await windowNodeGetDb();
      db.queue_jobs.push({
        id: 'job-t1-bnd3',
        accountId: 'acc-1',
        title: 'Pending Pin',
        status: 'pending',
        scheduledDate: '2026-01-01',
        scheduledTime: '09:00:00',
        createdAt: new Date().toISOString()
      });
      await windowNodeSaveDb(db);

      await page.click('#e2e-nav-scheduler');
      await page.click('#e2e-btn-tick');

      const res = page.locator('#e2e-tick-result');
      await expect(res).toContainText('Fired 0 due jobs');
    }
  },
  {
    name: "T1_BND_4: Scheduler handles invalid date/time gracefully",
    fn: async ({ page, dbHelper }) => {
      const db = await windowNodeGetDb();
      db.queue_jobs.push({
        id: 'job-t1-bnd4',
        accountId: 'acc-1',
        title: 'Bad Date Pin',
        status: 'scheduled',
        scheduledDate: 'invalid-date',
        scheduledTime: 'invalid-time',
        createdAt: new Date().toISOString()
      });
      await windowNodeSaveDb(db);

      await page.click('#e2e-nav-scheduler');
      await page.click('#e2e-btn-tick');

      const res = page.locator('#e2e-tick-result');
      await expect(res).toContainText('Fired 0 due jobs');
    }
  },
  {
    name: "T1_BND_5: Scheduler fires multiple due jobs at the same time",
    fn: async ({ page, dbHelper }) => {
      const db = await windowNodeGetDb();
      db.queue_jobs.push(
        {
          id: 'job-t1-bnd5-1',
          accountId: 'acc-1',
          title: 'Multiple 1',
          status: 'scheduled',
          scheduledDate: '2026-01-01',
          scheduledTime: '09:00:00',
          createdAt: new Date().toISOString()
        },
        {
          id: 'job-t1-bnd5-2',
          accountId: 'acc-1',
          title: 'Multiple 2',
          status: 'scheduled',
          scheduledDate: '2026-01-01',
          scheduledTime: '09:00:00',
          createdAt: new Date().toISOString()
        }
      );
      await windowNodeSaveDb(db);

      await page.click('#e2e-nav-scheduler');
      await page.click('#e2e-btn-tick');

      const res = page.locator('#e2e-tick-result');
      await expect(res).toContainText('Fired 2 due jobs');
    }
  }
];
