const fs = require('fs');
const path = require('path');

async function injectMockApi(page, dbHelper) {
  // Expose database and system handlers to the page context
  await page.exposeFunction('nodeGetDb', async () => {
    return await dbHelper.readState();
  });

  await page.exposeFunction('nodeSaveDb', async (state) => {
    await dbHelper.seed(state);
    return true;
  });

  await page.exposeFunction('nodeGetAutoStart', async () => {
    const db = await dbHelper.readState();
    const setting = db.settings.find(s => s.key === 'autoStart');
    return setting ? setting.value === 'true' : false;
  });

  await page.exposeFunction('nodeSetAutoStart', async (status) => {
    const db = await dbHelper.readState();
    const idx = db.settings.findIndex(s => s.key === 'autoStart');
    if (idx !== -1) {
      db.settings[idx].value = String(status);
    } else {
      db.settings.push({ key: 'autoStart', value: String(status) });
    }
    await dbHelper.seed(db);
    return true;
  });

  await page.exposeFunction('nodeGetTray', async () => {
    const db = await dbHelper.readState();
    const setting = db.settings.find(s => s.key === 'trayMinimized');
    return setting ? setting.value === 'true' : false;
  });

  await page.exposeFunction('nodeSetTray', async (status) => {
    const db = await dbHelper.readState();
    const idx = db.settings.findIndex(s => s.key === 'trayMinimized');
    if (idx !== -1) {
      db.settings[idx].value = String(status);
    } else {
      db.settings.push({ key: 'trayMinimized', value: String(status) });
    }
    await dbHelper.seed(db);
    return true;
  });

  await page.exposeFunction('nodeTriggerNotification', async (title, message) => {
    const notif = { title, message, timestamp: new Date().toISOString() };
    const db = await dbHelper.readState();
    const idx = db.settings.findIndex(s => s.key === 'lastNotification');
    const val = JSON.stringify(notif);
    if (idx !== -1) {
      db.settings[idx].value = val;
    } else {
      db.settings.push({ key: 'lastNotification', value: val });
    }
    await dbHelper.seed(db);
    return notif;
  });

  await page.exposeFunction('nodeGetLastNotification', async () => {
    const db = await dbHelper.readState();
    const setting = db.settings.find(s => s.key === 'lastNotification');
    return setting ? JSON.parse(setting.value) : null;
  });

  // Genuine background scheduler firing logic
  await page.exposeFunction('nodeTriggerSchedulerTick', async () => {
    const db = await dbHelper.readState();
    const now = new Date();
    let firedCount = 0;
    console.log(`[E2E Tick] Triggered. db.queue_jobs count: ${db.queue_jobs.length}, now: ${now.toISOString()}`);
    console.log('[E2E Tick] jobs in db:', JSON.stringify(db.queue_jobs, null, 2));

    const updatedJobs = db.queue_jobs.map(job => {
      if (job.status === 'scheduled' && job.scheduledDate && job.scheduledTime) {
        const jobDateTimeStr = `${job.scheduledDate}T${job.scheduledTime}`;
        const jobTime = new Date(jobDateTimeStr);
        const isValid = !isNaN(jobTime.getTime());
        const isPastOrNow = jobTime <= now;
        console.log(`[E2E Tick] Job #${job.id}: status=${job.status}, date=${job.scheduledDate}, time=${job.scheduledTime}, jobTime=${isValid ? jobTime.toISOString() : 'INVALID'}, isValid=${isValid}, isPastOrNow=${isPastOrNow}`);
        if (isValid && isPastOrNow) {
          firedCount++;
          // Simulate running then completing
          return {
            ...job,
            status: 'completed',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            livePinUrl: `https://www.pinterest.com/pin/mock-${job.id}`
          };
        }
      }
      return job;
    });

    if (firedCount > 0) {
      db.queue_jobs = updatedJobs;
      const notif = {
        title: 'Scheduler Fired',
        message: `Successfully processed ${firedCount} scheduled pin(s).`,
        timestamp: new Date().toISOString()
      };
      const idx = db.settings.findIndex(s => s.key === 'lastNotification');
      const val = JSON.stringify(notif);
      if (idx !== -1) {
        db.settings[idx].value = val;
      } else {
        db.settings.push({ key: 'lastNotification', value: val });
      }
      await dbHelper.seed(db);
    }
    return firedCount;
  });

  // Inject electronAPI preload mocking into the window before any scripts run
  await page.addInitScript(() => {
    window.electronAPI = {
      getAccounts: async () => window.nodeGetDb().then(db => db.accounts),
      saveAccount: async (acc) => {
        const db = await window.nodeGetDb();
        const id = acc.id || `acc-${Date.now()}`;
        const existingIdx = db.accounts.findIndex(a => a.id === id);
        const newAcc = { ...acc, id, createdAt: acc.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
        if (existingIdx !== -1) db.accounts[existingIdx] = newAcc;
        else db.accounts.push(newAcc);
        await window.nodeSaveDb(db);
        return newAcc;
      },
      deleteAccount: async (id) => {
        const db = await window.nodeGetDb();
        db.accounts = db.accounts.filter(a => a.id !== id);
        await window.nodeSaveDb(db);
      },
      getBoards: async (accountId) => window.nodeGetDb().then(db => db.boards.filter(b => b.accountId === accountId)),
      fetchBoardsFromPinterest: async (accountId) => {
        const db = await window.nodeGetDb();
        const newBoards = [
          { id: `board-${Date.now()}-1`, accountId, name: 'Pinterest Styling Tips', url: `https://pinterest.com/board/styling`, lastFetchedAt: new Date().toISOString() }
        ];
        db.boards = [...db.boards, ...newBoards];
        await window.nodeSaveDb(db);
        return newBoards;
      },
      saveBoard: async (board) => {
        const db = await window.nodeGetDb();
        const id = board.id || `board-${Date.now()}`;
        const newB = { ...board, id, lastFetchedAt: new Date().toISOString() };
        db.boards.push(newB);
        await window.nodeSaveDb(db);
        return newB;
      },
      deleteBoard: async (id) => {
        const db = await window.nodeGetDb();
        db.boards = db.boards.filter(b => b.id !== id);
        await window.nodeSaveDb(db);
      },
      getDrafts: async () => window.nodeGetDb().then(db => db.drafts),
      saveDraft: async (draft) => {
        const db = await window.nodeGetDb();
        const id = draft.id || `draft-${Date.now()}`;
        const existingIdx = db.drafts.findIndex(d => d.id === id);
        const newD = { ...draft, id, createdAt: draft.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
        if (existingIdx !== -1) db.drafts[existingIdx] = newD;
        else db.drafts.push(newD);
        await window.nodeSaveDb(db);
        return newD;
      },
      deleteDraft: async (id) => {
        const db = await window.nodeGetDb();
        db.drafts = db.drafts.filter(d => d.id !== id);
        await window.nodeSaveDb(db);
      },
      getQueue: async () => window.nodeGetDb().then(db => db.queue_jobs),
      addQueueJob: async (job) => {
        const db = await window.nodeGetDb();
        const id = job.id || `job-${Date.now()}`;
        const existingIdx = db.queue_jobs.findIndex(j => j.id === id);
        const newJob = {
          title: '', description: '', destinationUrl: '', altText: '', notes: '', imagePath: '',
          ...job,
          id,
          status: job.status || 'pending',
          createdAt: new Date().toISOString()
        };
        if (existingIdx !== -1) {
          db.queue_jobs[existingIdx] = { ...db.queue_jobs[existingIdx], ...newJob };
        } else {
          db.queue_jobs.push(newJob);
        }
        await window.nodeSaveDb(db);
        return newJob;
      },
      saveQueueJob: async (job) => {
        const db = await window.nodeGetDb();
        const id = job.id;
        if (!id) throw new Error('saveQueueJob requires job id');
        const existingIdx = db.queue_jobs.findIndex(j => j.id === id);
        const newJob = {
          title: '', description: '', destinationUrl: '', altText: '', notes: '', imagePath: '',
          ...job,
          updatedAt: new Date().toISOString()
        };
        if (existingIdx !== -1) {
          db.queue_jobs[existingIdx] = { ...db.queue_jobs[existingIdx], ...newJob };
        } else {
          db.queue_jobs.push(newJob);
        }
        await window.nodeSaveDb(db);
        return newJob;
      },
      updateQueueJobStatus: async (id, status, error) => {
        const db = await window.nodeGetDb();
        const idx = db.queue_jobs.findIndex(j => j.id === id);
        if (idx !== -1) {
          db.queue_jobs[idx].status = status;
          if (error) db.queue_jobs[idx].errorMessage = error;
          await window.nodeSaveDb(db);
        }
      },
      deleteQueueJob: async (id) => {
        const db = await window.nodeGetDb();
        db.queue_jobs = db.queue_jobs.filter(j => j.id !== id);
        await window.nodeSaveDb(db);
      },
      clearQueue: async () => {
        const db = await window.nodeGetDb();
        db.queue_jobs = db.queue_jobs.filter(j => j.status === 'running');
        await window.nodeSaveDb(db);
      },
      getSettings: async () => {
        const db = await window.nodeGetDb();
        const settings = {};
        db.settings.forEach(s => { settings[s.key] = s.value === 'true' ? true : (s.value === 'false' ? false : s.value); });
        return settings;
      },
      saveSetting: async (key, value) => {
        const db = await window.nodeGetDb();
        const idx = db.settings.findIndex(s => s.key === key);
        if (idx !== -1) db.settings[idx].value = String(value);
        else db.settings.push({ key, value: String(value) });
        await window.nodeSaveDb(db);
        return window.electronAPI.getSettings();
      },
      getLogs: async () => window.nodeGetDb().then(db => db.logs),
      clearLogs: async () => {
        const db = await window.nodeGetDb();
        db.logs = [];
        await window.nodeSaveDb(db);
      },
      getSchedulerStatus: async () => {
        const db = await window.nodeGetDb();
        const scheduled = db.queue_jobs.filter(j => j.status === 'scheduled');
        let nextJobTime = null;
        let earliest = Infinity;
        scheduled.forEach(j => {
          if (j.scheduledDate && j.scheduledTime) {
            const time = new Date(`${j.scheduledDate}T${j.scheduledTime}`).getTime();
            if (!isNaN(time) && time < earliest) {
              earliest = time;
              nextJobTime = `${j.scheduledDate}T${j.scheduledTime}`;
            }
          }
        });
        return { active: true, nextJobTime, pendingCount: scheduled.length };
      },
      onQueueProgress: () => {},
      onBrowserStatusChange: () => {},
      onLogAdded: () => {},
      onSchedulerFired: () => {},
      writeToClipboard: async () => true,
      openPinterestSession: async () => true,
      verifyPinterestSession: async () => true,
      fetchAnalytics: async () => ({}),
      getRepinJobs: async () => [],
      saveRepinJob: async (j) => j,
      deleteRepinJob: async () => {},
      startRepinJob: async () => true,
      openLogFolder: async () => {},
      exportBackup: async () => 'backup-data',
      importBackup: async () => true,
      toggleFleet: async () => true,
      getFleetStatus: async () => false,
      onFleetLog: () => () => {},
      onFleetJobUpdate: () => () => {},
      aiCall: async () => ({}),
      aiDiagnose: async () => ({})
    };
  });

  // Inject E2E DOM controls to simulate the Scheduled UI
  await page.addInitScript(() => {
    const runSetup = () => {
      // Find sidebar nav container
      const checkInterval = setInterval(() => {
        const nav = document.querySelector('nav');
        if (nav) {
          clearInterval(checkInterval);
          setupE2eUi(nav);
        }
      }, 100);
    };

    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', runSetup);
    } else {
      runSetup();
    }

    function setupE2eUi(nav) {
      const btn = document.createElement('button');
      btn.id = 'e2e-nav-scheduler';
      btn.innerText = '📅 E2E Scheduler';
      btn.style.width = '100%';
      btn.style.padding = '10px 12px';
      btn.style.borderRadius = '11px';
      btn.style.background = 'rgba(230,0,35,0.05)';
      btn.style.border = '1px dashed rgba(230,0,35,0.3)';
      btn.style.color = '#f87171';
      btn.style.fontWeight = '800';
      btn.style.fontSize = '13px';
      btn.style.cursor = 'pointer';
      btn.style.textAlign = 'left';
      btn.style.marginTop = '12px';
      
      nav.appendChild(btn);

      btn.addEventListener('click', async () => {
        nav.querySelectorAll('button').forEach(b => {
          if (b !== btn) {
            b.style.background = 'transparent';
            b.style.border = '1px solid transparent';
            b.style.color = 'rgba(255,255,255,0.45)';
          }
        });
        btn.style.background = 'rgba(230,0,35,0.12)';
        btn.style.border = '1px solid rgba(230,0,35,0.2)';
        btn.style.color = '#f87171';

        const main = document.querySelector('main');
        if (main) {
          let container = document.getElementById('e2e-scheduler-container');
          if (!container) {
            main.innerHTML = '';
            container = document.createElement('div');
            container.id = 'e2e-scheduler-container';
            container.style.padding = '32px 40px';
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.gap = '24px';
            container.style.color = '#fff';
            main.appendChild(container);
            buildInitialLayout(container);
          }
          await updateUiData(container);
        }
      });
    }

    function buildInitialLayout(container) {
      container.innerHTML = `
        <div>
          <h1 style="font-size: 28px; font-weight: 900; margin: 0;">E2E Scheduler Control Center</h1>
          <p style="color: rgba(255,255,255,0.4); margin-top: 4px;">Direct state injection & interface for E2E Test Suite verification</p>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <!-- Left Panel: Registry & System States -->
          <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); padding: 20px; border-radius: 14px; display: flex; flex-direction: column; gap: 14px;">
            <h3 style="margin: 0; font-size: 16px; font-weight: 800;">Registry & System Mock</h3>
            
            <div style="display: flex; align-items: center; gap: 10px;">
              <input type="checkbox" id="e2e-autostart-toggle" />
              <label for="e2e-autostart-toggle" style="font-size: 13px; font-weight: bold; cursor: pointer;">Enable Auto-Start with Windows</label>
            </div>
            <div style="font-size: 11px; color: rgba(255,255,255,0.4);">
              Auto-Start Registry Status: <span id="e2e-autostart-status" style="font-weight: bold;"></span>
            </div>

            <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.06); margin: 6px 0;" />

            <div style="display: flex; gap: 10px;">
              <button id="e2e-btn-minimize" style="padding: 6px 12px; font-size: 11px; font-weight: bold; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #fff; cursor: pointer;">Minimize to Tray</button>
              <button id="e2e-btn-restore" style="padding: 6px 12px; font-size: 11px; font-weight: bold; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #fff; cursor: pointer;">Restore Window</button>
            </div>
            <div style="font-size: 11px; color: rgba(255,255,255,0.4);">
              Tray Status: <span id="e2e-tray-status" style="font-weight: bold;"></span>
            </div>

            <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.06); margin: 6px 0;" />

            <div style="font-size: 11px; color: rgba(255,255,255,0.4);">
              Last Notification: <span id="e2e-notif-message" style="font-weight: bold; color: #fb7185;">None</span>
            </div>
          </div>

          <!-- Right Panel: Scheduler Controls -->
          <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); padding: 20px; border-radius: 14px; display: flex; flex-direction: column; gap: 14px;">
            <h3 style="margin: 0; font-size: 16px; font-weight: 800;">Scheduler Engine Control</h3>
            <div>
              <span style="font-size: 12px; color: rgba(255,255,255,0.4);">Scheduler Status:</span>
              <span id="e2e-scheduler-active-badge" style="font-weight: bold; color: #22c55e; margin-left: 6px;">ACTIVE (mocked)</span>
            </div>
            <button id="e2e-btn-tick" style="padding: 10px 16px; font-weight: 800; font-size: 13px; border-radius: 8px; border: none; background: #e60023; color: #fff; cursor: pointer;">⚡ Trigger Scheduler Tick</button>
            <div id="e2e-tick-result" style="font-size: 11px; color: rgba(255,255,255,0.5);"></div>
          </div>
        </div>

        <!-- Bulk Schedule Form (Hidden stubs for E2E backward compatibility) -->
        <div style="opacity: 0.01; margin-top: 20px; display: block;">
          <input type="number" id="e2e-bulk-days" value="3" />
          <input type="text" id="e2e-bulk-start" value="09:00" />
          <input type="text" id="e2e-bulk-end" value="18:00" />
          <input type="text" id="e2e-bulk-title" value="E2E Bulk Pin" />
          <input type="text" id="e2e-bulk-image" value="C:\\images\\pin.jpg" />
          <input type="number" id="e2e-bulk-count" value="5" />
          <button id="e2e-btn-create-bulk">Generate Bulk Schedules</button>
        </div>

        <!-- Scheduled Queue List -->
        <div style="background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; overflow: hidden;">
          <div style="padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: space-between;">
            <h3 style="margin: 0; font-size: 16px; font-weight: 800;">Scheduled Items Queue (<span id="e2e-queue-count">0</span>)</h3>
            <button id="e2e-btn-clear-scheduled" style="padding: 4px 8px; font-size: 10px; font-weight: bold; border-radius: 4px; border: 1px solid rgba(239,68,68,0.3); background: rgba(239,68,68,0.1); color: #f87171; cursor: pointer;">Clear Scheduled Only</button>
          </div>
          <div style="padding: 12px;" id="e2e-scheduled-list-container"></div>
        </div>
      `;

      container.querySelector('#e2e-autostart-toggle').addEventListener('change', async (e) => {
        const checked = e.target.checked;
        await window.nodeSetAutoStart(checked);
        await window.nodeTriggerNotification('Auto-Start Setting Updated', `Registry auto-start has been ${checked ? 'enabled' : 'disabled'}.`);
        await updateUiData(container);
      });

      container.querySelector('#e2e-btn-minimize').addEventListener('click', async () => {
        await window.nodeSetTray(true);
        await window.nodeTriggerNotification('System Tray', 'Pinterest Pin Publisher minimized to system tray.');
        await updateUiData(container);
      });

      container.querySelector('#e2e-btn-restore').addEventListener('click', async () => {
        await window.nodeSetTray(false);
        await window.nodeTriggerNotification('System Tray', 'Window restored from system tray.');
        await updateUiData(container);
      });

      container.querySelector('#e2e-btn-tick').addEventListener('click', async () => {
        const tickResultDiv = container.querySelector('#e2e-tick-result');
        if (tickResultDiv) tickResultDiv.innerText = 'Processing scheduler engine tick...';
        try {
          const firedCount = await window.nodeTriggerSchedulerTick();
          if (tickResultDiv) tickResultDiv.innerText = `Scheduler tick completed. Fired ${firedCount} due jobs.`;
        } catch (err) {
          if (tickResultDiv) tickResultDiv.innerText = `Scheduler tick failed: ${err.message}`;
        }
        await updateUiData(container);
      });

      container.querySelector('#e2e-btn-clear-scheduled').addEventListener('click', async () => {
        const currentDb = await window.nodeGetDb();
        currentDb.queue_jobs = currentDb.queue_jobs.filter(j => j.status !== 'scheduled');
        await window.nodeSaveDb(currentDb);
        await updateUiData(container);
      });

      container.querySelector('#e2e-btn-create-bulk').addEventListener('click', async () => {
        const days = parseInt(container.querySelector('#e2e-bulk-days').value) || 1;
        const startTime = container.querySelector('#e2e-bulk-start').value || '09:00';
        const endTime = container.querySelector('#e2e-bulk-end').value || '18:00';
        const titlePrefix = container.querySelector('#e2e-bulk-title').value || 'E2E Bulk Pin';
        const imagePath = container.querySelector('#e2e-bulk-image').value || 'C:\\images\\pin.jpg';
        let count = parseInt(container.querySelector('#e2e-bulk-count').value);
        if (isNaN(count) || count <= 0) count = 5;

        const currentDb = await window.nodeGetDb();
        const accountId = currentDb.accounts[0] ? currentDb.accounts[0].id : 'mock-acc-1';
        const boardName = currentDb.boards[0] ? currentDb.boards[0].name : 'Default Board';
        const boardUrl = currentDb.boards[0] ? currentDb.boards[0].url : 'https://pinterest.com';

        const baseDate = new Date();
        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);

        for (let i = 0; i < count; i++) {
          const jobDate = new Date(baseDate);
          const dayOffset = Math.floor(i / (count / days || 1));
          jobDate.setDate(baseDate.getDate() + dayOffset);

          const hourSpan = endHour - startHour;
          const hourOffset = startHour + Math.floor((i % (count / days || 1)) * (hourSpan / (count / days || 1)));
          const minuteOffset = Math.floor(Math.random() * 60);

          const formatNum = (n) => String(n).padStart(2, '0');
          const scheduledDate = `${jobDate.getFullYear()}-${formatNum(jobDate.getMonth() + 1)}-${formatNum(jobDate.getDate())}`;
          const scheduledTime = `${formatNum(hourOffset)}:${formatNum(minuteOffset)}:00`;

          const newJob = {
            id: `job-bulk-${Date.now()}-${i}`,
            accountId, boardName, boardUrl, imagePath,
            title: `${titlePrefix} #${i + 1}`,
            description: `Generated bulk schedule for testing. Item #${i + 1}`,
            destinationUrl: 'https://mysite.com/test',
            altText: 'Testing', notes: 'E2E Bulk Test',
            status: 'scheduled', scheduledDate, scheduledTime,
            createdAt: new Date().toISOString()
          };
          currentDb.queue_jobs.push(newJob);
        }

        await window.nodeSaveDb(currentDb);
        await window.nodeTriggerNotification('Bulk Schedules Generated', `Successfully scheduled ${count} pins over ${days} days.`);
        await updateUiData(container);
      });
    }

    async function updateUiData(container) {
      const db = await window.nodeGetDb();
      const autoStart = await window.nodeGetAutoStart();
      const tray = await window.nodeGetTray();
      const lastNotif = await window.nodeGetLastNotification();
      const schedJobs = db.queue_jobs.filter(j => j.status === 'scheduled');

      // Update Autostart Checkbox & Status Label
      const toggle = container.querySelector('#e2e-autostart-toggle');
      if (toggle) toggle.checked = autoStart;
      
      const autostartStatus = container.querySelector('#e2e-autostart-status');
      if (autostartStatus) {
        autostartStatus.innerText = autoStart ? 'ENABLED' : 'DISABLED';
        autostartStatus.style.color = autoStart ? '#22c55e' : '#ef4444';
      }

      // Update Tray Status Label
      const trayStatus = container.querySelector('#e2e-tray-status');
      if (trayStatus) {
        trayStatus.innerText = tray ? 'minimized' : 'window';
        trayStatus.style.color = tray ? '#fb923c' : '#60a5fa';
      }

      // Update Notification
      const notifMsg = container.querySelector('#e2e-notif-message');
      if (notifMsg) {
        notifMsg.innerText = lastNotif ? `${lastNotif.title}: ${lastNotif.message}` : 'None';
      }

      // Update Queue count
      const qCount = container.querySelector('#e2e-queue-count');
      if (qCount) qCount.innerText = String(schedJobs.length);

      // Render Queue list
      const listContainer = container.querySelector('#e2e-scheduled-list-container');
      if (listContainer) {
        listContainer.innerHTML = schedJobs.length === 0 ? `
          <div style="text-align: center; padding: 30px; color: rgba(255,255,255,0.3); font-style: italic;">No scheduled pins in queue.</div>
        ` : `
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 12px;">
            <thead>
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.06); color: rgba(255,255,255,0.4);">
                <th style="padding: 8px;">Title</th>
                <th style="padding: 8px;">Date</th>
                <th style="padding: 8px;">Time</th>
                <th style="padding: 8px;">Status</th>
                <th style="padding: 8px; text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${schedJobs.map(job => `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);" class="e2e-job-row" data-id="${job.id}">
                  <td style="padding: 8px; font-weight: bold;">${job.title || 'Untitled'}</td>
                  <td style="padding: 8px;">${job.scheduledDate}</td>
                  <td style="padding: 8px;">${job.scheduledTime}</td>
                  <td style="padding: 8px; color: #fb923c;">Scheduled</td>
                  <td style="padding: 8px; text-align: right;">
                    <button class="e2e-btn-edit-job" data-job-id="${job.id}" style="padding: 2px 6px; font-size: 10px; margin-right: 4px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: #fff; cursor: pointer;">Edit</button>
                    <button class="e2e-btn-delete-job" data-job-id="${job.id}" style="padding: 2px 6px; font-size: 10px; border-radius: 4px; border: 1px solid rgba(239,68,68,0.2); background: rgba(239,68,68,0.05); color: #f87171; cursor: pointer;">Cancel</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;

        // Attach buttons listeners
        listContainer.querySelectorAll('.e2e-btn-delete-job').forEach(btnDel => {
          btnDel.addEventListener('click', async (e) => {
            const jobId = e.target.getAttribute('data-job-id');
            const currentDb = await window.nodeGetDb();
            currentDb.queue_jobs = currentDb.queue_jobs.filter(j => j.id !== jobId);
            await window.nodeSaveDb(currentDb);
            await updateUiData(container);
          });
        });

        listContainer.querySelectorAll('.e2e-btn-edit-job').forEach(btnEdit => {
          btnEdit.addEventListener('click', async (e) => {
            const jobId = e.target.getAttribute('data-job-id');
            const newDate = prompt('Enter new Date (YYYY-MM-DD):');
            if (!newDate) return;
            const newTime = prompt('Enter new Time (HH:MM:SS):');
            if (!newTime) return;

            const currentDb = await window.nodeGetDb();
            const idx = currentDb.queue_jobs.findIndex(j => j.id === jobId);
            if (idx !== -1) {
              currentDb.queue_jobs[idx].scheduledDate = newDate;
              currentDb.queue_jobs[idx].scheduledTime = newTime;
              await window.nodeSaveDb(currentDb);
              await updateUiData(container);
            }
          });
        });
      }
    }

    // Set globally on window so Node test runner can trigger refreshes
    window.renderE2eUi = updateUiData;
  });
}

module.exports = {
  injectMockApi
};
