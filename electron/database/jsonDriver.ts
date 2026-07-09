import * as fs from 'fs';
import { DbDriver } from './db';

interface DatabaseState {
  accounts: any[];
  boards: any[];
  drafts: any[];
  queue_jobs: any[];
  settings: any[];
  logs: any[];
  repin_jobs: any[];
}

export class JsonDriver implements DbDriver {
  private filePath!: string;
  private state!: DatabaseState;
  private logAutoId = 1;

  public async connect(filePath: string): Promise<void> {
    this.filePath = filePath;
    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        this.state = JSON.parse(fileContent);
        // Clean missing fields
        this.state.accounts = this.state.accounts || [];
        this.state.boards = this.state.boards || [];
        this.state.drafts = this.state.drafts || [];
        this.state.queue_jobs = this.state.queue_jobs || [];
        this.state.settings = this.state.settings || [];
        this.state.logs = this.state.logs || [];
        this.state.repin_jobs = this.state.repin_jobs || [];
        
        // Recover log auto id
        if (this.state.logs.length > 0) {
          const maxId = Math.max(...this.state.logs.map(l => l.id || 0));
          this.logAutoId = maxId + 1;
        }
      } catch (e) {
        console.error('Failed to load JSON database, creating empty database:', e);
        this.createEmptyState();
      }
    } else {
      this.createEmptyState();
      this.saveState();
    }
  }

  private createEmptyState() {
    this.state = {
      accounts: [],
      boards: [],
      drafts: [],
      queue_jobs: [],
      settings: [],
      logs: [],
      repin_jobs: []
    };
  }

  private saveState() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save JSON DB state:', e);
    }
  }

  public async query<T>(sql: string, params: any[] = []): Promise<T[]> {
    const cleanSql = sql.trim().replace(/\s+/g, ' ').toLowerCase();

    // Accounts
    if (cleanSql.includes('select * from accounts')) {
      let accounts = [...this.state.accounts];
      if (cleanSql.includes('where id = ?')) {
        const id = params[0];
        accounts = accounts.filter(a => a.id === id);
      }
      if (cleanSql.includes('order by nickname asc')) {
        accounts.sort((a, b) => a.nickname.localeCompare(b.nickname));
      }
      return accounts as T[];
    }

    // Boards
    if (cleanSql.includes('select * from boards')) {
      let boards = [...this.state.boards];
      if (cleanSql.includes('where accountid = ?')) {
        const accId = params[0];
        boards = boards.filter(b => b.accountId === accId);
      }
      if (cleanSql.includes('where id = ?')) {
        const id = params[0];
        boards = boards.filter(b => b.id === id);
      }
      if (cleanSql.includes('order by name asc')) {
        boards.sort((a, b) => a.name.localeCompare(b.name));
      }
      return boards as T[];
    }

    // Drafts
    if (cleanSql.includes('select * from drafts')) {
      let drafts = [...this.state.drafts];
      if (cleanSql.includes('where id = ?')) {
        const id = params[0];
        drafts = drafts.filter(d => d.id === id);
      }
      if (cleanSql.includes('order by updatedat desc')) {
        drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      }
      return drafts as T[];
    }

    // Queue Jobs
    if (cleanSql.includes('select * from queue_jobs')) {
      let queue = [...this.state.queue_jobs];
      if (cleanSql.includes('where id = ?')) {
        const id = params[0];
        queue = queue.filter(q => q.id === id);
      }
      if (cleanSql.includes('order by createdat asc')) {
        queue.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      }
      return queue as T[];
    }

    // Settings
    if (cleanSql.includes('select * from settings')) {
      let settings = [...this.state.settings];
      if (cleanSql.includes('where key = ?')) {
        const key = params[0];
        settings = settings.filter(s => s.key === key);
      }
      return settings as T[];
    }

    // Repin Jobs
    if (cleanSql.includes('select * from repin_jobs')) {
      let repin_jobs = [...this.state.repin_jobs];
      if (cleanSql.includes('where id = ?')) {
        const id = params[0];
        repin_jobs = repin_jobs.filter(r => r.id === id);
      }
      if (cleanSql.includes('order by createdat asc')) {
        repin_jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      }
      return repin_jobs as T[];
    }

    // PRAGMA queries (used by SQLite migrations — return empty for JSON driver, migrations are no-ops)
    if (cleanSql.includes('pragma table_info')) {
      return [] as T[]; // JSON driver doesn't need migrations
    }

    // Logs
    if (cleanSql.includes('select * from logs')) {
      let logs = [...this.state.logs];
      if (cleanSql.includes('order by createdat desc')) {
        logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      }
      if (cleanSql.includes('limit ?')) {
        const limit = params[params.length - 1] || 100;
        logs = logs.slice(0, limit);
      }
      return logs as T[];
    }

    throw new Error(`JSON DB: query not supported: ${sql}`);
  }

  public async run(sql: string, params: any[] = []): Promise<{ lastID: any; changes: number }> {
    const cleanSql = sql.trim().replace(/\s+/g, ' ');
    const lowerSql = cleanSql.toLowerCase();

    // Accounts operations
    if (lowerSql.startsWith('insert into accounts')) {
      // (id, nickname, email, password, profilePath, sessionStatus, createdAt, updatedAt, lastUsedAt, username, avatarUrl)
      const [id, nickname, email, password, profilePath, sessionStatus, createdAt, updatedAt, lastUsedAt, username, avatarUrl] = params;
      this.state.accounts.push({ 
        id, 
        nickname, 
        email: email || null, 
        password: password || null, 
        profilePath, 
        sessionStatus, 
        createdAt, 
        updatedAt, 
        lastUsedAt: lastUsedAt || null,
        username: username || null,
        avatarUrl: avatarUrl || null
      });
      this.saveState();
      return { lastID: id, changes: 1 };
    }

    if (lowerSql.startsWith('update accounts set')) {
      // UPDATE accounts SET nickname = ?, email = ?, password = ?, profilePath = ?, sessionStatus = ?, updatedAt = ?, lastUsedAt = ?, username = ?, avatarUrl = ? WHERE id = ?
      const [nickname, email, password, profilePath, sessionStatus, updatedAt, lastUsedAt, username, avatarUrl, id] = params;
      const idx = this.state.accounts.findIndex(a => a.id === id);
      if (idx !== -1) {
        this.state.accounts[idx] = { 
          ...this.state.accounts[idx], 
          nickname, 
          email: email || null, 
          password: password || null, 
          profilePath, 
          sessionStatus, 
          updatedAt, 
          lastUsedAt: lastUsedAt || null,
          username: username || null,
          avatarUrl: avatarUrl || null
        };
        this.saveState();
        return { lastID: id, changes: 1 };
      }
      return { lastID: null, changes: 0 };
    }

    if (lowerSql.startsWith('delete from accounts where id = ?')) {
      const id = params[0];
      const origLen = this.state.accounts.length;
      this.state.accounts = this.state.accounts.filter(a => a.id !== id);
      this.saveState();
      return { lastID: null, changes: origLen - this.state.accounts.length };
    }

    // Boards operations
    if (lowerSql.startsWith('insert into boards')) {
      // (id, accountId, name, url, lastFetchedAt)
      const [id, accountId, name, url, lastFetchedAt] = params;
      this.state.boards.push({ id, accountId, name, url, lastFetchedAt });
      this.saveState();
      return { lastID: id, changes: 1 };
    }

    if (lowerSql.startsWith('update boards set')) {
      // UPDATE boards SET name = ?, url = ?, lastFetchedAt = ? WHERE id = ?
      const [name, url, lastFetchedAt, id] = params;
      const idx = this.state.boards.findIndex(b => b.id === id);
      if (idx !== -1) {
        this.state.boards[idx] = { ...this.state.boards[idx], name, url, lastFetchedAt };
        this.saveState();
        return { lastID: id, changes: 1 };
      }
      return { lastID: null, changes: 0 };
    }

    if (lowerSql.startsWith('delete from boards where accountid = ?')) {
      const accId = params[0];
      const origLen = this.state.boards.length;
      this.state.boards = this.state.boards.filter(b => b.accountId !== accId);
      this.saveState();
      return { lastID: null, changes: origLen - this.state.boards.length };
    }

    if (lowerSql.startsWith('delete from boards where id = ?')) {
      const id = params[0];
      const origLen = this.state.boards.length;
      this.state.boards = this.state.boards.filter(b => b.id !== id);
      this.saveState();
      return { lastID: null, changes: origLen - this.state.boards.length };
    }

    // Drafts operations
    if (lowerSql.startsWith('insert into drafts')) {
      // (id, title, description, destinationUrl, altText, notes, imagePath, createdAt, updatedAt, accountId, boardName, boardUrl, scheduledDate, scheduledTime)
      const [id, title, description, destinationUrl, altText, notes, imagePath, createdAt, updatedAt, accountId, boardName, boardUrl, scheduledDate, scheduledTime] = params;
      this.state.drafts.push({ id, title, description, destinationUrl, altText, notes, imagePath, createdAt, updatedAt, accountId: accountId || null, boardName: boardName || null, boardUrl: boardUrl || null, scheduledDate: scheduledDate || null, scheduledTime: scheduledTime || null });
      this.saveState();
      return { lastID: id, changes: 1 };
    }

    if (lowerSql.startsWith('update drafts set')) {
      // UPDATE drafts SET title=?, description=?, destinationUrl=?, altText=?, notes=?, imagePath=?, updatedAt=?, accountId=?, boardName=?, boardUrl=?, scheduledDate=?, scheduledTime=? WHERE id=?
      const [title, description, destinationUrl, altText, notes, imagePath, updatedAt, accountId, boardName, boardUrl, scheduledDate, scheduledTime, id] = params;
      const idx = this.state.drafts.findIndex(d => d.id === id);
      if (idx !== -1) {
        this.state.drafts[idx] = { ...this.state.drafts[idx], title, description, destinationUrl, altText, notes, imagePath, updatedAt, accountId: accountId || null, boardName: boardName || null, boardUrl: boardUrl || null, scheduledDate: scheduledDate || null, scheduledTime: scheduledTime || null };
        this.saveState();
        return { lastID: id, changes: 1 };
      }
      return { lastID: null, changes: 0 };
    }

    if (lowerSql.startsWith('delete from drafts where id = ?')) {
      const id = params[0];
      const origLen = this.state.drafts.length;
      this.state.drafts = this.state.drafts.filter(d => d.id !== id);
      this.saveState();
      return { lastID: null, changes: origLen - this.state.drafts.length };
    }

    // Queue Jobs operations
    if (lowerSql.startsWith('insert into queue_jobs')) {
      // id, accountId, boardName, boardUrl, imagePath, title, description, destinationUrl, altText, notes, status, errorMessage, screenshotPath, createdAt, startedAt, completedAt, scheduledDate, scheduledTime, livePinUrl
      const [id, accountId, boardName, boardUrl, imagePath, title, description, destinationUrl, altText, notes, status, errorMessage, screenshotPath, createdAt, startedAt, completedAt, scheduledDate, scheduledTime, livePinUrl] = params;
      this.state.queue_jobs.push({ id, accountId, boardName, boardUrl, imagePath, title, description, destinationUrl, altText, notes, status, errorMessage: errorMessage || null, screenshotPath: screenshotPath || null, createdAt, startedAt: startedAt || null, completedAt: completedAt || null, scheduledDate: scheduledDate || null, scheduledTime: scheduledTime || null, livePinUrl: livePinUrl || null });
      this.saveState();
      return { lastID: id, changes: 1 };
    }

    if (lowerSql.startsWith('update queue_jobs set')) {
      // UPDATE queue_jobs SET accountId=?, boardName=?, boardUrl=?, imagePath=?, title=?, description=?, destinationUrl=?, altText=?, notes=?, status=?, errorMessage=?, screenshotPath=?, startedAt=?, completedAt=?, scheduledDate=?, scheduledTime=?, livePinUrl=? WHERE id=?
      const id = params[params.length - 1];
      const [accountId, boardName, boardUrl, imagePath, title, description, destinationUrl, altText, notes, status, errorMessage, screenshotPath, startedAt, completedAt, scheduledDate, scheduledTime, livePinUrl] = params;
      const idx = this.state.queue_jobs.findIndex(q => q.id === id);
      if (idx !== -1) {
        this.state.queue_jobs[idx] = { ...this.state.queue_jobs[idx], accountId, boardName, boardUrl, imagePath, title, description, destinationUrl, altText, notes, status, errorMessage: errorMessage || null, screenshotPath: screenshotPath || null, startedAt: startedAt || null, completedAt: completedAt || null, scheduledDate: scheduledDate || null, scheduledTime: scheduledTime || null, livePinUrl: livePinUrl || null };
        this.saveState();
        return { lastID: id, changes: 1 };
      }
      return { lastID: null, changes: 0 };
    }

    if (lowerSql.startsWith('delete from queue_jobs where id = ?')) {
      const id = params[0];
      const origLen = this.state.queue_jobs.length;
      this.state.queue_jobs = this.state.queue_jobs.filter(q => q.id !== id);
      this.saveState();
      return { lastID: null, changes: origLen - this.state.queue_jobs.length };
    }

    if (lowerSql.startsWith("delete from queue_jobs where status !=")) {
      // delete from queue_jobs where status != 'running'
      const origLen = this.state.queue_jobs.length;
      this.state.queue_jobs = this.state.queue_jobs.filter(q => q.status === 'running');
      this.saveState();
      return { lastID: null, changes: origLen - this.state.queue_jobs.length };
    }

    // Repin Jobs operations
    if (lowerSql.startsWith('insert into repin_jobs')) {
      const [id, accountId, boardName, keywords, count, status, errorMessage, createdAt, startedAt, completedAt] = params;
      this.state.repin_jobs.push({ id, accountId, boardName, keywords, count, status, errorMessage: errorMessage || null, createdAt, startedAt: startedAt || null, completedAt: completedAt || null });
      this.saveState();
      return { lastID: id, changes: 1 };
    }

    if (lowerSql.startsWith('update repin_jobs set')) {
      const id = params[params.length - 1];
      const [accountId, boardName, keywords, count, status, errorMessage, startedAt, completedAt] = params;
      const idx = this.state.repin_jobs.findIndex(r => r.id === id);
      if (idx !== -1) {
        this.state.repin_jobs[idx] = { ...this.state.repin_jobs[idx], accountId, boardName, keywords, count, status, errorMessage: errorMessage || null, startedAt: startedAt || null, completedAt: completedAt || null };
        this.saveState();
        return { lastID: id, changes: 1 };
      }
      return { lastID: null, changes: 0 };
    }

    if (lowerSql.startsWith('delete from repin_jobs where id = ?')) {
      const id = params[0];
      const origLen = this.state.repin_jobs.length;
      this.state.repin_jobs = this.state.repin_jobs.filter(r => r.id !== id);
      this.saveState();
      return { lastID: null, changes: origLen - this.state.repin_jobs.length };
    }

    // ALTER TABLE (no-op for JSON driver — schema is schemaless)
    if (lowerSql.startsWith('alter table')) {
      return { lastID: null, changes: 0 };
    }

    // Settings operations
    if (lowerSql.startsWith('insert into settings') || lowerSql.startsWith('insert or ignore into settings')) {
      // key, value
      const [key, value] = params;
      const existing = this.state.settings.find(s => s.key === key);
      if (!existing) {
        this.state.settings.push({ key, value });
        this.saveState();
      }
      return { lastID: key, changes: 1 };
    }

    if (lowerSql.startsWith('update settings set')) {
      // UPDATE settings SET value = ? WHERE key = ?
      const [value, key] = params;
      const idx = this.state.settings.findIndex(s => s.key === key);
      if (idx !== -1) {
        this.state.settings[idx].value = value;
        this.saveState();
        return { lastID: key, changes: 1 };
      }
      return { lastID: null, changes: 0 };
    }

    // Logs operations
    if (lowerSql.startsWith('insert into logs')) {
      // (level, message, context, createdAt)
      const [level, message, context, createdAt] = params;
      const log = { id: this.logAutoId++, level, message, context, createdAt };
      this.state.logs.push(log);
      this.saveState();
      return { lastID: log.id, changes: 1 };
    }

    if (lowerSql.startsWith('delete from logs')) {
      const origLen = this.state.logs.length;
      this.state.logs = [];
      this.saveState();
      return { lastID: null, changes: origLen };
    }

    throw new Error(`JSON DB: run command not supported: ${sql}`);
  }

  public async close(): Promise<void> {
    this.saveState();
  }
}
