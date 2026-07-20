// Adversarial test script for date/time conversion helpers and sorting logic
// challenger_m4_ui_2 task

const assert = require('assert').strict;

// 1. Re-implementation of helpers from Queue.tsx and QueueItemRow.tsx

// From Queue.tsx:
const parseDateTimeToMs = (dateStr, timeStr) => {
  const timeClean = timeStr.trim().toUpperCase();
  let hours = 0;
  let minutes = 0;
  
  if (timeClean.endsWith('AM') || timeClean.endsWith('PM')) {
    const isPM = timeClean.endsWith('PM');
    const timeParts = timeClean.substring(0, timeClean.length - 2).trim().split(':');
    hours = parseInt(timeParts[0], 10);
    minutes = parseInt(timeParts[1], 10);
    if (isPM && hours !== 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
  } else {
    const timeParts = timeClean.split(':');
    hours = parseInt(timeParts[0], 10);
    minutes = parseInt(timeParts[1], 10);
  }
  
  // Parse date string (supports both YYYY-MM-DD and MM-DD-YYYY or DD-MM-YYYY with either - or /)
  const dateParts = dateStr.split(/[-/]/).map(Number);
  let year = NaN, month = NaN, day = NaN;

  if (dateParts.length === 3) {
    if (dateParts[0] > 1000) {
      year = dateParts[0];
      month = dateParts[1];
      day = dateParts[2];
    } else if (dateParts[2] > 1000) {
      if (dateParts[0] > 12) {
        day = dateParts[0];
        month = dateParts[1];
      } else {
        month = dateParts[0];
        day = dateParts[1];
      }
      year = dateParts[2];
    }
  }

  const d = !isNaN(year) && !isNaN(month) && !isNaN(day)
    ? new Date(year, month - 1, day, hours, minutes)
    : new Date(`${dateStr} ${timeStr}`);

  return d.getTime();
};

const convertMsToDateTime = (ms) => {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return { dateStr: 'Invalid Date', timeStr: 'Invalid Time' };
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

// From QueueItemRow.tsx:
const convert12hTo24h = (time12) => {
  if (!time12) return '';
  const clean = time12.trim().toUpperCase();
  if (!clean.endsWith('AM') && !clean.endsWith('PM')) {
    return clean;
  }
  const isPm = clean.endsWith('PM');
  const parts = clean.substring(0, clean.length - 2).trim().split(':');
  let hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);
  if (isNaN(hour) || isNaN(minute)) return '';
  if (isPm && hour !== 12) hour += 12;
  if (!isPm && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const getCountdownText = (dateStr, timeStr) => {
  const clean = timeStr.trim().toUpperCase();
  let hour = 0, min = 0;
  if (clean.endsWith('AM') || clean.endsWith('PM')) {
    const isPm = clean.endsWith('PM');
    const parts = clean.substring(0, clean.length - 2).trim().split(':');
    hour = parseInt(parts[0], 10) || 0;
    min = parseInt(parts[1], 10) || 0;
    if (isPm && hour !== 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;
  } else {
    const parts = clean.split(':');
    hour = parseInt(parts[0], 10) || 0;
    min = parseInt(parts[1], 10) || 0;
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  const scheduledDate = new Date(year, month - 1, day, hour, min);
  const now = new Date();
  const diffMs = scheduledDate.getTime() - now.getTime();
  if (diffMs <= 0) {
    return "Overdue — posting soon";
  }
  const diffSecs = Math.floor(diffMs / 1000);
  const days = Math.floor(diffSecs / 86400);
  const hours = Math.floor((diffSecs % 86400) / 3600);
  const minutes = Math.floor((diffSecs % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
};

// Queue sorting comparator from Queue.tsx:
const scheduledSortComparator = (a, b) => {
  if (!a.scheduledDate || !b.scheduledDate) return 0;
  if (a.scheduledDate !== b.scheduledDate) {
    return a.scheduledDate.localeCompare(b.scheduledDate);
  }
  if (!a.scheduledTime || !b.scheduledTime) return 0;
  const timeToMinutes = (timeStr) => {
    const clean = timeStr.trim().toUpperCase();
    let hour = 0, min = 0;
    if (clean.endsWith('AM') || clean.endsWith('PM')) {
      const isPm = clean.endsWith('PM');
      const parts = clean.substring(0, clean.length - 2).trim().split(':');
      hour = parseInt(parts[0], 10) || 0;
      min = parseInt(parts[1], 10) || 0;
      if (isPm && hour !== 12) hour += 12;
      if (!isPm && hour === 12) hour = 0;
    } else {
      const parts = clean.split(':');
      hour = parseInt(parts[0], 10) || 0;
      min = parseInt(parts[1], 10) || 0;
    }
    return hour * 60 + min;
  };
  return timeToMinutes(a.scheduledTime) - timeToMinutes(b.scheduledTime);
};

// 2. Test Execution
function runTests() {
  console.log('🧪 Starting Adversarial Date & Time Helper Tests...');

  // Test 1: Date & Time Conversions - 12-hour AM/PM and 24-hour formats
  console.log('\n--- Test 1: Date & Time Conversions ---');
  
  const parseTestCases = [
    { date: '2026-07-16', time: '12:00 AM', expectedHour: 0, expectedMinute: 0 },
    { date: '2026-07-16', time: '12:00 PM', expectedHour: 12, expectedMinute: 0 },
    { date: '2026-07-16', time: '11:59 PM', expectedHour: 23, expectedMinute: 59 },
    { date: '2026-07-16', time: '00:00', expectedHour: 0, expectedMinute: 0 },
    { date: '2026-07-16', time: '12:00', expectedHour: 12, expectedMinute: 0 },
    { date: '2026-07-16', time: '12:01 AM', expectedHour: 0, expectedMinute: 1 },
    { date: '2026-07-16', time: '12:01 PM', expectedHour: 12, expectedMinute: 1 },
    { date: '2026-07-16', time: '01:30 PM', expectedHour: 13, expectedMinute: 30 },
    { date: '2026-07-16', time: '01:30 AM', expectedHour: 1, expectedMinute: 30 },
    // Slash and US/locale date formats
    { date: '07/16/2026', time: '01:30 PM', expectedHour: 13, expectedMinute: 30 },
    { date: '16/07/2026', time: '01:30 PM', expectedHour: 13, expectedMinute: 30 },
    { date: '2026/07/16', time: '01:30 PM', expectedHour: 13, expectedMinute: 30 }
  ];

  for (const tc of parseTestCases) {
    const ms = parseDateTimeToMs(tc.date, tc.time);
    const dateObj = new Date(ms);
    assert.strictEqual(dateObj.getFullYear(), 2026, `Year mismatch for ${tc.time}`);
    assert.strictEqual(dateObj.getMonth(), 6, `Month mismatch for ${tc.time}`); // 0-indexed July is 6
    assert.strictEqual(dateObj.getDate(), 16, `Date mismatch for ${tc.time}`);
    assert.strictEqual(dateObj.getHours(), tc.expectedHour, `Hour mismatch for ${tc.time}`);
    assert.strictEqual(dateObj.getMinutes(), tc.expectedMinute, `Minute mismatch for ${tc.time}`);
    console.log(`✅ parseDateTimeToMs: "${tc.date} ${tc.time}" parsed successfully to hour ${tc.expectedHour}, min ${tc.expectedMinute}`);
  }

  // Test 2: Convert ms back to Date/Time and verify symmetry
  console.log('\n--- Test 2: Bidirectional Convert Symmetry ---');
  for (const tc of parseTestCases) {
    if (tc.time.includes('AM') || tc.time.includes('PM')) {
      const ms = parseDateTimeToMs(tc.date, tc.time);
      const converted = convertMsToDateTime(ms);
      
      const expectedTimeNormalized = tc.time.trim().toUpperCase().replace(/^(\d):/, '0$1:');
      const actualTimeNormalized = converted.timeStr.trim().toUpperCase().replace(/^(\d):/, '0$1:');
      
      // Standardize the expected date to YYYY-MM-DD for symmetry check
      const dateParts = tc.date.split(/[-/]/);
      let expectedDate = tc.date;
      if (dateParts.length === 3) {
        let year = NaN, month = NaN, day = NaN;
        if (dateParts[0].length === 4) {
          year = Number(dateParts[0]);
          month = Number(dateParts[1]);
          day = Number(dateParts[2]);
        } else if (dateParts[2].length === 4) {
          if (Number(dateParts[0]) > 12) {
            day = Number(dateParts[0]);
            month = Number(dateParts[1]);
          } else {
            month = Number(dateParts[0]);
            day = Number(dateParts[1]);
          }
          year = Number(dateParts[2]);
        }
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
          expectedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
      
      assert.strictEqual(converted.dateStr, expectedDate, `Date mismatch in convertMsToDateTime for ${tc.time}`);
      assert.strictEqual(actualTimeNormalized, expectedTimeNormalized, `Time mismatch in convertMsToDateTime for ${tc.time}`);
      console.log(`✅ Symmetry: "${tc.date} ${tc.time}" -> MS -> "${converted.dateStr} ${converted.timeStr}"`);
    }
  }

  // Test 3: 12h to 24h helper
  console.log('\n--- Test 3: convert12hTo24h ---');
  const h12TestCases = [
    { input: '12:00 AM', expected: '00:00' },
    { input: '12:00 PM', expected: '12:00' },
    { input: '11:59 PM', expected: '23:59' },
    { input: '12:01 AM', expected: '00:01' },
    { input: '12:01 PM', expected: '12:01' },
    { input: '00:00', expected: '00:00' },
    { input: '13:00', expected: '13:00' },
    { input: '01:05 PM', expected: '13:05' }
  ];

  for (const tc of h12TestCases) {
    const actual = convert12hTo24h(tc.input);
    assert.strictEqual(actual, tc.expected, `Mismatch for convert12hTo24h(${tc.input})`);
    console.log(`✅ convert12hTo24h("${tc.input}") = "${actual}"`);
  }

  // Test 4: Adversarial/Invalid inputs
  console.log('\n--- Test 4: Invalid/Nonsense Inputs ---');
  const invalidTimeCases = [
    { date: '2026-07-16', time: '', desc: 'empty time' },
    { date: '2026-07-16', time: 'invalid', desc: 'garbage string' },
    { date: '2026-07-16', time: '12 PM', desc: 'no minutes specified' },
    { date: '', time: '12:00 PM', desc: 'empty date' },
    { date: 'invalid', time: '12:00 PM', desc: 'garbage date' }
  ];

  for (const tc of invalidTimeCases) {
    const ms = parseDateTimeToMs(tc.date, tc.time);
    assert.ok(isNaN(ms), `Expected NaN for ${tc.desc}, got ${ms}`);
    console.log(`✅ Correctly got NaN for ${tc.desc} (date="${tc.date}", time="${tc.time}")`);
  }

  const invalid12hCases = [
    { input: '', expected: '' },
    { input: null, expected: '' },
    { input: 'invalid', expected: 'INVALID' },
    { input: '12 PM', expected: '' }
  ];

  for (const tc of invalid12hCases) {
    const actual = convert12hTo24h(tc.input);
    assert.strictEqual(actual, tc.expected, `Mismatch for convert12hTo24h(invalid: ${tc.input})`);
    console.log(`✅ convert12hTo24h("${tc.input}") = "${actual}"`);
  }

  // Test 5: Sorting logic
  console.log('\n--- Test 5: Strict Sorting Logic (Ascending Date/Time) ---');
  const unsortedJobs = [
    { id: 'A', scheduledDate: '2026-07-16', scheduledTime: '12:00 PM' },
    { id: 'B', scheduledDate: '2026-07-16', scheduledTime: '12:00 AM' },
    { id: 'C', scheduledDate: '2026-07-15', scheduledTime: '11:59 PM' },
    { id: 'D', scheduledDate: '2026-07-16', scheduledTime: '01:00 PM' },
    { id: 'E', scheduledDate: '2026-07-16', scheduledTime: '02:00 AM' },
    { id: 'F', scheduledDate: '2026-07-17', scheduledTime: '12:00 AM' },
    { id: 'G', scheduledDate: '2026-07-16', scheduledTime: '12:01 AM' }
  ];

  // Expectation order:
  // 1. C: 2026-07-15 11:59 PM (23:59)
  // 2. B: 2026-07-16 12:00 AM (00:00)
  // 3. G: 2026-07-16 12:01 AM (00:01)
  // 4. E: 2026-07-16 02:00 AM (02:00)
  // 5. A: 2026-07-16 12:00 PM (12:00)
  // 6. D: 2026-07-16 01:00 PM (13:00)
  // 7. F: 2026-07-17 12:00 AM (00:00)
  const expectedOrder = ['C', 'B', 'G', 'E', 'A', 'D', 'F'];

  const sortedJobs = [...unsortedJobs].sort(scheduledSortComparator);
  const actualOrder = sortedJobs.map(j => j.id);

  assert.deepEqual(actualOrder, expectedOrder, `Sorting mismatch! Got: ${actualOrder.join(', ')}, expected: ${expectedOrder.join(', ')}`);
  console.log('✅ Sorting logic correctly sorts jobs by scheduled date and time ascending.');
  sortedJobs.forEach(j => {
    console.log(`   - Job ${j.id}: ${j.scheduledDate} ${j.scheduledTime}`);
  });

  console.log('\n🎉 All adversarial date and sorting tests passed successfully!');
}

try {
  runTests();
} catch (e) {
  console.error('\n❌ Test execution failed:', e.message);
  process.exit(1);
}
