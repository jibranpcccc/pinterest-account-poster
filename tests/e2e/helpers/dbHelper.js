const fs = require('fs');
const path = require('path');

class DbHelper {
  constructor(userDataDir) {
    this.userDataDir = userDataDir;
    this.localDataDir = path.join(userDataDir, 'local-data');
    this.jsonPath = path.join(this.localDataDir, 'app.json');
    this.sqlitePath = path.join(this.localDataDir, 'app.db');
  }

  async init() {
    if (!fs.existsSync(this.localDataDir)) {
      fs.mkdirSync(this.localDataDir, { recursive: true });
    }
  }

  async clear() {
    if (fs.existsSync(this.jsonPath)) {
      try { fs.unlinkSync(this.jsonPath); } catch (e) {}
    }
    if (fs.existsSync(this.sqlitePath)) {
      try { fs.unlinkSync(this.sqlitePath); } catch (e) {}
    }
  }

  async seed(data = {}) {
    await this.init();

    // Prepare JSON structures
    const jsonState = {
      accounts: data.accounts || [],
      boards: data.boards || [],
      drafts: data.drafts || [],
      queue_jobs: data.queue_jobs || [],
      settings: data.settings || [],
      logs: data.logs || [],
      repin_jobs: data.repin_jobs || []
    };

    // Ensure mockMode setting is seeded
    const hasMockModeSetting = jsonState.settings.some(s => s.key === 'mockMode');
    if (!hasMockModeSetting) {
      jsonState.settings.push({ key: 'mockMode', value: 'true' });
    }

    // Write to JSON database file
    fs.writeFileSync(this.jsonPath, JSON.stringify(jsonState, null, 2), 'utf8');

    // Seed SQLite database
    try {
      const sqlite3 = require('sqlite3').verbose();
      const db = new sqlite3.Database(this.sqlitePath);
      await new Promise((resolve, reject) => {
        db.serialize(() => {
          db.run(`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, nickname TEXT, profilePath TEXT, sessionStatus TEXT, createdAt TEXT, updatedAt TEXT, lastUsedAt TEXT, username TEXT, avatarUrl TEXT, email TEXT, password TEXT)`);
          db.run(`CREATE TABLE IF NOT EXISTS boards (id TEXT PRIMARY KEY, accountId TEXT, name TEXT, url TEXT, lastFetchedAt TEXT)`);
          db.run(`CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, title TEXT, description TEXT, destinationUrl TEXT, altText TEXT, notes TEXT, imagePath TEXT, accountId TEXT, boardName TEXT, boardUrl TEXT, scheduledDate TEXT, scheduledTime TEXT, createdAt TEXT, updatedAt TEXT)`);
          db.run(`CREATE TABLE IF NOT EXISTS queue_jobs (id TEXT PRIMARY KEY, accountId TEXT, boardName TEXT, boardUrl TEXT, imagePath TEXT, title TEXT, description TEXT, destinationUrl TEXT, altText TEXT, notes TEXT, status TEXT, errorMessage TEXT, screenshotPath TEXT, scheduledDate TEXT, scheduledTime TEXT, createdAt TEXT, startedAt TEXT, completedAt TEXT, livePinUrl TEXT)`);
          db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
          db.run(`CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, level TEXT, message TEXT, context TEXT, createdAt TEXT)`);
          db.run(`CREATE TABLE IF NOT EXISTS repin_jobs (id TEXT PRIMARY KEY, accountId TEXT, boardName TEXT, keywords TEXT, count INTEGER, status TEXT, errorMessage TEXT, createdAt TEXT, startedAt TEXT, completedAt TEXT)`);
          
          for (const acc of jsonState.accounts) {
            db.run(`INSERT OR REPLACE INTO accounts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
              [acc.id, acc.nickname, acc.profilePath, acc.sessionStatus, acc.createdAt, acc.updatedAt, acc.lastUsedAt || null, acc.username || null, acc.avatarUrl || null, acc.email || null, acc.password || null]);
          }
          for (const board of jsonState.boards) {
            db.run(`INSERT OR REPLACE INTO boards VALUES (?, ?, ?, ?, ?)`, 
              [board.id, board.accountId, board.name, board.url, board.lastFetchedAt]);
          }
          for (const dr of jsonState.drafts) {
            db.run(`INSERT OR REPLACE INTO drafts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
              [dr.id, dr.title, dr.description, dr.destinationUrl, dr.altText, dr.notes, dr.imagePath, dr.accountId || null, dr.boardName || null, dr.boardUrl || null, dr.scheduledDate || null, dr.scheduledTime || null, dr.createdAt, dr.updatedAt]);
          }
          for (const job of jsonState.queue_jobs) {
            db.run(`INSERT OR REPLACE INTO queue_jobs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
              [job.id, job.accountId, job.boardName, job.boardUrl, job.imagePath, job.title, job.description, job.destinationUrl, job.altText, job.notes, job.status, job.errorMessage || null, job.screenshotPath || null, job.scheduledDate || null, job.scheduledTime || null, job.createdAt, job.startedAt || null, job.completedAt || null, job.livePinUrl || null]);
          }
          for (const setting of jsonState.settings) {
            db.run(`INSERT OR REPLACE INTO settings VALUES (?, ?)`, 
              [setting.key, typeof setting.value === 'string' ? setting.value : JSON.stringify(setting.value)]);
          }
          resolve();
        });
      });
      db.close();
    } catch (e) {
      // Fallback works automatically
    }
  }

  async readState() {
    if (fs.existsSync(this.jsonPath)) {
      try {
        return JSON.parse(fs.readFileSync(this.jsonPath, 'utf8'));
      } catch (e) {}
    }
    try {
      const sqlite3 = require('sqlite3').verbose();
      const db = new sqlite3.Database(this.sqlitePath);
      const state = { accounts: [], boards: [], drafts: [], queue_jobs: [], settings: [], logs: [], repin_jobs: [] };
      const query = (sql) => new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      state.accounts = await query('SELECT * FROM accounts');
      state.boards = await query('SELECT * FROM boards');
      state.drafts = await query('SELECT * FROM drafts');
      state.queue_jobs = await query('SELECT * FROM queue_jobs');
      state.settings = await query('SELECT * FROM settings');
      db.close();
      return state;
    } catch (e) {
      return { accounts: [], boards: [], drafts: [], queue_jobs: [], settings: [], logs: [], repin_jobs: [] };
    }
  }
}

module.exports = DbHelper;
