import { app, BrowserWindow, ipcMain, shell, protocol, clipboard, dialog, Tray, Menu } from 'electron';

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('⚠️ Another instance of Pinterest Pin Publisher is already running. Quitting.');
  app.quit();
  process.exit(0);
}

if (process.env.TEST_USER_DATA_DIR) {
  app.setPath('userData', process.env.TEST_USER_DATA_DIR);
}

import AdmZip from 'adm-zip';
import * as path from 'path';
import * as fs from 'fs';
import { DbManager } from './database/db';
import { setupSecurity } from './security';
import { PublisherAdapter } from './publisher/publisherAdapter';
import { OpenCodeProvider } from './ai/openCodeProvider';
import { AnalyticsFetcher } from './publisher/analyticsFetcher';
import { RepinExecutor } from './publisher/repinExecutor';
import { Account, Board, Draft, QueueJob } from './types';

let tray: Tray | null = null;
let isQuitting = false;


// ===== Auto-Pilot Fleet Engine State =====
let isFleetAutoPilotEnabled = false;
let isFleetCurrentlyRunningAJob = false;
let fleetTimeout: NodeJS.Timeout | null = null;

async function runFleetEngine() {
  if (!isFleetAutoPilotEnabled || isFleetCurrentlyRunningAJob) return;
  if (!dbManager) return;

  try {
    const pendingJobs = await dbManager.query<any>("SELECT * FROM repin_jobs WHERE status = 'pending' ORDER BY createdAt ASC LIMIT 1");
    if (pendingJobs.length > 0) {
      isFleetCurrentlyRunningAJob = true;
      const job = pendingJobs[0];
      
      const accounts = await dbManager.query<Account>("SELECT * FROM accounts WHERE id = ?", [job.accountId]);
      if (accounts.length > 0) {
        const executor = new RepinExecutor();
        
        // Notify UI about fleet activity
        mainWindow?.webContents.send('fleet:log', `[FLEET] Starting Auto-Repin job for ${accounts[0].nickname} -> ${job.boardName}`);
        
        await dbManager.saveRepinJob({ ...job, status: 'running', startedAt: new Date().toISOString() });
        
        try {
          await executor.executeRepinJob(job, accounts[0].profilePath, dbManager, async (msg) => {
            mainWindow?.webContents.send('fleet:log', `[FLEET - ${accounts[0].nickname}] ${msg}`);
          });
          await dbManager.saveRepinJob({ ...job, status: 'completed', completedAt: new Date().toISOString() });
          mainWindow?.webContents.send('fleet:log', `[FLEET] Job completed successfully.`);
        } catch (err: any) {
          await dbManager.saveRepinJob({ ...job, status: 'failed', errorMessage: err.message, completedAt: new Date().toISOString() });
          mainWindow?.webContents.send('fleet:log', `[FLEET] Job failed: ${err.message}`);
        }
      } else {
        await dbManager.saveRepinJob({ ...job, status: 'failed', errorMessage: 'Account not found', completedAt: new Date().toISOString() });
      }
      isFleetCurrentlyRunningAJob = false;
      
      if (isFleetAutoPilotEnabled) {
        // Random 30-60 sec cooldown between jobs
        const cooldownMs = Math.floor(Math.random() * (60000 - 30000 + 1) + 30000);
        mainWindow?.webContents.send('fleet:log', `[FLEET] Cooling down for ${Math.round(cooldownMs/1000)}s before next job...`);
        fleetTimeout = setTimeout(() => runFleetEngine(), cooldownMs);
        return;
      }
    }
  } catch (err) {
    console.error("Fleet engine error:", err);
    isFleetCurrentlyRunningAJob = false;
  }
  
  if (isFleetAutoPilotEnabled) {
    fleetTimeout = setTimeout(() => runFleetEngine(), 30000); // Check for new jobs every 30s
  }
}
// ===== Scheduler Engine State & Loop =====
let schedulerInterval: NodeJS.Timeout | null = null;

export function parseScheduledDateTime(dateStr: string, timeStr: string): Date {
  const timeTrimmed = timeStr.trim();
  const timeLower = timeTrimmed.toLowerCase();
  const isAmPm = timeLower.endsWith('am') || timeLower.endsWith('pm');
  
  if (isAmPm) {
    const isPm = timeLower.endsWith('pm');
    const timeWithoutAmPm = timeTrimmed.slice(0, -2).trim();
    const parts = timeWithoutAmPm.split(':');
    let hour = parseInt(parts[0], 10);
    let minute = parts.length > 1 ? parseInt(parts[1], 10) : 0;
    let second = parts.length > 2 ? parseInt(parts[2], 10) : 0;
    
    if (!isNaN(hour) && !isNaN(minute) && !isNaN(second)) {
      if (isPm) {
        if (hour !== 12) {
          hour += 12;
        }
      } else {
        if (hour === 12) {
          hour = 0;
        }
      }
      const pad = (n: number) => String(n).padStart(2, '0');
      const formattedTime = `${pad(hour)}:${pad(minute)}:${pad(second)}`;
      return new Date(`${dateStr}T${formattedTime}`);
    }
  }
  
  return new Date(`${dateStr}T${timeTrimmed}`);
}

function startScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  console.log('⏰ Scheduler: Starting background scheduler loop (runs every 60s)...');

  schedulerInterval = setInterval(async () => {
    if (!dbManager || !publisherAdapter) return;

    try {
      // Query the database for scheduled jobs
      const allScheduledJobs = await dbManager.query<QueueJob>("SELECT * FROM queue_jobs WHERE status = 'scheduled'");
      // JSON fallback database returns all queue jobs, SQLite returns filtered.
      // So filter with JavaScript date comparison to handle both.
      const scheduledJobs = allScheduledJobs.filter(j => j.status === 'scheduled');
      if (scheduledJobs.length === 0) return;

      const now = new Date();
      const dueJobs = scheduledJobs.filter(job => {
        if (!job.scheduledDate || !job.scheduledTime) return false;
        try {
          const jobTime = parseScheduledDateTime(job.scheduledDate, job.scheduledTime);
          return !isNaN(jobTime.getTime()) && jobTime <= now;
        } catch (e) {
          console.error(`[Scheduler] Error parsing scheduled date/time for job ${job.id}:`, e);
          return false;
        }
      });

      if (dueJobs.length > 0) {
        if (publisherAdapter.isQueueActive()) {
          console.warn(`[Scheduler] Queue executor is already active. Skipping execution for ${dueJobs.length} scheduled jobs to prevent conflicts.`);
          return;
        }

        console.log(`[Scheduler] Triggering ${dueJobs.length} scheduled jobs:`, dueJobs.map(j => j.id));

        const jobIdsToRun: string[] = [];

        // Update status to 'running' immediately to prevent double-firing
        for (const job of dueJobs) {
          job.status = 'running';
          await dbManager.saveQueueJob(job);
          jobIdsToRun.push(job.id);

          // Emit scheduler:fired event
          mainWindow?.webContents.send('scheduler:fired', job.id);
        }

        // Trigger queue execution
        publisherAdapter.processQueue(jobIdsToRun, (progressData) => {
          mainWindow?.webContents.send('queue:progress', progressData);
        }).catch((err) => {
          console.error('[Scheduler] Queue processing crashed:', err);
        });
      }
    } catch (err) {
      console.error('[Scheduler] Error in background loop:', err);
    }
  }, 60000);
}

export async function updateTrayTooltip() {
  if (!tray || !dbManager) return;
  try {
    const queue = await dbManager.getQueue();
    const active = queue.filter(j => j.status === 'pending' || j.status === 'scheduled' || j.status === 'running').length;
    const successful = queue.filter(j => j.status === 'completed').length;
    const failed = queue.filter(j => j.status === 'failed').length;
    
    const tooltipText = `Pinterest Publisher\nActive Queue: ${active}\nSuccessful: ${successful}\nFailed: ${failed}`;
    tray.setToolTip(tooltipText.substring(0, 127));
  } catch (e) {
    console.error('Failed to update tray tooltip:', e);
  }
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');
  if (!fs.existsSync(iconPath)) {
    console.warn(`⚠️ Tray icon not found at: ${iconPath}`);
  }
  
  tray = new Tray(iconPath);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Pinterest Publisher',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });

  updateTrayTooltip();
}

// =========================================

let mainWindow: BrowserWindow | null = null;
let dbManager: DbManager | null = null;
let publisherAdapter: PublisherAdapter | null = null;
let openCodeProvider: OpenCodeProvider | null = null;

// Determine local data directories
const localDataDir = path.join(app.getPath('userData'), 'local-data');
const profilesDir = path.join(localDataDir, 'profiles');
const screenshotsDir = path.join(localDataDir, 'screenshots');
const logsDir = path.join(localDataDir, 'logs');

// Create directories if they do not exist
[localDataDir, profilesDir, screenshotsDir, logsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

async function createWindow(shouldShow = true) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1000,
    minHeight: 700,
    title: 'Pinterest Pin Publisher',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: shouldShow,
    autoHideMenuBar: true
  });

  // Enable security policies
  setupSecurity();

  // Forward console messages from the renderer process to the main process log file
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levelNames = ['verbose', 'info', 'warn', 'error'];
    const levelName = levelNames[level] || 'info';
    console.log(`[RENDERER-${levelName.toUpperCase()}] ${message} (Source: ${path.basename(sourceId)}:${line})`);
  });

  // Load app HTML
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Show window and open DevTools only in development
  if (shouldShow) {
    mainWindow.show();
  }
  if (process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Redirect standard console.log output to file logs as well
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const logFilePath = path.join(logsDir, 'app.log');

function writeLogToFile(level: string, message: string, context?: any) {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` | Context: ${JSON.stringify(context)}` : '';
  const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}\n`;
  fs.appendFileSync(logFilePath, logLine, 'utf8');

  // Also write to DB logs if DB is initialized
  if (dbManager) {
    dbManager.addLog(level as any, message, context).then((log) => {
      mainWindow?.webContents.send('sys:logAdded', log);
    }).catch(() => {});
  }
}

console.log = function (...args) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  originalConsoleLog.apply(console, args);
  writeLogToFile('info', msg);
};

console.error = function (...args) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  originalConsoleError.apply(console, args);
  writeLogToFile('error', msg);
};

// Register media protocol scheme as privileged to bypass browser local resource locks
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { secure: true, standard: true, supportFetchAPI: true, bypassCSP: true } }
]);

app.whenReady().then(async () => {
  console.log('🏁 Starting Pinterest Pin Publisher main process...');

  // Register custom media file protocol using the modern Electron protocol.handle API
  protocol.handle('media', async (request) => {
    try {
      const url = new URL(request.url);
      // When scheme is registered as 'standard', URL parser treats drive letter as hostname:
      //   media:///C:/Users/file.jpg -> host="C:", pathname="/Users/file.jpg"
      //   media:///c:/Users/file.jpg -> host="c:", pathname="/Users/file.jpg"
      // We need to reconstruct: C: + /Users/file.jpg = C:/Users/file.jpg
      let filePath: string;
      
      if (url.hostname && /^[a-zA-Z]$/.test(url.hostname)) {
        // Drive letter was parsed as hostname (e.g., hostname="c" or "C")
        filePath = decodeURIComponent(url.hostname.toUpperCase() + ':' + url.pathname);
      } else if (url.host && url.host.match(/^[a-zA-Z]:$/)) {
        // Drive letter with colon as host (e.g., host="C:")
        filePath = decodeURIComponent(url.host + url.pathname);
      } else {
        // Fallback: try raw pathname
        filePath = decodeURIComponent(url.pathname);
        if (process.platform === 'win32' && filePath.startsWith('/')) {
          filePath = filePath.substring(1);
        }
      }
      
      const normalizedPath = path.normalize(filePath);
      console.log(`[Media Protocol] Resolving: ${request.url} -> ${normalizedPath}`);
      
      if (fs.existsSync(normalizedPath)) {
        const fileBuffer = fs.readFileSync(normalizedPath);
        // Determine MIME type from extension
        const ext = path.extname(normalizedPath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.bmp': 'image/bmp',
          '.ico': 'image/x-icon',
          '.mp4': 'video/mp4',
          '.webm': 'video/webm',
          '.pdf': 'application/pdf',
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        return new Response(fileBuffer, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'max-age=3600',
          }
        });
      }
      console.warn(`[Media Protocol] File not found: ${normalizedPath}`);
      return new Response('File Not Found', { status: 404 });
    } catch (error) {
      console.error('Failed to resolve local media path:', error);
      return new Response('Protocol Error', { status: 500 });
    }
  });

  // Initialize DB Manager
  dbManager = new DbManager(localDataDir);
  await dbManager.init();

  // Initialize Adapters
  publisherAdapter = new PublisherAdapter(dbManager);
  publisherAdapter.registerOnStatusChange(() => {
    updateTrayTooltip();
  });
  openCodeProvider = new OpenCodeProvider(dbManager);

  // Register IPC Handlers
  registerIpcHandlers();

  // Start background scheduler
  startScheduler();

  // Create tray
  createTray();

  const wasOpenedAtLogin = app.getLoginItemSettings().wasOpenedAtLogin;
  await createWindow(!wasOpenedAtLogin);

  // Trigger background auto-login for connected accounts on startup (non-blocking)
  setTimeout(() => {
    publisherAdapter?.performStartupAutoLogin()
      ?.then(() => {
        console.log('✅ Startup auto-login process finished.');
        mainWindow?.webContents.send('pinterest:browserStatus', { accountId: '', isOpen: false, message: 'Startup auto-login complete' });
      })
      ?.catch((err) => {
        console.error('❌ Error during startup auto-login:', err);
      });
  }, 3000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', async () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  if (process.platform !== 'darwin') {
    if (dbManager) {
      await dbManager.close();
    }
    app.quit();
  }
});

function registerIpcHandlers() {
  if (!dbManager || !publisherAdapter || !openCodeProvider) return;

  const db = dbManager;
  const pub = publisherAdapter;
  const ai = openCodeProvider;

  // Account handlers
  ipcMain.handle('db:getAccounts', async () => {
    return db.getAccounts();
  });

  ipcMain.handle('db:saveAccount', async (_, account: Partial<Account>) => {
    const accountId = account.id || Buffer.from(`acc:${Date.now()}`).toString('base64').replace(/=/g, '');
    const nickname = account.nickname || 'Pinterest Account';
    const profilePath = account.profilePath || path.join(profilesDir, accountId);
    const sessionStatus = account.sessionStatus || 'disconnected';
    
    return db.saveAccount({
      id: accountId,
      nickname,
      email: account.email,
      password: account.password,
      profilePath,
      sessionStatus,
      createdAt: account.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastUsedAt: account.lastUsedAt || null
    });
  });

  ipcMain.handle('db:deleteAccount', async (_, id: string) => {
    return db.deleteAccount(id);
  });

  ipcMain.handle('fleet:toggle', async (_, enabled: boolean) => {
    isFleetAutoPilotEnabled = enabled;
    if (fleetTimeout) clearTimeout(fleetTimeout);
    if (enabled && !isFleetCurrentlyRunningAJob) {
      runFleetEngine(); // Start loop
    }
    return isFleetAutoPilotEnabled;
  });

  ipcMain.handle('fleet:status', async () => {
    return isFleetAutoPilotEnabled;
  });

  ipcMain.handle('pinterest:openSession', async (_, accountId: string) => {
    const accounts = await db.query<Account>('SELECT * FROM accounts WHERE id = ?', [accountId]);
    if (accounts.length === 0) throw new Error('Account not found');
    
    return pub.getSessionAdapter().openLoginSession(accounts[0], (browserStatus) => {
      mainWindow?.webContents.send('pinterest:browserStatus', browserStatus);
    });
  });

  ipcMain.handle('pinterest:verifySession', async (_, accountId: string) => {
    const accounts = await db.query<Account>('SELECT * FROM accounts WHERE id = ?', [accountId]);
    if (accounts.length === 0) throw new Error('Account not found');
    const isConnected = await pub.getSessionAdapter().verifySession(accounts[0]);
    await db.saveAccount({
      ...accounts[0],
      sessionStatus: isConnected ? 'connected' : 'disconnected',
      lastUsedAt: new Date().toISOString()
    });
    
    // Auto-fetch boards in the background if connected, so user doesn't miss newly added boards
    if (isConnected) {
      pub.getBoardResolver().fetchBoards(accounts[0]).catch(e => {
        console.error(`Background board fetch failed for ${accounts[0].nickname}:`, e);
      });
    }
    
    return isConnected;
  });

  // Analytics handler
  ipcMain.handle('pinterest:fetchAnalytics', async (_, accountId: string) => {
    const accounts = await db.query<Account>('SELECT * FROM accounts WHERE id = ?', [accountId]);
    if (accounts.length === 0) throw new Error('Account not found');
    
    const fetcher = new AnalyticsFetcher();
    return fetcher.fetchAnalytics(accounts[0].id, accounts[0].profilePath);
  });

  // Repin handlers
  ipcMain.handle('db:getRepinJobs', async () => {
    return db.getRepinJobs();
  });

  ipcMain.handle('db:saveRepinJob', async (_, job: any) => {
    return db.saveRepinJob(job);
  });

  ipcMain.handle('db:deleteRepinJob', async (_, id: string) => {
    return db.deleteRepinJob(id);
  });

  ipcMain.handle('repin:start', async (_, jobId: string) => {
    const jobs = await db.query<any>('SELECT * FROM repin_jobs WHERE id = ?', [jobId]);
    if (jobs.length === 0) throw new Error('Job not found');
    const job = jobs[0];
    
    const accounts = await db.query<Account>('SELECT * FROM accounts WHERE id = ?', [job.accountId]);
    if (accounts.length === 0) throw new Error('Account not found');
    
    const executor = new RepinExecutor();
    
    // Fire and forget
    executor.executeRepinJob(job, accounts[0].profilePath, db, async (msg) => {
      // We could send progress to UI, for now just log it
      console.log(`[Repin ${job.id}] ${msg}`);
    }).then(async () => {
      await db.saveRepinJob({ ...job, status: 'completed', completedAt: new Date().toISOString() });
    }).catch(async (err) => {
      await db.saveRepinJob({ ...job, status: 'failed', errorMessage: err.message, completedAt: new Date().toISOString() });
    });
    
    await db.saveRepinJob({ ...job, status: 'running', startedAt: new Date().toISOString() });
    return true;
  });

  // Board handlers
  ipcMain.handle('db:getBoards', async (_, accountId: string) => {
    return db.getBoards(accountId);
  });

  ipcMain.handle('pinterest:fetchBoards', async (_, accountId: string) => {
    const accounts = await db.query<Account>('SELECT * FROM accounts WHERE id = ?', [accountId]);
    if (accounts.length === 0) throw new Error('Account not found');
    
    // Fetch and save boards automatically
    const boards = await pub.getBoardResolver().fetchBoards(accounts[0]);
    return boards;
  });

  ipcMain.handle('db:saveBoard', async (_, board: Partial<Board>) => {
    const id = board.id || Buffer.from(`board:${Date.now()}`).toString('base64').replace(/=/g, '');
    if (!board.accountId || !board.name || !board.url) throw new Error('Missing required fields for board');
    
    return db.saveBoard({
      id,
      accountId: board.accountId,
      name: board.name,
      url: board.url,
      lastFetchedAt: new Date().toISOString()
    });
  });

  ipcMain.handle('db:deleteBoard', async (_, id: string) => {
    return db.deleteBoard(id);
  });

  // Draft handlers
  ipcMain.handle('db:getDrafts', async () => {
    return db.getDrafts();
  });

  ipcMain.handle('db:saveDraft', async (_, draft: Partial<Draft>) => {
    const id = draft.id || Buffer.from(`draft:${Date.now()}`).toString('base64').replace(/=/g, '');
    const now = new Date().toISOString();
    return db.saveDraft({
      id,
      title: draft.title || '',
      description: draft.description || '',
      destinationUrl: draft.destinationUrl || '',
      altText: draft.altText || '',
      notes: draft.notes || '',
      imagePath: draft.imagePath || '',
      accountId: draft.accountId || null,
      boardName: draft.boardName || null,
      boardUrl: draft.boardUrl || null,
      scheduledDate: draft.scheduledDate || null,
      scheduledTime: draft.scheduledTime || null,
      createdAt: draft.createdAt || now,
      updatedAt: now
    });
  });

  ipcMain.handle('db:deleteDraft', async (_, id: string) => {
    return db.deleteDraft(id);
  });

  ipcMain.handle('db:importDrafts', async (_, drafts: Partial<Draft>[]) => {
    let imported = 0;
    const now = new Date().toISOString();
    for (const d of drafts) {
      const id = d.id || Buffer.from(`draft:${Date.now()}:${Math.random()}`).toString('base64').replace(/=/g, '');
      await db.saveDraft({
        id,
        title: d.title || '',
        description: d.description || '',
        destinationUrl: d.destinationUrl || '',
        altText: d.altText || '',
        notes: d.notes || '',
        imagePath: d.imagePath || '',
        accountId: d.accountId || null,
        boardName: d.boardName || null,
        boardUrl: d.boardUrl || null,
        scheduledDate: d.scheduledDate || null,
        scheduledTime: d.scheduledTime || null,
        createdAt: now,
        updatedAt: now
      });
      imported++;
    }
    return imported;
  });

  // Queue handlers
  ipcMain.handle('db:getQueue', async () => {
    return db.getQueue();
  });

  ipcMain.handle('db:saveQueueJob', async (_, job: QueueJob) => {
    return db.saveQueueJob(job);
  });

  ipcMain.handle('db:addQueueJob', async (_, job: Partial<QueueJob>) => {
    const id = job.id || Buffer.from(`job:${Date.now()}:${Math.random()}`).toString('base64').replace(/=/g, '');
    if (!job.accountId || !job.imagePath) throw new Error('Missing required fields accountId or imagePath');
    
    return db.saveQueueJob({
      id,
      accountId: job.accountId,
      boardName: job.boardName || '',
      boardUrl: job.boardUrl || '',
      imagePath: job.imagePath,
      title: job.title || '',
      description: job.description || '',
      destinationUrl: job.destinationUrl || '',
      altText: job.altText || '',
      notes: job.notes || '',
      status: job.status || 'pending',
      errorMessage: job.errorMessage,
      screenshotPath: job.screenshotPath,
      scheduledDate: job.scheduledDate || null,
      scheduledTime: job.scheduledTime || null,
      createdAt: new Date().toISOString()
    });
  });

  ipcMain.handle('db:updateQueueJobStatus', async (_, id: string, status: any, error?: string) => {
    const jobs = await db.query<QueueJob>('SELECT * FROM queue_jobs WHERE id = ?', [id]);
    if (jobs.length > 0) {
      await db.saveQueueJob({
        ...jobs[0],
        status,
        errorMessage: error
      });
    }
  });

  ipcMain.handle('db:deleteQueueJob', async (_, id: string) => {
    return db.deleteQueueJob(id);
  });

  ipcMain.handle('db:clearQueue', async () => {
    return db.clearQueue();
  });

  ipcMain.handle('queue:start', async (_, jobIds: string[]) => {
    // Run queue in background sequential loop
    // Runs asynchronously on Electron main thread, reporting back to renderer window
    pub.processQueue(jobIds, (progressData) => {
      mainWindow?.webContents.send('queue:progress', progressData);
    }).catch((err) => {
      console.error('Queue processing crashed:', err);
    });
    return true;
  });

  ipcMain.handle('queue:pause', async () => {
    pub.pauseQueue();
    return true;
  });

  ipcMain.handle('queue:resume', async () => {
    pub.resumeQueue();
    return true;
  });

  ipcMain.handle('queue:stop', async () => {
    await pub.stopQueue();
    return true;
  });

  // Scheduler handlers
  ipcMain.handle('scheduler:getStatus', async () => {
    try {
      const allScheduledJobs = await db.query<QueueJob>("SELECT * FROM queue_jobs WHERE status = 'scheduled'");
      const scheduledJobs = allScheduledJobs.filter(j => j.status === 'scheduled');
      
      let nextJobTime: string | null = null;
      let earliestTime = Infinity;
      
      for (const job of scheduledJobs) {
        if (job.scheduledDate && job.scheduledTime) {
          const jobTime = parseScheduledDateTime(job.scheduledDate, job.scheduledTime);
          const ms = jobTime.getTime();
          if (!isNaN(ms) && ms < earliestTime) {
            earliestTime = ms;
            const pad = (num: number) => String(num).padStart(2, '0');
            const year = jobTime.getFullYear();
            const month = pad(jobTime.getMonth() + 1);
            const date = pad(jobTime.getDate());
            const hours = pad(jobTime.getHours());
            const minutes = pad(jobTime.getMinutes());
            const seconds = pad(jobTime.getSeconds());
            nextJobTime = `${year}-${month}-${date}T${hours}:${minutes}:${seconds}`;
          }
        }
      }
      
      return {
        active: schedulerInterval !== null,
        nextJobTime,
        pendingCount: scheduledJobs.length
      };
    } catch (e) {
      console.error('[Scheduler] Error in scheduler:getStatus handler:', e);
      return {
        active: schedulerInterval !== null,
        nextJobTime: null,
        pendingCount: 0
      };
    }
  });

  // Settings handlers
  ipcMain.handle('db:getSettings', async () => {
    return db.getSettings();
  });

  ipcMain.handle('db:saveSetting', async (_, key: string, value: any) => {
    await db.saveSetting(key, value);
    // Return settings
    return db.getSettings();
  });

  // Logs handlers
  ipcMain.handle('db:getLogs', async (_, filters?: any) => {
    const limit = 200;
    let logs = await db.getLogs(limit);
    if (filters) {
      if (filters.level) {
        logs = logs.filter(l => l.level === filters.level);
      }
      if (filters.search) {
        const term = filters.search.toLowerCase();
        logs = logs.filter(l => 
          l.message.toLowerCase().includes(term) || 
          (l.context && l.context.toLowerCase().includes(term))
        );
      }
    }
    return logs;
  });

  ipcMain.handle('db:clearLogs', async () => {
    return db.clearLogs();
  });

  // System handlers
  ipcMain.handle('sys:openLogFolder', async () => {
    await shell.openPath(localDataDir);
  });

  ipcMain.handle('sys:setStartup', async (_, enabled: boolean) => {
    try {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        path: process.execPath
      });
    } catch (err) {
      console.error('Failed to set login item settings:', err);
    }
  });

  ipcMain.handle('sys:getStartup', async () => {
    try {
      const settings = app.getLoginItemSettings();
      return {
        openAtLogin: settings.openAtLogin,
        wasOpenedAtLogin: settings.wasOpenedAtLogin || false
      };
    } catch (err) {
      console.error('Failed to get login item settings:', err);
      return {
        openAtLogin: false,
        wasOpenedAtLogin: false
      };
    }
  });

  ipcMain.handle('sys:exportBackup', async () => {
    if (!mainWindow) return false;
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Footprints & Data',
      defaultPath: `PinPublisher_Backup_${new Date().toISOString().split('T')[0]}.zip`,
      filters: [{ name: 'Zip Files', extensions: ['zip'] }]
    });
    if (canceled || !filePath) return false;

    try {
      const zip = new AdmZip();
      zip.addLocalFolder(localDataDir);
      zip.writeZip(filePath);
      return true;
    } catch (e: any) {
      console.error('Export failed:', e);
      throw new Error(`Export failed: ${e.message}`);
    }
  });

  ipcMain.handle('sys:importBackup', async () => {
    if (!mainWindow) return false;
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Footprints & Data',
      filters: [{ name: 'Zip Files', extensions: ['zip'] }],
      properties: ['openFile']
    });
    
    if (canceled || filePaths.length === 0) return false;
    
    try {
      const zip = new AdmZip(filePaths[0]);
      zip.extractAllTo(localDataDir, true);
      
      app.relaunch();
      app.exit(0);
      return true;
    } catch (e: any) {
      console.error('Import failed:', e);
      throw new Error(`Import failed: ${e.message}`);
    }
  });

  ipcMain.handle('clipboard:write', async (_, text: string) => {
    clipboard.writeText(text);
  });

  // AI handlers
  ipcMain.handle('ai:call', async (_, action: string, payload: any) => {
    switch (action) {
      case 'generateSEOComplete':
        return ai.generateSEOComplete(payload);
      case 'generateTitleSuggestions':
        return ai.generateTitleSuggestions(payload);
      case 'generateDescriptionSuggestions':
        return ai.generateDescriptionSuggestions(payload);
      case 'improveAltText':
        return ai.improveAltText(payload);
      case 'generateKeywords':
        return ai.generateKeywords(payload);
      case 'validatePinMetadata':
        return ai.validatePinMetadata(payload);
      case 'analyzeImage':
        return ai.analyzeImage(payload.imagePath, payload.boardName, payload.topic, payload.destinationUrl, payload.imagePrompt);
      default:
        throw new Error(`Unknown AI action: ${action}`);
    }
  });

  // ── Diagnostic: test Cloudflare accounts loading & speed ─────────────────
  ipcMain.handle('ai:diagnose', async () => {
    const path = require('path');
    const fs   = require('fs');
    const { app: eApp } = require('electron');

    const searchPaths = [
      process.resourcesPath ? path.join(process.resourcesPath, 'cloudflare_accounts.txt') : null,
      path.join(eApp.getPath('userData'), 'cloudflare_accounts.txt'),
      path.join(__dirname, '..', '..', 'cloudflare_accounts.txt'),
      path.join(__dirname, '..', '..', 'cloudflare_working_accounts.txt'),
      path.join(process.cwd(), 'cloudflare_accounts.txt'),
    ].filter(Boolean) as string[];

    const foundPath = searchPaths.find(p => fs.existsSync(p)) || null;
    let accountCount = 0;
    if (foundPath) {
      const lines = fs.readFileSync(foundPath, 'utf8').split('\n');
      accountCount = lines.filter((l: string) => l.includes('cfut_')).length;
    }

    // Quick speed test: ping 3 accounts and measure fastest response
    let speedMs = -1;
    try {
      const pool = await ai.syncCloudflareKeysPool();
      const testCreds = pool.slice(0, 3);
      const model = '@cf/moonshotai/kimi-k2.6';
      const t0 = Date.now();
      await Promise.any(testCreds.map(cred =>
        fetch(`https://api.cloudflare.com/client/v4/accounts/${cred.accountId}/ai/run/${model}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cred.token}` },
          body: JSON.stringify({ messages: [{ role: 'user', content: 'Say: OK' }], max_tokens: 5 }),
          signal: AbortSignal.timeout(30000)
        }).then(async r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      ));
      speedMs = Date.now() - t0;
    } catch {}

    return {
      resourcesPath:  process.resourcesPath || 'N/A',
      foundPath:      foundPath || 'NOT FOUND',
      accountCount,
      searchPaths,
      speedMs,
      platform:       process.platform,
      version:        eApp.getVersion(),
    };
  });
}
