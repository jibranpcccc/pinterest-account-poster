import fs from 'fs';
import path from 'path';
import { db } from './electron/database/db'; // adjust path to db if necessary or mock it
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function addAccounts() {
  const dbPath = path.join(process.env.APPDATA || process.env.HOME || '', 'pinterest-pin-publisher', 'local-data', 'database.sqlite');
  
  // if standard path fails, use local data dir from project root as fallback
  const localDbPath = path.join(__dirname, 'local-data', 'database.sqlite');
  
  let targetDbPath = dbPath;
  if (!fs.existsSync(dbPath)) {
    targetDbPath = localDbPath;
  }
  
  if (!fs.existsSync(targetDbPath)) {
      console.log('DB not found at', targetDbPath);
      return;
  }
  console.log('Using DB:', targetDbPath);
  
  const database = await open({
    filename: targetDbPath,
    driver: sqlite3.Database
  });

  const raw = fs.readFileSync('accounts_raw.txt', 'utf8');
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l);

  let added = 0;
  let skipped = 0;

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length >= 2) {
      const id = parts[0];
      const session = parts[1]; // Using the second part as some kind of reference or password if we wanted
      
      // Check if exists
      const existing = await database.get('SELECT id FROM accounts WHERE nickname = ?', [id]);
      if (existing) {
        skipped++;
        continue;
      }

      // Add
      const profilePath = path.join(process.env.APPDATA || process.env.HOME || '', 'pinterest-pin-publisher', 'local-data', 'profiles', id);
      
      const sql = `
        INSERT INTO accounts (id, nickname, password, profilePath, sessionStatus, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      await database.run(sql, [
        id, 
        id, 
        session, // Storing the second string as password just in case it's a proxy or auth token
        profilePath, 
        'disconnected', 
        new Date().toISOString(), 
        new Date().toISOString()
      ]);
      
      added++;
    }
  }

  console.log(`Done. Added: ${added}, Skipped (duplicate): ${skipped}`);
}

addAccounts().catch(console.error);
