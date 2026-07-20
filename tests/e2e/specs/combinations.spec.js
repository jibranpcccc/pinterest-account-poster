module.exports = [
  {
    name: "T3_COMBO_1: Auto-start enabled + bulk creation inserts correct scheduled entries",
    fn: async ({ page, dbHelper }) => {
      await page.click('#e2e-nav-scheduler');
      
      // 1. Enable autostart
      await page.check('#e2e-autostart-toggle');
      
      // 2. Generate bulk
      await page.fill('#e2e-bulk-count', '3');
      await page.click('#e2e-btn-create-bulk');

      const db = await windowNodeGetDb();
      const autostartSetting = db.settings.find(s => s.key === 'autoStart');
      const scheduledCount = db.queue_jobs.filter(j => j.status === 'scheduled').length;

      if (!autostartSetting || autostartSetting.value !== 'true') {
        throw new Error('Expected autoStart setting to be true');
      }
      if (scheduledCount !== 3) {
        throw new Error(`Expected 3 scheduled jobs, got ${scheduledCount}`);
      }
    }
  },
  {
    name: "T3_COMBO_2: Bulk generate 5 items -> change one date -> run scheduler tick -> check status",
    fn: async ({ page, dbHelper }) => {
      await page.click('#e2e-nav-scheduler');
      
      // 1. Bulk generate 5
      await page.fill('#e2e-bulk-count', '5');
      await page.click('#e2e-btn-create-bulk');

      const dbAfterGen = await windowNodeGetDb();
      const scheduledJobs = dbAfterGen.queue_jobs.filter(j => j.status === 'scheduled');
      
      // 2. Set one job's date to the past, and force all other jobs to a safe future date
      for (let i = 0; i < scheduledJobs.length; i++) {
        if (i === 0) {
          scheduledJobs[i].scheduledDate = '2026-01-01';
          scheduledJobs[i].scheduledTime = '09:00:00';
        } else {
          scheduledJobs[i].scheduledDate = '2030-01-01';
          scheduledJobs[i].scheduledTime = '12:00:00';
        }
      }
      const firstJobId = scheduledJobs[0].id;
      await windowNodeSaveDb(dbAfterGen);

      // 3. Trigger tick
      await page.click('#e2e-btn-tick');

      const finalDb = await windowNodeGetDb();
      const updatedJob = finalDb.queue_jobs.find(j => j.id === firstJobId);
      const remainingScheduled = finalDb.queue_jobs.filter(j => j.status === 'scheduled').length;

      if (updatedJob.status !== 'completed') {
        throw new Error(`Expected updated job to be completed, got ${updatedJob.status}`);
      }
      // Since they are scheduled into the future, the other 4 should remain scheduled
      if (remainingScheduled !== 4) {
        throw new Error(`Expected 4 remaining scheduled jobs, got ${remainingScheduled}`);
      }
    }
  },
  {
    name: "T3_COMBO_3: Clear queue -> bulk create 3 items -> verify scheduler status has count of 3",
    fn: async ({ page, dbHelper }) => {
      await page.click('#e2e-nav-scheduler');
      
      // 1. Clear scheduled
      await page.click('#e2e-btn-clear-scheduled');

      // 2. Bulk create 3
      await page.fill('#e2e-bulk-count', '3');
      await page.click('#e2e-btn-create-bulk');

      // 3. Verify status count matches
      const schedulerStatus = await page.evaluate(() => window.electronAPI.getSchedulerStatus());
      if (schedulerStatus.pendingCount !== 3) {
        throw new Error(`Expected scheduler pendingCount to be 3, got ${schedulerStatus.pendingCount}`);
      }
    }
  },
  {
    name: "T3_COMBO_4: Tray minimization status is retained while bulk schedule is generated",
    fn: async ({ page, dbHelper }) => {
      await page.click('#e2e-nav-scheduler');
      
      // 1. Minimize to tray
      await page.click('#e2e-btn-minimize');

      // 2. Bulk generate
      await page.fill('#e2e-bulk-count', '2');
      await page.click('#e2e-btn-create-bulk');

      // 3. Verify tray minimization status is still minimized
      const trayStatus = page.locator('#e2e-tray-status');
      await expect(trayStatus).toContainText('minimized');
    }
  },
  {
    name: "T3_COMBO_5: Double auto-start toggle change -> trigger scheduler tick -> verify setting persistence",
    fn: async ({ page, dbHelper }) => {
      await page.click('#e2e-nav-scheduler');
      
      // 1. Toggle twice
      await page.check('#e2e-autostart-toggle');
      await page.uncheck('#e2e-autostart-toggle');
      
      // 2. Seed a due job
      const db = await windowNodeGetDb();
      db.queue_jobs.push({
        id: 'job-combo-5',
        accountId: 'acc-1',
        title: 'Combo 5 Job',
        status: 'scheduled',
        scheduledDate: '2026-01-01',
        scheduledTime: '09:00:00',
        createdAt: new Date().toISOString()
      });
      await windowNodeSaveDb(db);

      // 3. Trigger tick
      await page.click('#e2e-btn-tick');

      // 4. Verify settings and job status
      const finalDb = await windowNodeGetDb();
      const autostart = finalDb.settings.find(s => s.key === 'autoStart');
      const job = finalDb.queue_jobs.find(j => j.id === 'job-combo-5');

      if (autostart && autostart.value === 'true') {
        throw new Error('Expected autoStart to be false');
      }
      if (job.status !== 'completed') {
        throw new Error('Expected job to be completed');
      }
    }
  }
];
