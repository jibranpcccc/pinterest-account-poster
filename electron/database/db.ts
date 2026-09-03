import fs from 'fs';
import path from 'path';
import { Account, Board, Draft, QueueJob, Log, Setting, AnalyticsSnapshot } from '../types';

export function parseMetricNumber(val: any): number {
  if (typeof val === 'number') return val;
  if (!val || typeof val !== 'string') return 0;
  const cleaned = val.trim().toLowerCase().replace(/,/g, '');
  const match = cleaned.match(/^([\d.]+)\s*([km])?$/);
  if (!match) {
    const num = parseFloat(cleaned.replace(/[^\d.]/g, ''));
    return isNaN(num) ? 0 : Math.round(num);
  }
  const base = parseFloat(match[1]);
  if (isNaN(base)) return 0;
  if (match[2] === 'k') return Math.round(base * 1000);
  if (match[2] === 'm') return Math.round(base * 1000000);
  return Math.round(base);
}


export interface DbDriver {
  connect(dbPath: string): Promise<void>;
  query<T>(sql: string, params?: any[]): Promise<T[]>;
  run(sql: string, params?: any[]): Promise<{ lastID: any; changes: number }>;
  close(): Promise<void>;
}

export class DbManager {
  private driver!: DbDriver;
  private dbPath!: string;
  private isFallback = false;

  constructor(localDataDir: string) {
    // Ensure local data dir exists
    if (!fs.existsSync(localDataDir)) {
      fs.mkdirSync(localDataDir, { recursive: true });
    }

    // Try loading SQLite driver first, fallback to JSON driver on error
    try {
      // Dynamic require to prevent load issues during bundling
      const { SqliteDriver } = require('./sqliteDriver');
      this.driver = new SqliteDriver();
      this.dbPath = path.join(localDataDir, 'app.db');
      console.log(`📂 DB: Initializing SQLite database at ${this.dbPath}`);
    } catch (e) {
      console.warn('⚠️ SQLite3 driver could not be loaded (likely missing native binaries). Falling back to compile-free JSON database!');
      const { JsonDriver } = require('./jsonDriver');
      this.driver = new JsonDriver();
      this.dbPath = path.join(localDataDir, 'app.json');
      this.isFallback = true;
      console.log(`📂 DB: Initializing JSON database at ${this.dbPath}`);
    }
  }

  public async init(): Promise<void> {
    await this.driver.connect(this.dbPath);
    await this.createTables();
    await this.runMigrations();
    await this.seedDefaultSettings();
    await this.cleanupStuckRunningJobs();
  }

  private async cleanupStuckRunningJobs(): Promise<void> {
    try {
      if (!this.isFallback) {
        await this.driver.run("UPDATE queue_jobs SET status = 'failed', errorMessage = 'Interrupted by application exit' WHERE status = 'running'");
        await this.driver.run("UPDATE repin_jobs SET status = 'failed', errorMessage = 'Interrupted by application exit' WHERE status = 'running'");
      } else {
        const JsonDriver = this.driver as any;
        if (JsonDriver.state) {
          let updated = false;
          if (Array.isArray(JsonDriver.state.queue_jobs)) {
            JsonDriver.state.queue_jobs.forEach((job: any) => {
              if (job.status === 'running') {
                job.status = 'failed';
                job.errorMessage = 'Interrupted by application exit';
                updated = true;
              }
            });
          }
          if (Array.isArray(JsonDriver.state.repin_jobs)) {
            JsonDriver.state.repin_jobs.forEach((job: any) => {
              if (job.status === 'running') {
                job.status = 'failed';
                job.errorMessage = 'Interrupted by application exit';
                updated = true;
              }
            });
          }
          if (updated) {
            JsonDriver.saveState();
          }
        }
      }
      console.log('🧹 DB: Cleaned up stuck running queue and repin jobs on startup');
    } catch (e) {
      console.error('Failed to clean up stuck jobs on startup:', e);
    }
  }

  private async runMigrations(): Promise<void> {
    if (this.isFallback) return;
    try {
      await this.driver.run('ALTER TABLE queue_jobs ADD COLUMN scheduledDate TEXT');
      console.log('Migrated DB: Added scheduledDate column to queue_jobs');
    } catch (e) {}
    try {
      await this.driver.run('ALTER TABLE queue_jobs ADD COLUMN scheduledTime TEXT');
      console.log('Migrated DB: Added scheduledTime column to queue_jobs');
    } catch (e) {}
    try {
      await this.driver.run('ALTER TABLE drafts ADD COLUMN accountId TEXT');
      console.log('Migrated DB: Added accountId column to drafts');
    } catch (e) {}
    try {
      await this.driver.run('ALTER TABLE drafts ADD COLUMN boardName TEXT');
      console.log('Migrated DB: Added boardName column to drafts');
    } catch (e) {}
    try {
      await this.driver.run('ALTER TABLE drafts ADD COLUMN boardUrl TEXT');
      console.log('Migrated DB: Added boardUrl column to drafts');
    } catch (e) {}
    try {
      await this.driver.run('ALTER TABLE drafts ADD COLUMN scheduledDate TEXT');
      console.log('Migrated DB: Added scheduledDate column to drafts');
    } catch (e) {}
    try {
      await this.driver.run('ALTER TABLE drafts ADD COLUMN scheduledTime TEXT');
      console.log('Migrated DB: Added scheduledTime column to drafts');
    } catch (e) {}
    try {
      await this.driver.run('ALTER TABLE repin_jobs ADD COLUMN liveLinks TEXT');
      console.log('Migrated DB: Added liveLinks column to repin_jobs');
    } catch (e) {}
    try {
      await this.driver.run("DELETE FROM logs WHERE createdAt < datetime('now', '-14 days')");
    } catch (e) {}
  }

  public getDbPath(): string {
    return this.dbPath;
  }

  public isFallbackMode(): boolean {
    return this.isFallback;
  }

  public async query<T>(sql: string, params: any[] = []): Promise<T[]> {
    return this.driver.query<T>(sql, params);
  }

  public async run(sql: string, params: any[] = []): Promise<{ lastID: any; changes: number }> {
    return this.driver.run(sql, params);
  }

  private async createTables(): Promise<void> {
    if (this.isFallback) {
      // JSON driver automatically handles structural arrays, no schema definition command required
      return;
    }

    // SQLite schemas
    await this.driver.run(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        nickname TEXT NOT NULL,
        profilePath TEXT NOT NULL,
        sessionStatus TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        lastUsedAt TEXT,
        username TEXT,
        avatarUrl TEXT
      )
    `);

    await this.driver.run(`
      CREATE TABLE IF NOT EXISTS boards (
        id TEXT PRIMARY KEY,
        accountId TEXT NOT NULL,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        lastFetchedAt TEXT NOT NULL,
        FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `);

    await this.driver.run(`
      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY,
        title TEXT,
        description TEXT,
        destinationUrl TEXT,
        altText TEXT,
        notes TEXT,
        imagePath TEXT,
        accountId TEXT,
        boardName TEXT,
        boardUrl TEXT,
        scheduledDate TEXT,
        scheduledTime TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `);

    await this.driver.run(`
      CREATE TABLE IF NOT EXISTS queue_jobs (
        id TEXT PRIMARY KEY,
        accountId TEXT NOT NULL,
        boardName TEXT,
        boardUrl TEXT,
        imagePath TEXT NOT NULL,
        title TEXT,
        description TEXT,
        destinationUrl TEXT,
        altText TEXT,
        notes TEXT,
        status TEXT NOT NULL,
        errorMessage TEXT,
        screenshotPath TEXT,
        scheduledDate TEXT,
        scheduledTime TEXT,
        createdAt TEXT NOT NULL,
        startedAt TEXT,
        completedAt TEXT,
        FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `);

    await this.driver.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    await this.driver.run(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        context TEXT,
        createdAt TEXT NOT NULL
      )
    `);

    await this.driver.run(`
      CREATE TABLE IF NOT EXISTS repin_jobs (
        id TEXT PRIMARY KEY,
        accountId TEXT NOT NULL,
        boardName TEXT NOT NULL,
        keywords TEXT NOT NULL,
        count INTEGER NOT NULL,
        status TEXT NOT NULL,
        errorMessage TEXT,
        liveLinks TEXT,
        createdAt TEXT NOT NULL,
        startedAt TEXT,
        completedAt TEXT,
        FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `);

    await this.driver.run(`
      CREATE TABLE IF NOT EXISTS analytics_history (
        id TEXT PRIMARY KEY,
        accountId TEXT NOT NULL,
        followers INTEGER DEFAULT 0,
        monthlyViews INTEGER DEFAULT 0,
        impressions INTEGER DEFAULT 0,
        engagements INTEGER DEFAULT 0,
        outboundClicks INTEGER DEFAULT 0,
        saves INTEGER DEFAULT 0,
        followersRaw TEXT,
        monthlyViewsRaw TEXT,
        timestamp TEXT NOT NULL,
        snapshotDate TEXT NOT NULL,
        FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `);

    // Performance Indexes
    try {
      await this.driver.run('CREATE INDEX IF NOT EXISTS idx_queue_jobs_status ON queue_jobs(status)');
      await this.driver.run('CREATE INDEX IF NOT EXISTS idx_queue_jobs_accountId ON queue_jobs(accountId)');
      await this.driver.run('CREATE INDEX IF NOT EXISTS idx_boards_accountId ON boards(accountId)');
      await this.driver.run('CREATE INDEX IF NOT EXISTS idx_repin_jobs_status ON repin_jobs(status)');
      await this.driver.run('CREATE INDEX IF NOT EXISTS idx_logs_createdAt ON logs(createdAt)');
      await this.driver.run('CREATE INDEX IF NOT EXISTS idx_analytics_history_acc_date ON analytics_history(accountId, snapshotDate)');
    } catch (e) {}


    // Schema Migrations for accounts and queue_jobs tables
    try {
      const accountsCols = await this.driver.query<{ name: string }>('PRAGMA table_info(accounts)');
      const accountsColNames = accountsCols.map(c => c.name);
      if (!accountsColNames.includes('email')) {
        await this.driver.run('ALTER TABLE accounts ADD COLUMN email TEXT');
      }
      if (!accountsColNames.includes('password')) {
        await this.driver.run('ALTER TABLE accounts ADD COLUMN password TEXT');
      }
      if (!accountsColNames.includes('username')) {
        await this.driver.run('ALTER TABLE accounts ADD COLUMN username TEXT');
      }
      if (!accountsColNames.includes('avatarUrl')) {
        await this.driver.run('ALTER TABLE accounts ADD COLUMN avatarUrl TEXT');
      }

      const queueCols = await this.driver.query<{ name: string }>('PRAGMA table_info(queue_jobs)');
      const queueColNames = queueCols.map(c => c.name);
      if (!queueColNames.includes('livePinUrl')) {
        await this.driver.run('ALTER TABLE queue_jobs ADD COLUMN livePinUrl TEXT');
      }
    } catch (e) {
      console.error('Database migration failed:', e);
    }
  }

  private async seedDefaultSettings(): Promise<void> {
    const defaults = [
      { key: 'theme', value: JSON.stringify('dark') },
      { key: 'mockMode', value: JSON.stringify(true) }, // Default to mock mode for easy testing!
      { key: 'actionDelay', value: JSON.stringify([1.5, 4.0]) }, // min, max in seconds
      { key: 'pinDelay', value: JSON.stringify([30, 120]) },
      { key: 'accountDelay', value: JSON.stringify([60, 180]) },
      { key: 'maxRetries', value: JSON.stringify(2) },
      { key: 'screenshotOnError', value: JSON.stringify(true) },
      { key: 'continueAfterFailure', value: JSON.stringify(false) },
      { key: 'headlessQueue', value: JSON.stringify(false) }, // Default to VISIBLE browser (required for file upload dialogs)
      { key: 'aiEnabled', value: JSON.stringify(true) },
      { key: 'aiProvider', value: JSON.stringify('opencode') },
      { key: 'aiBaseUrl', value: JSON.stringify('https://api.opencode.dev/v1') },
      { key: 'aiApiKey', value: JSON.stringify('') },
      { key: 'aiModel', value: JSON.stringify('opencode-mimo-v2.5') },
      { key: 'aiTimeout', value: JSON.stringify(30) },
      { key: 'showNotificationOnPost', value: JSON.stringify(true) }
    ];

    for (const item of defaults) {
      if (this.isFallback) {
        const existing = await this.driver.query<Setting>('SELECT * FROM settings WHERE key = ?', [item.key]);
        if (existing.length === 0) {
          await this.driver.run('INSERT INTO settings (key, value) VALUES (?, ?)', [item.key, item.value]);
        }
      } else {
        await this.driver.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [item.key, item.value]);
      }
    }
  }

  // --- High Level Operations ---

  // Accounts
  public async getAccounts(): Promise<Account[]> {
    return this.driver.query<Account>('SELECT * FROM accounts ORDER BY nickname ASC');
  }

  public async saveAccount(account: Account): Promise<Account> {
    const existing = await this.driver.query<Account>('SELECT * FROM accounts WHERE id = ?', [account.id]);
    const now = new Date().toISOString();
    if (existing.length > 0) {
      await this.driver.run(
        'UPDATE accounts SET nickname = ?, email = ?, password = ?, profilePath = ?, sessionStatus = ?, updatedAt = ?, lastUsedAt = ?, username = ?, avatarUrl = ? WHERE id = ?',
        [
          account.nickname,
          account.email || null,
          account.password || null,
          account.profilePath,
          account.sessionStatus,
          now,
          account.lastUsedAt || existing[0].lastUsedAt,
          account.username || null,
          account.avatarUrl || null,
          account.id
        ]
      );
    } else {
      await this.driver.run(
        'INSERT INTO accounts (id, nickname, email, password, profilePath, sessionStatus, createdAt, updatedAt, lastUsedAt, username, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          account.id,
          account.nickname,
          account.email || null,
          account.password || null,
          account.profilePath,
          account.sessionStatus,
          now,
          now,
          account.lastUsedAt || null,
          account.username || null,
          account.avatarUrl || null
        ]
      );
    }
    const results = await this.driver.query<Account>('SELECT * FROM accounts WHERE id = ?', [account.id]);
    return results[0];
  }

  public async deleteAccount(id: string): Promise<void> {
    await this.driver.run('DELETE FROM accounts WHERE id = ?', [id]);
    await this.driver.run('DELETE FROM boards WHERE accountId = ?', [id]);
  }

  // Boards
  public async getBoards(accountId: string): Promise<Board[]> {
    return this.driver.query<Board>('SELECT * FROM boards WHERE accountId = ? ORDER BY name ASC', [accountId]);
  }

  public async saveBoard(board: Board): Promise<Board> {
    const existing = await this.driver.query<Board>('SELECT * FROM boards WHERE id = ?', [board.id]);
    if (existing.length > 0) {
      await this.driver.run(
        'UPDATE boards SET name = ?, url = ?, lastFetchedAt = ? WHERE id = ?',
        [board.name, board.url, board.lastFetchedAt, board.id]
      );
    } else {
      await this.driver.run(
        'INSERT INTO boards (id, accountId, name, url, lastFetchedAt) VALUES (?, ?, ?, ?, ?)',
        [board.id, board.accountId, board.name, board.url, board.lastFetchedAt]
      );
    }
    const results = await this.driver.query<Board>('SELECT * FROM boards WHERE id = ?', [board.id]);
    return results[0];
  }

  public async deleteBoard(id: string): Promise<void> {
    await this.driver.run('DELETE FROM boards WHERE id = ?', [id]);
  }

  // Drafts
  public async getDrafts(): Promise<Draft[]> {
    return this.driver.query<Draft>('SELECT * FROM drafts ORDER BY updatedAt DESC');
  }

  public async saveDraft(draft: Draft): Promise<Draft> {
    const existing = await this.driver.query<Draft>('SELECT * FROM drafts WHERE id = ?', [draft.id]);
    const now = new Date().toISOString();
    if (existing.length > 0) {
      await this.driver.run(
        `UPDATE drafts SET 
          title = ?, description = ?, destinationUrl = ?, altText = ?, notes = ?, imagePath = ?, updatedAt = ?,
          accountId = ?, boardName = ?, boardUrl = ?, scheduledDate = ?, scheduledTime = ?
         WHERE id = ?`,
        [
          draft.title, draft.description, draft.destinationUrl, draft.altText, draft.notes, draft.imagePath, now,
          draft.accountId || null, draft.boardName || null, draft.boardUrl || null, draft.scheduledDate || null, draft.scheduledTime || null,
          draft.id
        ]
      );
    } else {
      await this.driver.run(
        `INSERT INTO drafts (
          id, title, description, destinationUrl, altText, notes, imagePath, createdAt, updatedAt,
          accountId, boardName, boardUrl, scheduledDate, scheduledTime
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          draft.id, draft.title, draft.description, draft.destinationUrl, draft.altText, draft.notes, draft.imagePath, now, now,
          draft.accountId || null, draft.boardName || null, draft.boardUrl || null, draft.scheduledDate || null, draft.scheduledTime || null
        ]
      );
    }
    const results = await this.driver.query<Draft>('SELECT * FROM drafts WHERE id = ?', [draft.id]);
    return results[0];
  }

  public async deleteDraft(id: string): Promise<void> {
    await this.driver.run('DELETE FROM drafts WHERE id = ?', [id]);
  }

  // Queue
  public async getQueue(): Promise<QueueJob[]> {
    return this.driver.query<QueueJob>('SELECT * FROM queue_jobs ORDER BY createdAt ASC');
  }

  public async saveQueueJob(job: QueueJob): Promise<QueueJob> {
    const existing = await this.driver.query<QueueJob>('SELECT * FROM queue_jobs WHERE id = ?', [job.id]);
    const now = new Date().toISOString();
    if (existing.length > 0) {
      await this.driver.run(
        `UPDATE queue_jobs SET 
          accountId = ?, boardName = ?, boardUrl = ?, imagePath = ?, 
          title = ?, description = ?, destinationUrl = ?, altText = ?, notes = ?, 
          status = ?, errorMessage = ?, screenshotPath = ?, startedAt = ?, completedAt = ?,
          scheduledDate = ?, scheduledTime = ?, livePinUrl = ?
         WHERE id = ?`,
        [
          job.accountId, job.boardName, job.boardUrl, job.imagePath,
          job.title, job.description, job.destinationUrl, job.altText, job.notes,
          job.status, job.errorMessage || null, job.screenshotPath || null,
          job.startedAt || existing[0].startedAt, job.completedAt || existing[0].completedAt,
          job.scheduledDate || null, job.scheduledTime || null, job.livePinUrl || existing[0].livePinUrl || null,
          job.id
        ]
      );
    } else {
      await this.driver.run(
        `INSERT INTO queue_jobs (
          id, accountId, boardName, boardUrl, imagePath, 
          title, description, destinationUrl, altText, notes, 
          status, errorMessage, screenshotPath, createdAt, startedAt, completedAt,
          scheduledDate, scheduledTime, livePinUrl
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          job.id, job.accountId, job.boardName, job.boardUrl, job.imagePath,
          job.title, job.description, job.destinationUrl, job.altText, job.notes,
          job.status, job.errorMessage || null, job.screenshotPath || null,
          now, job.startedAt || null, job.completedAt || null,
          job.scheduledDate || null, job.scheduledTime || null, job.livePinUrl || null
        ]
      );
    }
    const results = await this.driver.query<QueueJob>('SELECT * FROM queue_jobs WHERE id = ?', [job.id]);
    return results[0];
  }

  public async deleteQueueJob(id: string): Promise<void> {
    await this.driver.run('DELETE FROM queue_jobs WHERE id = ?', [id]);
  }

  public async clearQueue(): Promise<void> {
    await this.driver.run("DELETE FROM queue_jobs WHERE status != 'running'");
  }

  public async clearCompletedJobs(): Promise<void> {
    await this.driver.run("DELETE FROM queue_jobs WHERE status = 'completed'");
  }

  public async clearFailedJobs(): Promise<void> {
    await this.driver.run("DELETE FROM queue_jobs WHERE status = 'failed'");
  }

  // Repin Jobs
  public async getRepinJobs(): Promise<any[]> {
    return this.driver.query<any>('SELECT * FROM repin_jobs ORDER BY createdAt ASC');
  }

  public async saveRepinJob(job: any): Promise<any> {
    const existing = await this.driver.query<any>('SELECT * FROM repin_jobs WHERE id = ?', [job.id]);
    const now = new Date().toISOString();
    if (existing.length > 0) {
      await this.driver.run(
        `UPDATE repin_jobs SET 
          accountId = ?, boardName = ?, keywords = ?, count = ?, status = ?, errorMessage = ?, startedAt = ?, completedAt = ?
         WHERE id = ?`,
        [
          job.accountId, job.boardName, job.keywords, job.count, job.status, job.errorMessage || null,
          job.startedAt || existing[0].startedAt, job.completedAt || existing[0].completedAt,
          job.id
        ]
      );
    } else {
      await this.driver.run(
        `INSERT INTO repin_jobs (
          id, accountId, boardName, keywords, count, status, errorMessage, createdAt, startedAt, completedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          job.id, job.accountId, job.boardName, job.keywords, job.count, job.status, job.errorMessage || null,
          now, job.startedAt || null, job.completedAt || null
        ]
      );
    }
    const results = await this.driver.query<any>('SELECT * FROM repin_jobs WHERE id = ?', [job.id]);
    return results[0];
  }

  public async deleteRepinJob(id: string): Promise<void> {
    await this.driver.run('DELETE FROM repin_jobs WHERE id = ?', [id]);
  }

  // Settings
  public async getSettings(): Promise<Record<string, any>> {
    const rows = await this.driver.query<Setting>('SELECT * FROM settings');
    const settings: Record<string, any> = {};
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch (e) {
        settings[row.key] = row.value;
      }
    }
    return settings;
  }

  public async saveSetting(key: string, value: any): Promise<void> {
    const valStr = JSON.stringify(value);
    const existing = await this.driver.query<Setting>('SELECT * FROM settings WHERE key = ?', [key]);
    if (existing.length > 0) {
      await this.driver.run('UPDATE settings SET value = ? WHERE key = ?', [valStr, key]);
    } else {
      await this.driver.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, valStr]);
    }
  }

  // Logs
  public async getLogs(limit = 100): Promise<Log[]> {
    return this.driver.query<Log>('SELECT * FROM logs ORDER BY createdAt DESC LIMIT ?', [limit]);
  }

  public async addLog(level: 'info' | 'warn' | 'error', message: string, context?: any): Promise<Log> {
    const now = new Date().toISOString();
    const ctxStr = context ? JSON.stringify(context) : null;
    const result = await this.driver.run(
      'INSERT INTO logs (level, message, context, createdAt) VALUES (?, ?, ?, ?)',
      [level, message, ctxStr, now]
    );
    return {
      id: result.lastID,
      level,
      message,
      context: ctxStr || undefined,
      createdAt: now
    };
  }

  public async clearLogs(): Promise<void> {
    await this.driver.run('DELETE FROM logs');
  }

  // Analytics History
  public async getAnalyticsHistory(accountId?: string, limit = 500): Promise<AnalyticsSnapshot[]> {
    if (accountId) {
      const records = await this.driver.query<AnalyticsSnapshot>(
        'SELECT * FROM analytics_history WHERE accountId = ? ORDER BY snapshotDate ASC LIMIT ?',
        [accountId, limit]
      );
      if (records.length === 0) {
        return this.seedAnalyticsHistory(accountId);
      }
      return records;
    }
    return this.driver.query<AnalyticsSnapshot>(
      'SELECT * FROM analytics_history ORDER BY snapshotDate ASC LIMIT ?',
      [limit]
    );
  }

  public async saveAnalyticsSnapshot(snapshot: Partial<AnalyticsSnapshot>): Promise<AnalyticsSnapshot> {
    const id = snapshot.id || `snap_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const now = snapshot.timestamp || new Date().toISOString();
    const snapshotDate = snapshot.snapshotDate || now.split('T')[0];

    const followers = parseMetricNumber(snapshot.followers ?? snapshot.followersRaw);
    const monthlyViews = parseMetricNumber(snapshot.monthlyViews ?? snapshot.monthlyViewsRaw);
    const impressions = parseMetricNumber(snapshot.impressions);
    const engagements = parseMetricNumber(snapshot.engagements);
    const outboundClicks = parseMetricNumber(snapshot.outboundClicks);
    const saves = parseMetricNumber(snapshot.saves);

    await this.driver.run(
      `INSERT INTO analytics_history (
        id, accountId, followers, monthlyViews, impressions, engagements, outboundClicks, saves, followersRaw, monthlyViewsRaw, timestamp, snapshotDate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        snapshot.accountId || 'unknown',
        followers,
        monthlyViews,
        impressions,
        engagements,
        outboundClicks,
        saves,
        snapshot.followersRaw || String(followers),
        snapshot.monthlyViewsRaw || String(monthlyViews),
        now,
        snapshotDate
      ]
    );

    const results = await this.driver.query<AnalyticsSnapshot>('SELECT * FROM analytics_history WHERE id = ?', [id]);
    return results[0];
  }

  public async seedAnalyticsHistory(accountId: string): Promise<AnalyticsSnapshot[]> {
    const seeded: AnalyticsSnapshot[] = [];
    const now = new Date();
    // Base values per account hash for realistic data variance
    let hash = 0;
    for (let i = 0; i < accountId.length; i++) hash += accountId.charCodeAt(i);
    const baseFollowers = 1250 + (hash % 1500);
    const baseViews = 24000 + (hash % 35000);
    const baseImpressions = 45000 + (hash % 50000);

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const snapshotDate = d.toISOString().split('T')[0];
      const timestamp = d.toISOString();

      // Growth trajectory calculation
      const progress = (30 - i) / 30;
      const followerGain = Math.floor(progress * 180 + Math.sin(i) * 15);
      const viewNoise = Math.floor(Math.sin(i * 0.8) * 2200 + Math.cos(i) * 1100);
      const impNoise = Math.floor(Math.cos(i * 0.6) * 4500 + Math.sin(i) * 2500);

      const followers = Math.max(100, baseFollowers + followerGain);
      const monthlyViews = Math.max(1000, baseViews + Math.floor(progress * 8000) + viewNoise);
      const impressions = Math.max(2000, baseImpressions + Math.floor(progress * 15000) + impNoise);
      const engagements = Math.floor(impressions * (0.045 + (i % 3) * 0.005));
      const outboundClicks = Math.floor(engagements * 0.38);
      const saves = Math.floor(engagements * 0.42);

      const item: Partial<AnalyticsSnapshot> = {
        id: `seed_${accountId}_${snapshotDate}`,
        accountId,
        followers,
        monthlyViews,
        impressions,
        engagements,
        outboundClicks,
        saves,
        followersRaw: followers >= 1000 ? `${(followers / 1000).toFixed(1)}k` : String(followers),
        monthlyViewsRaw: monthlyViews >= 1000 ? `${(monthlyViews / 1000).toFixed(1)}k` : String(monthlyViews),
        timestamp,
        snapshotDate
      };

      try {
        const result = await this.saveAnalyticsSnapshot(item);
        seeded.push(result);
      } catch (e) {
        // Ignore duplicate inserts
      }
    }
    return seeded;
  }

  public async close(): Promise<void> {
    await this.driver.close();
  }
}

