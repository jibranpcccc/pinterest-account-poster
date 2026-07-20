module.exports = [
  {
    name: "T2_COV_1: Auto-start registry setting defaults to disabled",
    fn: async ({ page, dbHelper }) => {
      await page.click('#e2e-nav-scheduler');
      const toggle = page.locator('#e2e-autostart-toggle');
      await expect(toggle).not.toBeChecked();

      const status = page.locator('#e2e-autostart-status');
      await expect(status).toContainText('DISABLED');
    }
  },
  {
    name: "T2_COV_2: Toggling auto-start updates setting in database to true",
    fn: async ({ page, dbHelper }) => {
      await page.click('#e2e-nav-scheduler');
      await page.check('#e2e-autostart-toggle');

      const db = await windowNodeGetDb();
      const setting = db.settings.find(s => s.key === 'autoStart');
      if (!setting || setting.value !== 'true') {
        throw new Error('Expected autoStart setting to be true in database');
      }
    }
  },
  {
    name: "T2_COV_3: Disabling auto-start updates setting in database to false",
    fn: async ({ page, dbHelper }) => {
      await page.click('#e2e-nav-scheduler');
      await page.check('#e2e-autostart-toggle'); // Enable first
      await page.uncheck('#e2e-autostart-toggle'); // Disable

      const db = await windowNodeGetDb();
      const setting = db.settings.find(s => s.key === 'autoStart');
      if (setting && setting.value === 'true') {
        throw new Error('Expected autoStart setting to be false in database');
      }
    }
  },
  {
    name: "T2_COV_4: Minimizing to tray hides/minimizes app state",
    fn: async ({ page, dbHelper }) => {
      await page.click('#e2e-nav-scheduler');
      await page.click('#e2e-btn-minimize');

      const trayStatus = page.locator('#e2e-tray-status');
      await expect(trayStatus).toContainText('minimized');
    }
  },
  {
    name: "T2_COV_5: Restoring from tray brings app back to regular window state",
    fn: async ({ page, dbHelper }) => {
      await page.click('#e2e-nav-scheduler');
      await page.click('#e2e-btn-minimize');
      await page.click('#e2e-btn-restore');

      const trayStatus = page.locator('#e2e-tray-status');
      await expect(trayStatus).toContainText('window');
    }
  },
  {
    name: "T2_BND_1: Auto-start state persists across page reload",
    fn: async ({ page, dbHelper }) => {
      await page.click('#e2e-nav-scheduler');
      await page.check('#e2e-autostart-toggle');

      // Reload the page
      await page.reload();
      await page.click('#e2e-nav-scheduler');

      const toggle = page.locator('#e2e-autostart-toggle');
      await expect(toggle).toBeChecked();

      const status = page.locator('#e2e-autostart-status');
      await expect(status).toContainText('ENABLED');
    }
  },
  {
    name: "T2_BND_2: Toggling auto-start triggers desktop notification",
    fn: async ({ page, dbHelper }) => {
      await page.click('#e2e-nav-scheduler');
      await page.check('#e2e-autostart-toggle');

      const notif = page.locator('#e2e-notif-message');
      await expect(notif).toContainText('Auto-Start Setting Updated: Registry auto-start has been enabled');
    }
  },
  {
    name: "T2_BND_3: Double minimizing to tray handles gracefully",
    fn: async ({ page, dbHelper }) => {
      await page.click('#e2e-nav-scheduler');
      await page.click('#e2e-btn-minimize');
      await page.click('#e2e-btn-minimize');

      const trayStatus = page.locator('#e2e-tray-status');
      await expect(trayStatus).toContainText('minimized');
    }
  },
  {
    name: "T2_BND_4: Restoring from tray when already in window state handles safely",
    fn: async ({ page, dbHelper }) => {
      await page.click('#e2e-nav-scheduler');
      await page.click('#e2e-btn-restore');

      const trayStatus = page.locator('#e2e-tray-status');
      await expect(trayStatus).toContainText('window');
    }
  },
  {
    name: "T2_BND_5: Toggling auto-start on empty database runs without errors",
    fn: async ({ page, dbHelper }) => {
      // Clear database to simulate empty DB state
      await dbHelper.clear();
      await dbHelper.seed({ accounts: [], settings: [] });

      await page.reload();
      await page.click('#e2e-nav-scheduler');
      await page.check('#e2e-autostart-toggle');

      const status = page.locator('#e2e-autostart-status');
      await expect(status).toContainText('ENABLED');
    }
  }
];
