import { app, BrowserWindow, ipcMain, shell, protocol, clipboard, dialog } from 'electron';
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

async function createWindow() {
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
    show: true,
    autoHideMenuBar: true
  });

  // Enable security policies
  setupSecurity();

  // Forward console messages from the renderer process to the main process log file
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
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
  mainWindow.show();
  if (process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

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
  openCodeProvider = new OpenCodeProvider(dbManager);

  // Register IPC Handlers
  registerIpcHandlers();

  await createWindow();

  // Trigger background auto-login for connected accounts on startup (non-blocking)
  setTimeout(() => {
    publisherAdapter.performStartupAutoLogin()
      .then(() => {
        console.log('✅ Startup auto-login process finished.');
        mainWindow?.webContents.send('pinterest:browserStatus', { accountId: '', isOpen: false, message: 'Startup auto-login complete' });
      })
      .catch((err) => {
        console.error('❌ Error during startup auto-login:', err);
      });
  }, 3000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
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
}
