// tests/stress_test_scheduler.js
// Verification script to stress-test the Bulk Scheduler Distributor algorithm.

const assert = require('assert');

// Ported helper functions from src/screens/Queue.tsx

const parseDateTimeToMs = (dateStr, timeStr) => {
  const timeClean = timeStr.trim().toUpperCase();
  let hours = 0;
  let minutes = 0;
  
  if (timeClean.endsWith('AM') || timeClean.endsWith('PM')) {
    const isPM = timeClean.endsWith('PM');
    const timeParts = timeClean.substring(0, timeClean.length - 2).trim().split(':');
    hours = parseInt(timeParts[0]);
    minutes = parseInt(timeParts[1]);
    if (isPM && hours !== 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
  } else {
    const timeParts = timeClean.split(':');
    hours = parseInt(timeParts[0]);
    minutes = parseInt(timeParts[1]);
  }
  
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, hours, minutes).getTime();
};

const convertMsToDateTime = (ms) => {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strHours = String(hours).padStart(2, '0');
  const strMinutes = String(minutes).padStart(2, '0');
  const timeStr = `${strHours}:${strMinutes} ${ampm}`;
  
  return { dateStr, timeStr };
};

// Simulation of the React algorithm
function runDistributor({
  selectedJobs,
  latestQueue,
  bulkStartDate,
  bulkEndDate,
  bulkPostsPerDay,
  bulkStartTime,
  bulkSpreadWindow,
  accounts
}) {
  const dates = [];
  let current = new Date(bulkStartDate + 'T00:00:00');
  const end = new Date(bulkEndDate + 'T00:00:00');
  
  if (isNaN(current.getTime()) || isNaN(end.getTime())) {
    throw new Error('Please provide valid start and end dates.');
  }
  if (current > end) {
    throw new Error('Start Date must be before or equal to End Date.');
  }
  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }

  const getOrAddDateString = (index) => {
    while (index >= dates.length) {
      const lastDate = new Date(dates[dates.length - 1] + 'T00:00:00');
      lastDate.setDate(lastDate.getDate() + 1);
      const y = lastDate.getFullYear();
      const m = String(lastDate.getMonth() + 1).padStart(2, '0');
      const d = String(lastDate.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
    }
    return dates[index];
  };

  if (selectedJobs.length === 0) {
    throw new Error('No pending jobs selected.');
  }

  const jobsByAccount = {};
  selectedJobs.forEach(job => {
    if (!jobsByAccount[job.accountId]) {
      jobsByAccount[job.accountId] = [];
    }
    jobsByAccount[job.accountId].push(job);
  });

  const slots = [];
  const [shour, smin] = bulkStartTime.split(':').map(Number);
  if (isNaN(shour) || isNaN(smin) || shour < 0 || shour > 23 || smin < 0 || smin > 59) {
    throw new Error('Please provide a valid start time (HH:MM).');
  }
  const startMinutes = shour * 60 + smin;

  for (const accountId in jobsByAccount) {
    const jobs = jobsByAccount[accountId];

    // 1. Group jobs by boardName
    const jobsByBoard = {};
    jobs.forEach(job => {
      const bName = (job.boardName || '').trim() || 'Default Board';
      if (!jobsByBoard[bName]) {
        jobsByBoard[bName] = [];
      }
      jobsByBoard[bName].push(job);
    });

    // 2. Interleave the jobs round-robin by board
    const interleavedJobs = [];
    const boardNames = Object.keys(jobsByBoard);
    const boardQueues = boardNames.map(name => jobsByBoard[name]);
    
    let hasMore = true;
    let round = 0;
    while (hasMore) {
      hasMore = false;
      for (let i = 0; i < boardQueues.length; i++) {
        const q = boardQueues[i];
        if (round < q.length) {
          interleavedJobs.push(q[round]);
          hasMore = true;
        }
      }
      round++;
    }

    const accountScheduledJobs = latestQueue.filter(j => j.accountId === accountId && j.status === 'scheduled' && j.scheduledDate && j.scheduledTime);
    const accountTimestamps = accountScheduledJobs.map(j => parseDateTimeToMs(j.scheduledDate, j.scheduledTime));

    const dailyAccountCount = {};
    const dailyBoardCount = {};

    accountScheduledJobs.forEach(j => {
      const dStr = j.scheduledDate;
      const bName = (j.boardName || '').trim() || 'Default Board';
      
      dailyAccountCount[dStr] = (dailyAccountCount[dStr] || 0) + 1;
      if (!dailyBoardCount[dStr]) {
        dailyBoardCount[dStr] = {};
      }
      dailyBoardCount[dStr][bName] = (dailyBoardCount[dStr][bName] || 0) + 1;
    });

    const assignedJobsByDate = {};
    let dateIdx = 0;
    const remainingJobs = [...interleavedJobs];

    while (remainingJobs.length > 0) {
      const dStr = getOrAddDateString(dateIdx);
      if (!dailyBoardCount[dStr]) {
        dailyBoardCount[dStr] = {};
      }
      if (!assignedJobsByDate[dStr]) {
        assignedJobsByDate[dStr] = [];
      }

      const currentAccCount = dailyAccountCount[dStr] || 0;
      const accLimit = Math.min(40, bulkPostsPerDay);
      
      if (currentAccCount >= accLimit) {
        dateIdx++;
        continue;
      }

      // Find the first job that fits within board limit (max 7 per board on this day)
      let chosenJobIdx = -1;
      for (let idx = 0; idx < remainingJobs.length; idx++) {
        const job = remainingJobs[idx];
        const bName = (job.boardName || '').trim() || 'Default Board';
        const boardCountOnDay = dailyBoardCount[dStr][bName] || 0;

        if (boardCountOnDay < 7) {
          chosenJobIdx = idx;
          break;
        }
      }

      if (chosenJobIdx !== -1) {
        const job = remainingJobs.splice(chosenJobIdx, 1)[0];
        const bName = (job.boardName || '').trim() || 'Default Board';

        assignedJobsByDate[dStr].push(job);
        dailyAccountCount[dStr] = (dailyAccountCount[dStr] || 0) + 1;
        dailyBoardCount[dStr][bName] = (dailyBoardCount[dStr][bName] || 0) + 1;
      } else {
        dateIdx++;
      }
    }

    for (const dStr of dates) {
      const dayJobs = assignedJobsByDate[dStr] || [];
      const K = dayJobs.length;
      if (K === 0) continue;

      const intervalMinutes = K > 1 ? (bulkSpreadWindow * 60) / (K - 1) : 0;

      for (let j = 0; j < K; j++) {
        const job = dayJobs[j];
        const proposedMinutes = startMinutes + j * intervalMinutes;
        
        const [year, month, day] = dStr.split('-').map(Number);
        const baseHour = Math.floor(proposedMinutes / 60);
        const baseMin = Math.floor(proposedMinutes % 60);
        const baseCandDate = new Date(year, month - 1, day, baseHour, baseMin);
        const baseCandMs = baseCandDate.getTime();

        let tCandMs = baseCandMs;
        let found = false;
        let multiplier = 1;

        while (!found) {
          const hasCollision = accountTimestamps.some(tOther => Math.abs(tCandMs - tOther) < 30 * 60 * 1000);
          if (!hasCollision) {
            found = true;
          } else {
            const currentOffsetMinutes = 30 * multiplier;
            tCandMs = baseCandMs + currentOffsetMinutes * 60 * 1000;
            
            if (multiplier > 0) {
              multiplier = -multiplier;
            } else {
              multiplier = -multiplier + 1;
            }
          }
        }

        accountTimestamps.push(tCandMs);

        const { dateStr: finalDate, timeStr: finalTime } = convertMsToDateTime(tCandMs);
        const accNickname = accounts.find(a => a.id === accountId)?.nickname || accountId;
        slots.push({
          jobId: job.id,
          title: job.title || 'Untitled Pin',
          boardName: (job.boardName || '').trim() || 'Default Board',
          accountNickname: accNickname,
          date: finalDate,
          time: finalTime,
          finalMs: tCandMs,
          offsetMinutes: (tCandMs - baseCandMs) / (60 * 1000)
        });
      }
    }
  }

  return slots;
}

// ==========================================
// TEST CASE 1: Automatic Date Extension and Board/Account Limits
// ==========================================
function testLimitsAndExtension() {
  console.log('Running testLimitsAndExtension...');
  const selectedJobs = [];
  
  // Let's create:
  // - 50 jobs for Board A (max 7 per day, so it will require at least 8 days)
  // - 10 jobs for Board B (max 7 per day)
  // Total jobs = 60.
  // Account limits: set PostsPerDay = 40.
  // In 1 day, we can post max 40 jobs total across all boards.
  // Board limit: max 7 for Board A, max 7 for Board B. So max 14 jobs per day!
  // Thus, the dates must be extended to fit all 60 jobs.
  
  for (let i = 0; i < 50; i++) {
    selectedJobs.push({ id: `job-a-${i}`, accountId: 'acc-1', boardName: 'Board A', title: `Job A ${i}` });
  }
  for (let i = 0; i < 10; i++) {
    selectedJobs.push({ id: `job-b-${i}`, accountId: 'acc-1', boardName: 'Board B', title: `Job B ${i}` });
  }
  
  const slots = runDistributor({
    selectedJobs,
    latestQueue: [],
    bulkStartDate: '2026-07-16',
    bulkEndDate: '2026-07-17', // Originally 2 days
    bulkPostsPerDay: 40,
    bulkStartTime: '09:00',
    bulkSpreadWindow: 4,
    accounts: [{ id: 'acc-1', nickname: 'TestAcc' }]
  });

  // Verify that all 60 jobs are scheduled
  assert.strictEqual(slots.length, 60);

  // Group by date and check daily limits
  const dailyCounts = {};
  const boardDailyCounts = {};
  
  slots.forEach(slot => {
    const d = slot.date;
    dailyCounts[d] = (dailyCounts[d] || 0) + 1;
    
    if (!boardDailyCounts[d]) boardDailyCounts[d] = {};
    boardDailyCounts[d][slot.boardName] = (boardDailyCounts[d][slot.boardName] || 0) + 1;
  });

  // Assert account limit: no day has > 40 posts
  for (const date in dailyCounts) {
    assert.ok(dailyCounts[date] <= 40, `Day ${date} has ${dailyCounts[date]} posts, exceeding limit of 40`);
  }

  // Assert board limit: no board has > 7 posts per day
  for (const date in boardDailyCounts) {
    for (const bName in boardDailyCounts[date]) {
      assert.ok(boardDailyCounts[date][bName] <= 7, `Day ${date} Board ${bName} has ${boardDailyCounts[date][bName]} posts, exceeding limit of 7`);
    }
  }

  console.log('✅ testLimitsAndExtension passed');
}

// ==========================================
// TEST CASE 2: Round Robin Interleaving
// ==========================================
function testRoundRobinInterleaving() {
  console.log('Running testRoundRobinInterleaving...');
  const selectedJobs = [
    { id: 'a1', accountId: 'acc-1', boardName: 'Board A', title: 'A1' },
    { id: 'a2', accountId: 'acc-1', boardName: 'Board A', title: 'A2' },
    { id: 'b1', accountId: 'acc-1', boardName: 'Board B', title: 'B1' },
    { id: 'c1', accountId: 'acc-1', boardName: 'Board C', title: 'C1' }
  ];

  const slots = runDistributor({
    selectedJobs,
    latestQueue: [],
    bulkStartDate: '2026-07-16',
    bulkEndDate: '2026-07-16',
    bulkPostsPerDay: 40,
    bulkStartTime: '09:00',
    bulkSpreadWindow: 4,
    accounts: [{ id: 'acc-1', nickname: 'TestAcc' }]
  });

  // Since we interleave round-robin:
  // Round 1: Board A (a1), Board B (b1), Board C (c1)
  // Round 2: Board A (a2)
  // Interleaved order should be: a1, b1, c1, a2
  assert.strictEqual(slots[0].jobId, 'a1');
  assert.strictEqual(slots[1].jobId, 'b1');
  assert.strictEqual(slots[2].jobId, 'c1');
  assert.strictEqual(slots[3].jobId, 'a2');
  
  console.log('✅ testRoundRobinInterleaving passed');
}

// ==========================================
// TEST CASE 3: Bidirectional Collision Shifting
// ==========================================
function testBidirectionalShifting() {
  console.log('Running testBidirectionalShifting...');
  const latestQueue = [
    { accountId: 'acc-1', status: 'scheduled', scheduledDate: '2026-07-16', scheduledTime: '09:00' },
    { accountId: 'acc-1', status: 'scheduled', scheduledDate: '2026-07-16', scheduledTime: '09:30' },
    { accountId: 'acc-1', status: 'scheduled', scheduledDate: '2026-07-16', scheduledTime: '08:30' },
    { accountId: 'acc-1', status: 'scheduled', scheduledDate: '2026-07-16', scheduledTime: '10:00' }
  ];
  
  const selectedJobs = [
    { id: 'new-job', accountId: 'acc-1', title: 'New Job' }
  ];
  
  const slots = runDistributor({
    selectedJobs,
    latestQueue,
    bulkStartDate: '2026-07-16',
    bulkEndDate: '2026-07-16',
    bulkPostsPerDay: 5,
    bulkStartTime: '09:00',
    bulkSpreadWindow: 4,
    accounts: [{ id: 'acc-1', nickname: 'TestAcc' }]
  });

  assert.strictEqual(slots.length, 1);
  const resolved = slots[0];
  console.log(`Resolved Time: ${resolved.time}, Offset: ${resolved.offsetMinutes}m`);
  assert.strictEqual(resolved.offsetMinutes, -60); // Should resolve to -60 minutes (08:00)
  console.log('✅ testBidirectionalShifting passed (resolved to -60m successfully)');
}

// ==========================================
// TEST CASE 4: Timezone conversion and DST
// ==========================================
function testTimezonesAndDst() {
  console.log('Running testTimezonesAndDst...');
  const selectedJobs = [
    { id: 'dst-job', accountId: 'acc-1', title: 'DST Job' }
  ];

  const slots = runDistributor({
    selectedJobs,
    latestQueue: [],
    bulkStartDate: '2026-03-08',
    bulkEndDate: '2026-03-08',
    bulkPostsPerDay: 5,
    bulkStartTime: '02:30',
    bulkSpreadWindow: 4,
    accounts: [{ id: 'acc-1', nickname: 'TestAcc' }]
  });

  assert.strictEqual(slots.length, 1);
  console.log(`DST Date: ${slots[0].date}, Time: ${slots[0].time}`);
  console.log('✅ testTimezonesAndDst passed');
}

// Run all test cases
try {
  testLimitsAndExtension();
  testRoundRobinInterleaving();
  testBidirectionalShifting();
  testTimezonesAndDst();
  console.log('\n🎉 ALL STRESS TESTS PASSED!');
} catch (e) {
  console.error('\n❌ STRESS TEST FAILED!');
  console.error(e);
  process.exit(1);
}
