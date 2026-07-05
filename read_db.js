const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');
const fs = require('fs');

const dbPath = path.join(os.homedir(), 'AppData/Roaming/pinterest-pin-publisher/local-data/app.db');

console.log('Checking SQLite...');
if (fs.existsSync(dbPath)) {
  const db = new sqlite3.Database(dbPath);
  db.all('SELECT * FROM accounts', (err, rows) => {
    if (err) {
      console.error('Query error:', err);
    } else {
      console.log('SQLite accounts:', rows);
    }
    db.close();
  });
} else {
  console.log('DB file not found');
}
