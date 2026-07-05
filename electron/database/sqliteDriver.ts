import * as sqlite3 from 'sqlite3';
import { DbDriver } from './db';

// Enable verbose mode for better debug logs
const sqlite = sqlite3.verbose();

export class SqliteDriver implements DbDriver {
  private db: sqlite3.Database | null = null;

  public connect(dbPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite.Database(dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          // Enable foreign keys and set busy timeout
          this.db?.serialize(() => {
            this.db?.run('PRAGMA foreign_keys = ON;');
            this.db?.run('PRAGMA busy_timeout = 5000;', (pragmaErr) => {
              if (pragmaErr) {
                console.warn('Could not set busy timeout in SQLite:', pragmaErr);
              }
              resolve();
            });
          });
        }
      });
    });
  }

  public query<T>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject(new Error('Database not connected'));
      }
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  public run(sql: string, params: any[] = []): Promise<{ lastID: any; changes: number }> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return reject(new Error('Database not connected'));
      }
      this.db.run(sql, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            lastID: this.lastID,
            changes: this.changes
          });
        }
      });
    });
  }

  public close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        return resolve();
      }
      this.db.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.db = null;
          resolve();
        }
      });
    });
  }
}
