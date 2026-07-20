module.exports = [
  {
    name: "T4_COV_1: Display correct scheduled count badge in the queue list header",
    fn: async ({ page, dbHelper }) => {
      const db = await windowNodeGetDb();
      db.queue_jobs.push({
        id: 'job-t4-cov1',
        accountId: 'acc-1',
        title: 'Count Badge Pin',
        status: 'scheduled',
        scheduledDate: '2026-07-16',
        scheduledTime: '12:00:00',
        createdAt: new Date().toISOString()
      });
      await windowNodeSaveDb(db);

      await page.click('#e2e-nav-scheduler');
      const countBadge = page.locator('#e2e-queue-count');
      await expect(countBadge).toContainText('1');
    }
  },
  {
    name: "T4_COV_2: UI table correctly renders title, date, time for scheduled pins",
    fn: async ({ page, dbHelper }) => {
      const db = await windowNodeGetDb();
      db.queue_jobs.push({
        id: 'job-t4-cov2',
        accountId: 'acc-1',
        title: 'Render Test Pin',
        status: 'scheduled',
        scheduledDate: '2026-07-16',
        scheduledTime: '15:30:00',
        createdAt: new Date().toISOString()
      });
      await windowNodeSaveDb(db);

      await page.click('#e2e-nav-scheduler');
      
      const row = page.locator('tr[data-id="job-t4-cov2"]');
      await expect(row).toContainText('Render Test Pin');
      await expect(row).toContainText('2026-07-16');
      await expect(row).toContainText('15:30:00');
    }
  },
  {
    name: "T4_COV_3: Canceling schedule from list removes it from queue",
    fn: async ({ page, dbHelper }) => {
      const db = await windowNodeGetDb();
      db.queue_jobs.push({
        id: 'job-t4-cov3',
        accountId: 'acc-1',
        title: 'Cancel Pin',
        status: 'scheduled',
        scheduledDate: '2026-07-16',
        scheduledTime: '12:00:00',
        createdAt: new Date().toISOString()
      });
      await windowNodeSaveDb(db);

      await page.click('#e2e-nav-scheduler');
      
      const cancelBtn = page.locator('[data-job-id="job-t4-cov3"].e2e-btn-delete-job');
      await cancelBtn.click();

      const finalDb = await windowNodeGetDb();
      const job = finalDb.queue_jobs.find(j => j.id === 'job-t4-cov3');
      if (job) throw new Error('Expected job to be deleted');
    }
  },
  {
    name: "T4_COV_4: Editing date prompt updates job scheduledDate",
    fn: async ({ page, dbHelper }) => {
      const db = await windowNodeGetDb();
      db.queue_jobs.push({
        id: 'job-t4-cov4',
        accountId: 'acc-1',
        title: 'Edit Date Pin',
        status: 'scheduled',
        scheduledDate: '2026-07-16',
        scheduledTime: '12:00:00',
        createdAt: new Date().toISOString()
      });
      await windowNodeSaveDb(db);

      await page.click('#e2e-nav-scheduler');

      // Setup window prompt dialog stub to handle both date and time prompts
      let counter = 0;
      page.on('dialog', async dialog => {
        if (counter === 0) {
          await dialog.accept('2026-08-20');
        } else {
          await dialog.accept('12:00:00');
        }
        counter++;
      });

      const editBtn = page.locator('[data-job-id="job-t4-cov4"].e2e-btn-edit-job');
      await editBtn.click();

      const finalDb = await windowNodeGetDb();
      const job = finalDb.queue_jobs.find(j => j.id === 'job-t4-cov4');
      if (job.scheduledDate !== '2026-08-20') {
        throw new Error(`Expected scheduledDate to be 2026-08-20, got ${job.scheduledDate}`);
      }
    }
  },
  {
    name: "T4_COV_5: Editing time prompt updates job scheduledTime",
    fn: async ({ page, dbHelper }) => {
      const db = await windowNodeGetDb();
      db.queue_jobs.push({
        id: 'job-t4-cov5',
        accountId: 'acc-1',
        title: 'Edit Time Pin',
        status: 'scheduled',
        scheduledDate: '2026-07-16',
        scheduledTime: '12:00:00',
        createdAt: new Date().toISOString()
      });
      await windowNodeSaveDb(db);

      await page.click('#e2e-nav-scheduler');

      let counter = 0;
      page.on('dialog', async dialog => {
        if (counter === 0) {
          await dialog.accept('2026-07-16'); // keep same date
        } else {
          await dialog.accept('22:15:00'); // new time
        }
        counter++;
      });

      const editBtn = page.locator('[data-job-id="job-t4-cov5"].e2e-btn-edit-job');
      await editBtn.click();

      const finalDb = await windowNodeGetDb();
      const job = finalDb.queue_jobs.find(j => j.id === 'job-t4-cov5');
      if (job.scheduledTime !== '22:15:00') {
        throw new Error(`Expected scheduledTime to be 22:15:00, got ${job.scheduledTime}`);
      }
    }
  },
  {
    name: "T4_BND_1: Clear scheduled button deletes ONLY scheduled pins",
    fn: async ({ page, dbHelper }) => {
      const db = await windowNodeGetDb();
      db.queue_jobs.push(
        { id: 'job-t4-bnd1-1', accountId: 'acc-1', title: 'Sched 1', status: 'scheduled', scheduledDate: '2026-07-16', scheduledTime: '12:00', createdAt: new Date().toISOString() },
        { id: 'job-t4-bnd1-2', accountId: 'acc-1', title: 'Pend 1', status: 'pending', createdAt: new Date().toISOString() }
      );
      await windowNodeSaveDb(db);

      await page.click('#e2e-nav-scheduler');
      await page.click('#e2e-btn-clear-scheduled');

      let finalDb;
      let schedCount = 1;
      let pendCount = 0;
      for (let i = 0; i < 10; i++) {
        finalDb = await windowNodeGetDb();
        schedCount = finalDb.queue_jobs.filter(j => j.status === 'scheduled').length;
        pendCount = finalDb.queue_jobs.filter(j => j.status === 'pending').length;
        if (schedCount === 0) break;
        await page.waitForTimeout(100);
      }

      if (schedCount !== 0) throw new Error(`Expected 0 scheduled pins, got ${schedCount}`);
      if (pendCount !== 1) throw new Error(`Expected 1 pending pin to remain, got ${pendCount}`);
    }
  },
  {
    name: "T4_BND_2: Edit action with empty date prompt cancels modification gracefully",
    fn: async ({ page, dbHelper }) => {
      const db = await windowNodeGetDb();
      db.queue_jobs.push({
        id: 'job-t4-bnd2',
        accountId: 'acc-1',
        title: 'Cancel Edit Date',
        status: 'scheduled',
        scheduledDate: '2026-07-16',
        scheduledTime: '12:00:00',
        createdAt: new Date().toISOString()
      });
      await windowNodeSaveDb(db);

      await page.click('#e2e-nav-scheduler');
      page.once('dialog', async dialog => {
        await dialog.dismiss();
      });

      const editBtn = page.locator('[data-job-id="job-t4-bnd2"].e2e-btn-edit-job');
      await editBtn.click();

      const finalDb = await windowNodeGetDb();
      const job = finalDb.queue_jobs.find(j => j.id === 'job-t4-bnd2');
      if (job.scheduledDate !== '2026-07-16') {
        throw new Error('Expected date to remain unchanged');
      }
    }
  },
  {
    name: "T4_BND_3: Edit action with empty time prompt cancels modification gracefully",
    fn: async ({ page, dbHelper }) => {
      const db = await windowNodeGetDb();
      db.queue_jobs.push({
        id: 'job-t4-bnd3',
        accountId: 'acc-1',
        title: 'Cancel Edit Time',
        status: 'scheduled',
        scheduledDate: '2026-07-16',
        scheduledTime: '12:00:00',
        createdAt: new Date().toISOString()
      });
      await windowNodeSaveDb(db);

      await page.click('#e2e-nav-scheduler');
      
      let step = 0;
      page.on('dialog', async dialog => {
        if (step === 0) {
          await dialog.accept('2026-07-16');
        } else {
          await dialog.dismiss();
        }
        step++;
      });

      const editBtn = page.locator('[data-job-id="job-t4-bnd3"].e2e-btn-edit-job');
      await editBtn.click();

      const finalDb = await windowNodeGetDb();
      const job = finalDb.queue_jobs.find(j => j.id === 'job-t4-bnd3');
      if (job.scheduledTime !== '12:00:00') {
        throw new Error('Expected time to remain unchanged');
      }
    }
  },
  {
    name: "T4_BND_4: Table display handles empty/missing title by rendering Untitled",
    fn: async ({ page, dbHelper }) => {
      const db = await windowNodeGetDb();
      db.queue_jobs.push({
        id: 'job-t4-bnd4',
        accountId: 'acc-1',
        title: '', // empty title
        status: 'scheduled',
        scheduledDate: '2026-07-16',
        scheduledTime: '12:00:00',
        createdAt: new Date().toISOString()
      });
      await windowNodeSaveDb(db);

      await page.click('#e2e-nav-scheduler');
      
      const row = page.locator('tr[data-id="job-t4-bnd4"]');
      await expect(row).toContainText('Untitled');
    }
  },
  {
    name: "T4_BND_5: Deleting job updates the UI count badge in real-time",
    fn: async ({ page, dbHelper }) => {
      const db = await windowNodeGetDb();
      db.queue_jobs.push({
        id: 'job-t4-bnd5',
        accountId: 'acc-1',
        title: 'Realtime Badge Pin',
        status: 'scheduled',
        scheduledDate: '2026-07-16',
        scheduledTime: '12:00:00',
        createdAt: new Date().toISOString()
      });
      await windowNodeSaveDb(db);

      await page.click('#e2e-nav-scheduler');
      await expect(page.locator('#e2e-queue-count')).toContainText('1');

      await page.click('[data-job-id="job-t4-bnd5"].e2e-btn-delete-job');
      await expect(page.locator('#e2e-queue-count')).toContainText('0');
    }
  }
];
