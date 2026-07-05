const { BoardResolver } = require('./dist-electron/publisher/boardResolver');
const { DbManager } = require('./dist-electron/database/db');
const path = require('path');
const os = require('os');

async function testScrape() {
  const localDataDir = path.join(os.homedir(), 'AppData/Roaming/pinterest-pin-publisher/local-data');
  const db = new DbManager(localDataDir);
  await db.init();

  console.log('DB Initialized. Querying accounts...');
  const accounts = await db.query('SELECT * FROM accounts');
  console.log('Found accounts:', accounts);

  if (accounts.length === 0) {
    console.error('No accounts found in database to scrape!');
    await db.close();
    return;
  }

  const account = accounts[0];
  console.log(`Running BoardResolver on account: ${account.nickname}`);

  const resolver = new BoardResolver(db);
  try {
    const boards = await resolver.fetchBoards(account);
    console.log('\n======================================');
    console.log(`SUCCESS! Scraped ${boards.length} live boards:`);
    boards.forEach(b => console.log(`- ${b.name} (${b.url})`));
    console.log('======================================\n');
  } catch (e) {
    console.error('\n======================================');
    console.error('SCRAPING FAILED:', e.message);
    if (e.stack) console.error(e.stack);
    console.log('======================================\n');
  } finally {
    await db.close();
  }
}

testScrape();
