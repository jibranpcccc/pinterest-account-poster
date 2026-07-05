const { DbManager } = require('./dist-electron/database/db');
const path = require('path');
const os = require('os');

async function runScraper() {
  const localDataDir = path.join(os.homedir(), 'AppData/Roaming/pinterest-pin-publisher/local-data');
  const db = new DbManager(localDataDir);
  await db.init();

  const accounts = await db.query('SELECT * FROM accounts');
  if (accounts.length === 0) {
    console.error('No accounts found.');
    await db.close();
    return;
  }

  const account = accounts[0];
  console.log(`Launching board scraper for: ${account.nickname}`);

  // Dynamically load the compiled BoardResolver
  const { BoardResolver } = require('./dist-electron/publisher/boardResolver');
  const resolver = new BoardResolver(db);

  try {
    const boards = await resolver.fetchBoards(account);
    console.log(`\nSUCCESS! Fetched ${boards.length} boards:`);
    boards.forEach(b => console.log(`- ${b.name}: ${b.url}`));
  } catch (err) {
    console.error('Scraping error:', err.message);
    if (err.stack) console.error(err.stack);
  } finally {
    await db.close();
  }
}

runScraper();
