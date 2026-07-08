import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Resolves the correct Chromium executable path for both:
 * - Development mode: uses Playwright's locally cached browser
 * - Packaged .exe mode: uses the browser bundled in extraResources
 */
export function getChromiumExecutablePath(): string | undefined {
  const isPackaged = app.isPackaged;

  if (isPackaged) {
    // When packaged, Chromium is in resources/playwright-browsers/chromium-*/chrome-win/chrome.exe
    const resourcesPath = process.resourcesPath;
    const browsersDir = path.join(resourcesPath, 'playwright-browsers');

    if (fs.existsSync(browsersDir)) {
      const entries = fs.readdirSync(browsersDir);
      const chromiumDirs = entries.filter(e => e.startsWith('chromium-'));
      for (const chromiumDir of chromiumDirs) {
        let exePath = path.join(browsersDir, chromiumDir, 'chrome-win64', 'chrome.exe');
        if (!fs.existsSync(exePath)) {
          exePath = path.join(browsersDir, chromiumDir, 'chrome-win', 'chrome.exe');
        }
        
        if (fs.existsSync(exePath)) {
          console.log(`[Packaged] Using bundled Chromium: ${exePath}`);
          return exePath;
        }
      }
      throw new Error(`Bundled Chromium not found! Checked in: ${browsersDir}. Found entries: ${entries.join(', ')}`);
    } else {
      throw new Error(`Playwright browsers directory not found at: ${browsersDir}`);
    }
  }

  // Dev mode: let Playwright find its own cached browser automatically
  return undefined;
}
