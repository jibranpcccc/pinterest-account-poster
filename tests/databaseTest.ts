import * as path from 'path';
import * as fs from 'fs';
import { JsonDriver } from '../electron/database/jsonDriver';

async function testJsonDriver() {
  const testDbPath = path.join(__dirname, 'test-temp-db.json');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  const driver = new JsonDriver();
  await driver.connect(testDbPath);

  console.log('Inserting sample repin_jobs...');
  await driver.run(
    'insert into repin_jobs (id, accountId, boardName, keywords, count, status, errorMessage, createdAt, startedAt, completedAt) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ['job-1', 'acc-1', 'Board A', 'shoes, fashion', 5, 'pending', null, new Date().toISOString(), null, null]
  );
  await driver.run(
    'insert into repin_jobs (id, accountId, boardName, keywords, count, status, errorMessage, createdAt, startedAt, completedAt) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ['job-2', 'acc-1', 'Board A', 'shoes, fashion', 5, 'completed', null, new Date().toISOString(), null, new Date().toISOString()]
  );
  await driver.run(
    'insert into repin_jobs (id, accountId, boardName, keywords, count, status, errorMessage, createdAt, startedAt, completedAt) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ['job-3', 'acc-1', 'Board B', 'cars', 3, 'failed', 'Error description', new Date().toISOString(), null, new Date().toISOString()]
  );

  console.log('Querying all jobs...');
  const allJobs = await driver.query<any>('SELECT * FROM repin_jobs');
  console.log(`Found ${allJobs.length} jobs (expected 3)`);
  if (allJobs.length !== 3) throw new Error('Expected 3 jobs');

  console.log("Querying pending jobs with explicit status = 'pending'...");
  const pendingJobs = await driver.query<any>("SELECT * FROM repin_jobs WHERE status = 'pending' ORDER BY createdAt ASC LIMIT 1");
  console.log(`Found ${pendingJobs.length} pending jobs (expected 1)`);
  if (pendingJobs.length !== 1) throw new Error('Expected 1 pending job');
  if (pendingJobs[0].id !== 'job-1') throw new Error('Expected job-1 to be pending');

  console.log('Querying jobs with status placeholder status = ?...');
  const completedJobs = await driver.query<any>('SELECT * FROM repin_jobs WHERE status = ?', ['completed']);
  console.log(`Found ${completedJobs.length} completed jobs (expected 1)`);
  if (completedJobs.length !== 1) throw new Error('Expected 1 completed job');
  if (completedJobs[0].id !== 'job-2') throw new Error('Expected job-2 to be completed');

  console.log('Querying jobs with status placeholder and id placeholder status = ? and id = ?...');
  const specificJob = await driver.query<any>('SELECT * FROM repin_jobs WHERE status = ? AND id = ?', ['completed', 'job-2']);
  console.log(`Found ${specificJob.length} specific jobs (expected 1)`);
  if (specificJob.length !== 1) throw new Error('Expected 1 specific job');

  console.log('Querying non-existent status...');
  const noJobs = await driver.query<any>('SELECT * FROM repin_jobs WHERE status = ?', ['non-existent']);
  console.log(`Found ${noJobs.length} jobs (expected 0)`);
  if (noJobs.length !== 0) throw new Error('Expected 0 jobs');

  // Clean up
  await driver.close();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  console.log('✅ JsonDriver status filtering tests passed!');
}

testJsonDriver().catch(err => {
  console.error('❌ testJsonDriver failed:', err);
  process.exit(1);
});
