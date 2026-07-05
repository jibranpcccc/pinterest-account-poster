import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Comprehensive browser fingerprint profile for anti-detection.
 * Each account gets a unique, persistent fingerprint that makes it
 * appear as a completely different device to Pinterest.
 */
export interface BrowserFingerprint {
  // Core identity
  userAgent: string;
  platform: string;
  vendor: string;
  oscpu: string;
  
  // Display
  screenWidth: number;
  screenHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  colorDepth: number;
  pixelRatio: number;
  
  // Hardware
  hardwareConcurrency: number;
  deviceMemory: number;
  maxTouchPoints: number;
  
  // Locale & Time
  language: string;
  languages: string[];
  timezoneId: string;
  timezoneOffset: number;
  
  // WebGL
  webglVendor: string;
  webglRenderer: string;
  
  // Network
  connectionType: string;
  downlink: number;
  rtt: number;
  
  // Misc
  doNotTrack: string | null;
  cookieEnabled: boolean;
  pdfViewerEnabled: boolean;
  
  // Canvas noise seed (for subtle canvas fingerprint variation)
  canvasNoiseSeed: number;
  
  // Profile metadata
  profileName: string;
  createdAt: string;
}

/**
 * 12 realistic device profiles covering Windows 10/11, macOS, and Linux.
 * Each has a unique combination of OS, browser version, screen size,
 * hardware specs, timezone, and language.
 */
const DEVICE_PROFILES: Omit<BrowserFingerprint, 'canvasNoiseSeed' | 'createdAt'>[] = [
  // ── Windows 11, Chrome 126, 1080p, US East ──
  {
    profileName: 'Win11-Chrome126-FHD',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    platform: 'Win32',
    vendor: 'Google Inc.',
    oscpu: '',
    screenWidth: 1920, screenHeight: 1080, viewportWidth: 1903, viewportHeight: 969,
    colorDepth: 24, pixelRatio: 1,
    hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 0,
    language: 'en-US', languages: ['en-US', 'en'],
    timezoneId: 'America/New_York', timezoneOffset: 240,
    webglVendor: 'Google Inc. (NVIDIA)',
    webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    connectionType: '4g', downlink: 10, rtt: 50,
    doNotTrack: null, cookieEnabled: true, pdfViewerEnabled: true,
  },
  // ── macOS Sonoma, Chrome 125, Retina ──
  {
    profileName: 'macOS-Chrome125-Retina',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    platform: 'MacIntel',
    vendor: 'Google Inc.',
    oscpu: '',
    screenWidth: 2560, screenHeight: 1440, viewportWidth: 2544, viewportHeight: 1329,
    colorDepth: 30, pixelRatio: 2,
    hardwareConcurrency: 10, deviceMemory: 16, maxTouchPoints: 0,
    language: 'en-GB', languages: ['en-GB', 'en-US', 'en'],
    timezoneId: 'Europe/London', timezoneOffset: -60,
    webglVendor: 'Google Inc. (Apple)',
    webglRenderer: 'ANGLE (Apple, Apple M2 Pro, OpenGL 4.1)',
    connectionType: '4g', downlink: 25, rtt: 25,
    doNotTrack: '1', cookieEnabled: true, pdfViewerEnabled: true,
  },
  // ── Windows 10, Chrome 124, 768p Laptop ──
  {
    profileName: 'Win10-Chrome124-768p',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    platform: 'Win32',
    vendor: 'Google Inc.',
    oscpu: '',
    screenWidth: 1366, screenHeight: 768, viewportWidth: 1349, viewportHeight: 657,
    colorDepth: 24, pixelRatio: 1,
    hardwareConcurrency: 4, deviceMemory: 4, maxTouchPoints: 0,
    language: 'en-US', languages: ['en-US'],
    timezoneId: 'America/Chicago', timezoneOffset: 300,
    webglVendor: 'Google Inc. (Intel)',
    webglRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    connectionType: 'wifi', downlink: 5, rtt: 100,
    doNotTrack: null, cookieEnabled: true, pdfViewerEnabled: true,
  },
  // ── macOS Ventura, Chrome 126, 13" MacBook ──
  {
    profileName: 'macOS-Chrome126-13inch',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    platform: 'MacIntel',
    vendor: 'Google Inc.',
    oscpu: '',
    screenWidth: 2560, screenHeight: 1600, viewportWidth: 2544, viewportHeight: 1489,
    colorDepth: 30, pixelRatio: 2,
    hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 0,
    language: 'en-US', languages: ['en-US', 'en'],
    timezoneId: 'America/Los_Angeles', timezoneOffset: 420,
    webglVendor: 'Google Inc. (Apple)',
    webglRenderer: 'ANGLE (Apple, Apple M1, OpenGL 4.1)',
    connectionType: '4g', downlink: 15, rtt: 50,
    doNotTrack: null, cookieEnabled: true, pdfViewerEnabled: true,
  },
  // ── Windows 11, Chrome 125, 1440p ──
  {
    profileName: 'Win11-Chrome125-QHD',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    platform: 'Win32',
    vendor: 'Google Inc.',
    oscpu: '',
    screenWidth: 2560, screenHeight: 1440, viewportWidth: 2543, viewportHeight: 1329,
    colorDepth: 24, pixelRatio: 1,
    hardwareConcurrency: 12, deviceMemory: 16, maxTouchPoints: 0,
    language: 'en-US', languages: ['en-US', 'en'],
    timezoneId: 'America/Denver', timezoneOffset: 360,
    webglVendor: 'Google Inc. (NVIDIA)',
    webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    connectionType: '4g', downlink: 50, rtt: 25,
    doNotTrack: '1', cookieEnabled: true, pdfViewerEnabled: true,
  },
  // ── Linux Ubuntu, Chrome 124 ──
  {
    profileName: 'Linux-Chrome124-FHD',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    platform: 'Linux x86_64',
    vendor: 'Google Inc.',
    oscpu: 'Linux x86_64',
    screenWidth: 1920, screenHeight: 1080, viewportWidth: 1903, viewportHeight: 969,
    colorDepth: 24, pixelRatio: 1,
    hardwareConcurrency: 6, deviceMemory: 8, maxTouchPoints: 0,
    language: 'en-US', languages: ['en-US', 'en'],
    timezoneId: 'Asia/Karachi', timezoneOffset: -300,
    webglVendor: 'Google Inc. (Mesa)',
    webglRenderer: 'ANGLE (Mesa, llvmpipe (LLVM 15.0.7, 256 bits), OpenGL 4.5)',
    connectionType: '4g', downlink: 8, rtt: 75,
    doNotTrack: null, cookieEnabled: true, pdfViewerEnabled: true,
  },
  // ── Windows 10, Chrome 123, 900p Office Monitor ──
  {
    profileName: 'Win10-Chrome123-900p',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    platform: 'Win32',
    vendor: 'Google Inc.',
    oscpu: '',
    screenWidth: 1600, screenHeight: 900, viewportWidth: 1583, viewportHeight: 789,
    colorDepth: 24, pixelRatio: 1,
    hardwareConcurrency: 4, deviceMemory: 4, maxTouchPoints: 0,
    language: 'en-CA', languages: ['en-CA', 'en-US', 'en'],
    timezoneId: 'America/Toronto', timezoneOffset: 240,
    webglVendor: 'Google Inc. (AMD)',
    webglRenderer: 'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    connectionType: 'wifi', downlink: 10, rtt: 50,
    doNotTrack: null, cookieEnabled: true, pdfViewerEnabled: true,
  },
  // ── macOS Monterey, Chrome 124, iMac ──
  {
    profileName: 'macOS-Chrome124-iMac',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    platform: 'MacIntel',
    vendor: 'Google Inc.',
    oscpu: '',
    screenWidth: 4480, screenHeight: 2520, viewportWidth: 2240, viewportHeight: 1209,
    colorDepth: 30, pixelRatio: 2,
    hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 0,
    language: 'en-AU', languages: ['en-AU', 'en'],
    timezoneId: 'Australia/Sydney', timezoneOffset: -600,
    webglVendor: 'Google Inc. (Apple)',
    webglRenderer: 'ANGLE (Apple, Apple M1 Max, OpenGL 4.1)',
    connectionType: '4g', downlink: 20, rtt: 50,
    doNotTrack: '1', cookieEnabled: true, pdfViewerEnabled: true,
  },
  // ── Windows 11, Chrome 126, Surface Pro (HiDPI) ──
  {
    profileName: 'Win11-Chrome126-Surface',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    platform: 'Win32',
    vendor: 'Google Inc.',
    oscpu: '',
    screenWidth: 2736, screenHeight: 1824, viewportWidth: 1368, viewportHeight: 801,
    colorDepth: 24, pixelRatio: 2,
    hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 10,
    language: 'en-US', languages: ['en-US', 'en'],
    timezoneId: 'America/Phoenix', timezoneOffset: 420,
    webglVendor: 'Google Inc. (Intel)',
    webglRenderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    connectionType: 'wifi', downlink: 15, rtt: 50,
    doNotTrack: null, cookieEnabled: true, pdfViewerEnabled: true,
  },
  // ── Windows 10, Chrome 125, Dual Monitor ──
  {
    profileName: 'Win10-Chrome125-DualMon',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    platform: 'Win32',
    vendor: 'Google Inc.',
    oscpu: '',
    screenWidth: 3840, screenHeight: 1080, viewportWidth: 1903, viewportHeight: 969,
    colorDepth: 24, pixelRatio: 1,
    hardwareConcurrency: 16, deviceMemory: 32, maxTouchPoints: 0,
    language: 'en-US', languages: ['en-US'],
    timezoneId: 'America/New_York', timezoneOffset: 240,
    webglVendor: 'Google Inc. (NVIDIA)',
    webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    connectionType: '4g', downlink: 100, rtt: 10,
    doNotTrack: null, cookieEnabled: true, pdfViewerEnabled: true,
  },
  // ── macOS Sonoma, Chrome 126, MacBook Air ──
  {
    profileName: 'macOS-Chrome126-Air',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    platform: 'MacIntel',
    vendor: 'Google Inc.',
    oscpu: '',
    screenWidth: 2560, screenHeight: 1664, viewportWidth: 1470, viewportHeight: 778,
    colorDepth: 30, pixelRatio: 2,
    hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 0,
    language: 'en-IN', languages: ['en-IN', 'en-US', 'en'],
    timezoneId: 'Asia/Kolkata', timezoneOffset: -330,
    webglVendor: 'Google Inc. (Apple)',
    webglRenderer: 'ANGLE (Apple, Apple M2, OpenGL 4.1)',
    connectionType: '4g', downlink: 10, rtt: 75,
    doNotTrack: null, cookieEnabled: true, pdfViewerEnabled: true,
  },
  // ── Linux Fedora, Chrome 126 ──
  {
    profileName: 'Linux-Chrome126-1440p',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    platform: 'Linux x86_64',
    vendor: 'Google Inc.',
    oscpu: 'Linux x86_64',
    screenWidth: 2560, screenHeight: 1440, viewportWidth: 2543, viewportHeight: 1329,
    colorDepth: 24, pixelRatio: 1,
    hardwareConcurrency: 8, deviceMemory: 16, maxTouchPoints: 0,
    language: 'de-DE', languages: ['de-DE', 'en-US', 'en'],
    timezoneId: 'Europe/Berlin', timezoneOffset: -120,
    webglVendor: 'Google Inc. (NVIDIA)',
    webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Ti, OpenGL 4.5)',
    connectionType: '4g', downlink: 20, rtt: 50,
    doNotTrack: '1', cookieEnabled: true, pdfViewerEnabled: true,
  },
];

/**
 * Generates the JavaScript injection script that overrides browser APIs
 * to match the fingerprint profile. This runs before any page content loads.
 */
export function generateInjectionScript(fp: BrowserFingerprint): string {
  return `
    // ═══════════════════════════════════════════════════════════
    // Anti-Detection Fingerprint Injection — ${fp.profileName}
    // ═══════════════════════════════════════════════════════════

    // 1. Navigator Properties Override
    const navigatorOverrides = {
      platform: '${fp.platform}',
      vendor: '${fp.vendor}',
      hardwareConcurrency: ${fp.hardwareConcurrency},
      deviceMemory: ${fp.deviceMemory},
      maxTouchPoints: ${fp.maxTouchPoints},
      language: '${fp.language}',
      languages: ${JSON.stringify(fp.languages)},
      doNotTrack: ${fp.doNotTrack ? `'${fp.doNotTrack}'` : 'null'},
      cookieEnabled: ${fp.cookieEnabled},
      pdfViewerEnabled: ${fp.pdfViewerEnabled},
      userAgent: '${fp.userAgent}',
      appVersion: '${fp.userAgent.replace('Mozilla/', '')}',
    };

    for (const [prop, value] of Object.entries(navigatorOverrides)) {
      try {
        Object.defineProperty(navigator, prop, {
          get: () => value,
          configurable: true,
        });
      } catch (e) {}
    }

    // 2. Screen Properties Override
    const screenOverrides = {
      width: ${fp.screenWidth},
      height: ${fp.screenHeight},
      availWidth: ${fp.screenWidth},
      availHeight: ${fp.screenHeight - 40},
      colorDepth: ${fp.colorDepth},
      pixelDepth: ${fp.colorDepth},
    };

    for (const [prop, value] of Object.entries(screenOverrides)) {
      try {
        Object.defineProperty(screen, prop, {
          get: () => value,
          configurable: true,
        });
      } catch (e) {}
    }

    // 3. Window Properties Override (inner dimensions)
    try {
      Object.defineProperty(window, 'devicePixelRatio', {
        get: () => ${fp.pixelRatio},
        configurable: true,
      });
      Object.defineProperty(window, 'outerWidth', {
        get: () => ${fp.screenWidth},
        configurable: true,
      });
      Object.defineProperty(window, 'outerHeight', {
        get: () => ${fp.screenHeight},
        configurable: true,
      });
    } catch (e) {}

    // 4. WebGL Fingerprint Override
    const getParameterOrig = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(param) {
      const UNMASKED_VENDOR = 0x9245;
      const UNMASKED_RENDERER = 0x9246;
      if (param === UNMASKED_VENDOR) return '${fp.webglVendor}';
      if (param === UNMASKED_RENDERER) return '${fp.webglRenderer}';
      return getParameterOrig.call(this, param);
    };
    
    // Also override WebGL2
    if (typeof WebGL2RenderingContext !== 'undefined') {
      const getParam2Orig = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function(param) {
        const UNMASKED_VENDOR = 0x9245;
        const UNMASKED_RENDERER = 0x9246;
        if (param === UNMASKED_VENDOR) return '${fp.webglVendor}';
        if (param === UNMASKED_RENDERER) return '${fp.webglRenderer}';
        return getParam2Orig.call(this, param);
      };
    }

    // 5. Canvas Fingerprint Noise (adds subtle per-account randomness)
    const canvasNoiseSeed = ${fp.canvasNoiseSeed};
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
      const ctx = this.getContext('2d');
      if (ctx && this.width > 0 && this.height > 0) {
        try {
          const imgData = ctx.getImageData(0, 0, Math.min(this.width, 16), Math.min(this.height, 16));
          for (let i = 0; i < imgData.data.length; i += 4) {
            // Add deterministic noise based on seed and position
            imgData.data[i] = (imgData.data[i] + ((canvasNoiseSeed * (i + 1)) % 3)) & 0xFF;
          }
          ctx.putImageData(imgData, 0, 0);
        } catch (e) {} // SecurityError for cross-origin canvases is expected
      }
      return origToDataURL.call(this, type, quality);
    };

    // 6. Network Information API Override
    if (navigator.connection) {
      try {
        Object.defineProperty(navigator.connection, 'effectiveType', {
          get: () => '${fp.connectionType}',
          configurable: true,
        });
        Object.defineProperty(navigator.connection, 'downlink', {
          get: () => ${fp.downlink},
          configurable: true,
        });
        Object.defineProperty(navigator.connection, 'rtt', {
          get: () => ${fp.rtt},
          configurable: true,
        });
      } catch (e) {}
    }

    // 7. Date/Timezone Override
    const origDateTZ = Intl.DateTimeFormat;
    const tzOverride = '${fp.timezoneId}';
    window.Intl.DateTimeFormat = function(locales, options) {
      options = options || {};
      if (!options.timeZone) options.timeZone = tzOverride;
      return new origDateTZ(locales, options);
    };
    Object.setPrototypeOf(window.Intl.DateTimeFormat, origDateTZ);
    window.Intl.DateTimeFormat.prototype = origDateTZ.prototype;
    window.Intl.DateTimeFormat.supportedLocalesOf = origDateTZ.supportedLocalesOf;

    // 8. Plugins array (Chrome typically shows 5 plugins)
    try {
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          return {
            length: 5,
            0: { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
            1: { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: '' },
            2: { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: '' },
            3: { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: '' },
            4: { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: '' },
            item: function(i) { return this[i]; },
            namedItem: function(name) { for (let i = 0; i < 5; i++) { if (this[i].name === name) return this[i]; } return null; },
            refresh: function() {},
            [Symbol.iterator]: function*() { for (let i = 0; i < 5; i++) yield this[i]; }
          };
        },
        configurable: true,
      });
    } catch (e) {}

    // 9. Remove automation indicators
    try {
      delete navigator.__proto__.webdriver;
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true,
      });
    } catch (e) {}

    // Remove Playwright-specific properties
    try {
      delete window.__playwright;
      delete window.__pw_manual;
    } catch (e) {}

    // 10. Performance.now() timing noise (prevents timing-based fingerprinting)
    const origPerfNow = performance.now.bind(performance);
    performance.now = function() {
      return origPerfNow() + (Math.random() * 0.1);
    };

    console.log('[Fingerprint] Profile loaded: ${fp.profileName}');
  `;
}

/**
 * FingerprintManager: Assigns and persists unique fingerprints per account profile.
 */
export class FingerprintManager {
  /**
   * Get or create a fingerprint for a given profile directory.
   * The fingerprint is stored as fingerprint.json in the profile dir
   * and is consistent across sessions (same account = same device).
   */
  static getOrCreate(profileDir: string, accountIndex?: number): BrowserFingerprint {
    const fpPath = path.join(profileDir, 'fingerprint.json');

    // Load existing fingerprint if it exists
    if (fs.existsSync(fpPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(fpPath, 'utf-8'));
        console.log(`[Fingerprint] Loaded existing profile: ${data.profileName} (${data.platform})`);
        return data as BrowserFingerprint;
      } catch (e) {
        console.warn('[Fingerprint] Failed to read existing fingerprint, creating new one.');
      }
    }

    // Determine which profile to assign
    let profileIndex: number;
    if (accountIndex !== undefined) {
      profileIndex = accountIndex % DEVICE_PROFILES.length;
    } else {
      // Hash the profile directory path to get a deterministic but distributed index
      const hash = crypto.createHash('md5').update(profileDir).digest('hex');
      profileIndex = parseInt(hash.substring(0, 8), 16) % DEVICE_PROFILES.length;
    }

    const baseProfile = DEVICE_PROFILES[profileIndex];
    const canvasNoiseSeed = parseInt(
      crypto.createHash('sha256').update(profileDir + 'canvas').digest('hex').substring(0, 8), 16
    ) % 100000;

    const fingerprint: BrowserFingerprint = {
      ...baseProfile,
      canvasNoiseSeed,
      createdAt: new Date().toISOString(),
    };

    // Persist to profile dir
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }
    fs.writeFileSync(fpPath, JSON.stringify(fingerprint, null, 2), 'utf-8');
    console.log(`[Fingerprint] Created new profile: ${fingerprint.profileName} (${fingerprint.platform}, ${fingerprint.timezoneId})`);

    return fingerprint;
  }

  /**
   * Returns the Playwright launch context options derived from the fingerprint.
   */
  static toLaunchOptions(fp: BrowserFingerprint): Record<string, any> {
    return {
      userAgent: fp.userAgent,
      viewport: { width: fp.viewportWidth, height: fp.viewportHeight },
      locale: fp.language,
      timezoneId: fp.timezoneId,
      colorScheme: 'light' as const,
      deviceScaleFactor: fp.pixelRatio,
      screen: { width: fp.screenWidth, height: fp.screenHeight },
    };
  }

  /**
   * Get a summary string for logging.
   */
  static getSummary(fp: BrowserFingerprint): string {
    const os = fp.platform === 'MacIntel' ? 'macOS' : fp.platform.includes('Linux') ? 'Linux' : 'Windows';
    const chromeVer = fp.userAgent.match(/Chrome\/(\d+)/)?.[1] || '?';
    return `${os} / Chrome ${chromeVer} / ${fp.screenWidth}×${fp.screenHeight} / ${fp.timezoneId} / ${fp.hardwareConcurrency} cores / ${fp.deviceMemory}GB`;
  }
}
