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
      const chromiumDir = entries.find(e => e.startsWith('chromium-'));
      if (chromiumDir) {
        // Try chrome-win (older Playwright) or chrome-win64 (newer Playwright)
        let exePath = path.join(browsersDir, chromiumDir, 'chrome-win64', 'chrome.exe');
        if (!fs.existsSync(exePath)) {
          exePath = path.join(browsersDir, chromiumDir, 'chrome-win', 'chrome.exe');
        }
        
        if (fs.existsSync(exePath)) {
          console.log(`[Packaged] Using bundled Chromium: ${exePath}`);
          return exePath;
        }
      }
    }
    console.warn('[Packaged] Bundled Chromium not found, falling back to Playwright default.');
  }

  // Dev mode: let Playwright find its own cached browser automatically
  return undefined;
}
