// Adversarial test script for DB save & unschedule pathways
// challenger_m4_ui_2 task

const path = require('path');
const fs = require('fs');
const assert = require('assert').strict;
const { DbManager } = require('../electron/database/db');

async function runDbTests() {
  console.log('🧪 Starting Database Autosave & Unschedule IPC Pathway tests...');
  
  const testLocalDataDir = path.join(__dirname, 'test-local-data-db');
  if (!fs.existsSync(testLocalDataDir)) {
    fs.mkdirSync(testLocalDataDir, { recursive: true });
  }

  // Ensure clean DB file
  const dbPath = path.join(testLocalDataDir, 'app.json');
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  const db = new DbManager(testLocalDataDir);
  await db.init();

  // Create a mock account to satisfy foreign key constraint
  const account = {
    id: 'acc-test-1',
    nickname: 'Test Account',
    profilePath: 'profile/path',
    sessionStatus: 'connected',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await db.saveAccount(account);

  // 1. Insert a queue job
  const originalJob = {
    id: 'job-1',
    accountId: 'acc-test-1',
    boardName: 'Board A',
    boardUrl: 'https://pinterest.com/board-a',
    imagePath: 'C:\\path\\to\\image.png',
    title: 'Adversarial Title',
    description: 'Adversarial Description',
    destinationUrl: 'https://mysite.com/dest',
    altText: 'Alt text here',
    notes: 'Important notes',
    status: 'pending',
    createdAt: '2026-07-16T12:00:00Z', // Handled specially on insert, but let's see what happens
    startedAt: null,
    completedAt: null
  };

  console.log('\n--- Test 1: Insert new QueueJob ---');
  const insertedJob = await db.saveQueueJob(originalJob);
  console.log(`Job inserted. ID: ${insertedJob.id}, createdAt: ${insertedJob.createdAt}`);
  assert.strictEqual(insertedJob.title, originalJob.title);
  assert.strictEqual(insertedJob.description, originalJob.description);
  assert.strictEqual(insertedJob.status, 'pending');

  // 2. Perform schedule edit (Simulate Inline Autosave edit)
  console.log('\n--- Test 2: Simulate Schedule Update (Autosave) ---');
  const scheduleUpdate = {
    ...insertedJob,
    scheduledDate: '2026-07-20',
    scheduledTime: '03:30 PM',
    status: 'scheduled'
  };

  const updatedJob = await db.saveQueueJob(scheduleUpdate);
  
  // Verify that schedule columns are updated
  assert.strictEqual(updatedJob.scheduledDate, '2026-07-20');
  assert.strictEqual(updatedJob.scheduledTime, '03:30 PM');
  assert.strictEqual(updatedJob.status, 'scheduled');
  
  // Verify that other fields are NOT changed or reset
  assert.strictEqual(updatedJob.title, originalJob.title);
  assert.strictEqual(updatedJob.description, originalJob.description);
  assert.strictEqual(updatedJob.imagePath, originalJob.imagePath);
  assert.strictEqual(updatedJob.accountId, originalJob.accountId);
  assert.strictEqual(updatedJob.createdAt, insertedJob.createdAt); // createdAt must be preserved!
  console.log('✅ Update successful. Scheduled columns set, other fields (including createdAt) preserved.');

  // 3. Unschedule (Simulate Unschedule IPC Pathway)
  console.log('\n--- Test 3: Simulate Unschedule ---');
  const unscheduleUpdate = {
    ...updatedJob,
    status: 'pending',
    scheduledDate: null,
    scheduledTime: null
  };

  const unscheduledJob = await db.saveQueueJob(unscheduleUpdate);

  // Verify that schedule columns are cleared
  assert.strictEqual(unscheduledJob.scheduledDate, null);
  assert.strictEqual(unscheduledJob.scheduledTime, null);
  assert.strictEqual(unscheduledJob.status, 'pending');

  // Verify that other fields are still preserved
  assert.strictEqual(unscheduledJob.title, originalJob.title);
  assert.strictEqual(unscheduledJob.description, originalJob.description);
  assert.strictEqual(unscheduledJob.imagePath, originalJob.imagePath);
  assert.strictEqual(unscheduledJob.createdAt, insertedJob.createdAt);
  console.log('✅ Unschedule successful. Scheduled columns cleared, other fields preserved.');

  // Clean up
  await db.close();
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  if (fs.existsSync(testLocalDataDir)) {
    fs.rmdirSync(testLocalDataDir);
  }
  console.log('\n🎉 All DB Autosave & Unschedule tests passed!');
}

runDbTests().catch(err => {
  console.error('\n❌ DB test failed:', err);
  process.exit(1);
});
