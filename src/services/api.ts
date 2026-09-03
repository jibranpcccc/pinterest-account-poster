import { Account, Board, Draft, QueueJob, LogFilters, Log, AnalyticsSnapshot } from '../types';

declare global {
  interface Window {
    electronAPI: {
      getAccounts: () => Promise<Account[]>;
      saveAccount: (account: Partial<Account>) => Promise<Account>;
      deleteAccount: (id: string) => Promise<void>;
      openPinterestSession: (accountId: string) => Promise<boolean>;
      verifyPinterestSession: (accountId: string) => Promise<boolean>;
      fetchAnalytics: (accountId: string) => Promise<any>;
      getAnalyticsHistory: (accountId?: string) => Promise<AnalyticsSnapshot[]>;
      saveAnalyticsSnapshot: (snapshot: Partial<AnalyticsSnapshot>) => Promise<AnalyticsSnapshot>;
      seedAnalyticsHistory: (accountId: string) => Promise<AnalyticsSnapshot[]>;


      getRepinJobs: () => Promise<any[]>;
      saveRepinJob: (job: any) => Promise<any>;
      deleteRepinJob: (id: string) => Promise<void>;
      startRepinJob: (id: string) => Promise<boolean>;

      getBoards: (accountId: string) => Promise<Board[]>;
      fetchBoardsFromPinterest: (accountId: string) => Promise<Board[]>;
      saveBoard: (board: Partial<Board>) => Promise<Board>;
      deleteBoard: (id: string) => Promise<void>;

      getDrafts: () => Promise<Draft[]>;
      saveDraft: (draft: Partial<Draft>) => Promise<Draft>;
      deleteDraft: (id: string) => Promise<void>;
      importDrafts: (drafts: Partial<Draft>[]) => Promise<number>;

      getQueue: () => Promise<QueueJob[]>;
      addQueueJob: (job: Partial<QueueJob>) => Promise<QueueJob>;
      updateQueueJobStatus: (id: string, status: string, error?: string) => Promise<void>;
      deleteQueueJob: (id: string) => Promise<void>;
      clearQueue: () => Promise<void>;
      clearCompletedJobs: () => Promise<void>;
      clearFailedJobs: () => Promise<void>;
      startQueueExecution: (jobIds: string[]) => Promise<boolean>;
      pauseQueueExecution: () => Promise<boolean>;
      resumeQueueExecution: () => Promise<boolean>;
      stopQueueExecution: () => Promise<boolean>;

      getSettings: () => Promise<Record<string, any>>;
      saveSetting: (key: string, value: any) => Promise<Record<string, any>>;

      getLogs: (filters?: LogFilters) => Promise<Log[]>;
      clearLogs: () => Promise<void>;
      openLogFolder: () => Promise<void>;
      exportBackup: () => Promise<string>;
      importBackup: (zipPath: string) => Promise<boolean>;
      setStartup: (enabled: boolean) => Promise<void>;
      getStartup: () => Promise<{ openAtLogin: boolean; wasOpenedAtLogin: boolean }>;
      writeToClipboard: (text: string) => Promise<void>;
      saveTempImage: (base64Data: string, prefix?: string) => Promise<string>;
      aiDiagnose: () => Promise<any>;
      toggleFleet: (enabled: boolean) => Promise<boolean>;
      getFleetStatus: () => Promise<boolean>;
      onFleetLog: (cb: (msg: string) => void) => () => void;
      onFleetJobUpdate: (cb: () => void) => () => void;

      callAI: (action: string, payload: any) => Promise<any>;
      batchScrubImages: (items: any[], options: any) => Promise<Record<string, string>>;

      onQueueProgress: (callback: (event: any, data: any) => void) => void;
      onBrowserStatusChange: (callback: (event: any, data: any) => void) => void;
      onLogAdded: (callback: (event: any, data: any) => void) => void;
      saveQueueJob: (job: QueueJob) => Promise<any>;
      getSchedulerStatus: () => Promise<{ active: boolean; nextJobTime: string | null; pendingCount: number }>;
      onSchedulerFired: (callback: (jobId: string) => void) => () => void;
    };
  }
}

// Local memory store to simulate state changes in Mock Mode
const mockStore = {
  accounts: [
    {
      id: 'mock-acc-1',
      nickname: 'greyson@geezek.com',
      profilePath: 'C:\\local-data\\profiles\\mock-acc-1',
      sessionStatus: 'connected' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString()
    }
  ] as Account[],
  boards: [
    { id: 'mb-1', accountId: 'mock-acc-1', name: 'Kitchen Remodel DIY', url: 'https://www.pinterest.com/greyson/kitchen-remodel-diy/', lastFetchedAt: new Date().toISOString() },
    { id: 'mb-2', accountId: 'mock-acc-1', name: 'Cozy Living Room Decor', url: 'https://www.pinterest.com/greyson/cozy-living-room-decor/', lastFetchedAt: new Date().toISOString() },
    { id: 'mb-3', accountId: 'mock-acc-1', name: 'Modern Architecture Design', url: 'https://www.pinterest.com/greyson/modern-architecture/', lastFetchedAt: new Date().toISOString() }
  ] as Board[],
  drafts: [
    {
      id: 'md-1',
      title: '10 Simple Kitchen Cabinets Hacks',
      description: 'Check out these modular cabinet layouts to optimize your small kitchen DIY space! Pin this for later.',
      destinationUrl: 'https://mysite.com/kitchen-cabinets/',
      altText: 'A modern white kitchen with wood shelves showing organized spice jars and cabinets.',
      notes: 'Promo Campaign July',
      imagePath: '',
      accountId: null,
      boardName: null,
      boardUrl: null,
      scheduledDate: null,
      scheduledTime: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ] as Draft[],
  queue: [] as QueueJob[],
  settings: {
    mockMode: true,
    actionDelay: [1.5, 4.0],
    pinDelay: [30, 120],
    accountDelay: [60, 180],
    maxRetries: 2,
    screenshotOnError: true,
    continueAfterFailure: false,
    headlessQueue: true,
    aiEnabled: false,
    aiApiKey: '',
    aiBaseUrl: 'https://api.opencode.dev/v1',
    aiModel: 'opencode-mimo-v2.5',
    aiTimeout: 30
  } as Record<string, any>,
  logs: [
    { level: 'info' as const, message: 'Pinterest Pin Publisher initialised.', createdAt: new Date().toISOString() }
  ] as Log[],
  analyticsHistory: [] as AnalyticsSnapshot[]
};

function parseNum(val: any): number {
  if (typeof val === 'number') return val;
  if (!val || typeof val !== 'string') return 0;
  const cleaned = val.trim().toLowerCase().replace(/,/g, '');
  const match = cleaned.match(/^([\d.]+)\s*([km])?$/);
  if (!match) {
    const num = parseFloat(cleaned.replace(/[^\d.]/g, ''));
    return isNaN(num) ? 0 : Math.round(num);
  }
  const base = parseFloat(match[1]);
  if (isNaN(base)) return 0;
  if (match[2] === 'k') return Math.round(base * 1000);
  if (match[2] === 'm') return Math.round(base * 1000000);
  return Math.round(base);
}

function generateMockHistory(accountId: string): AnalyticsSnapshot[] {
  const list: AnalyticsSnapshot[] = [];
  const now = new Date();
  let hash = 0;
  for (let i = 0; i < accountId.length; i++) hash += accountId.charCodeAt(i);
  const baseFollowers = 1850 + (hash % 2000);
  const baseViews = 35000 + (hash % 40000);
  const baseImpressions = 62000 + (hash % 60000);

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const snapshotDate = d.toISOString().split('T')[0];
    const timestamp = d.toISOString();
    const progress = (30 - i) / 30;

    const followerGain = Math.floor(progress * 240 + Math.sin(i * 0.7) * 25);
    const viewNoise = Math.floor(Math.sin(i * 0.9) * 3200 + Math.cos(i * 1.1) * 1500);
    const impNoise = Math.floor(Math.cos(i * 0.5) * 6500 + Math.sin(i * 0.8) * 3500);

    const followers = Math.max(100, baseFollowers + followerGain);
    const monthlyViews = Math.max(1000, baseViews + Math.floor(progress * 12000) + viewNoise);
    const impressions = Math.max(2000, baseImpressions + Math.floor(progress * 22000) + impNoise);
    const engagements = Math.floor(impressions * (0.052 + (i % 4) * 0.004));
    const outboundClicks = Math.floor(engagements * 0.41);
    const saves = Math.floor(engagements * 0.46);

    list.push({
      id: `mock_snap_${accountId}_${snapshotDate}`,
      accountId,
      followers,
      monthlyViews,
      impressions,
      engagements,
      outboundClicks,
      saves,
      followersRaw: followers >= 1000 ? `${(followers / 1000).toFixed(1)}k` : String(followers),
      monthlyViewsRaw: monthlyViews >= 1000 ? `${(monthlyViews / 1000).toFixed(1)}k` : String(monthlyViews),
      timestamp,
      snapshotDate
    });
  }
  return list;
}

const getApiMethod = (methodName: string) => {
  return (...args: any[]) => {
    // Check dynamically if window.electronAPI is defined (Production Mode)
    if (typeof window !== 'undefined' && window.electronAPI) {
      const apiObj = window.electronAPI as any;
      const actualName = methodName === 'callAI' ? 'aiCall' : methodName;
      if (typeof apiObj[actualName] === 'function') {
        return apiObj[actualName](...args);
      }
    }

    // Otherwise, execute Mock Fallback Mode (fully simulated accounts, boards, drafts, settings, and logs)
    const mockApis: Record<string, Function> = {
      getAccounts: async () => {
        return mockStore.accounts;
      },
      saveAccount: async (acc: Partial<Account>) => {
        const id = acc.id || `mock-acc-${Date.now()}`;
        const existingIdx = mockStore.accounts.findIndex(a => a.id === id);
        const newAcc = {
          id,
          nickname: acc.nickname || 'Mock Pinterest Profile',
          profilePath: acc.profilePath || `C:\\profiles\\${id}`,
          sessionStatus: acc.sessionStatus || 'disconnected',
          createdAt: acc.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastUsedAt: acc.lastUsedAt || null
        };
        
        if (existingIdx !== -1) {
          mockStore.accounts[existingIdx] = newAcc;
        } else {
          mockStore.accounts.push(newAcc);
        }
        return newAcc;
      },
      deleteAccount: async (id: string) => {
        mockStore.accounts = mockStore.accounts.filter(a => a.id !== id);
        mockStore.boards = mockStore.boards.filter(b => b.accountId !== id);
        mockStore.analyticsHistory = mockStore.analyticsHistory.filter(h => h.accountId !== id);
      },
      openPinterestSession: async (id: string) => {
        const idx = mockStore.accounts.findIndex(a => a.id === id);
        if (idx !== -1) {
          mockStore.accounts[idx].sessionStatus = 'connected';
          mockStore.accounts[idx].lastUsedAt = new Date().toISOString();
        }
        return true;
      },
      verifyPinterestSession: async (id: string) => {
        const idx = mockStore.accounts.findIndex(a => a.id === id);
        return idx !== -1 ? mockStore.accounts[idx].sessionStatus === 'connected' : false;
      },
      fetchAnalytics: async (accountId: string) => {
        const history = mockApis.getAnalyticsHistory ? await mockApis.getAnalyticsHistory(accountId) : [];
        const latest = history[history.length - 1] || {
          followers: 2450,
          monthlyViews: 48200,
          impressions: 89300,
          engagements: 4620,
          outboundClicks: 1890,
          saves: 2130
        };

        const updated: AnalyticsSnapshot = {
          id: `snap_${Date.now()}`,
          accountId,
          followers: latest.followers + Math.floor(Math.random() * 15 + 5),
          monthlyViews: latest.monthlyViews + Math.floor(Math.random() * 500 + 100),
          impressions: latest.impressions + Math.floor(Math.random() * 1200 + 300),
          engagements: latest.engagements + Math.floor(Math.random() * 80 + 20),
          outboundClicks: latest.outboundClicks + Math.floor(Math.random() * 35 + 10),
          saves: latest.saves + Math.floor(Math.random() * 40 + 10),
          followersRaw: `${((latest.followers + 10) / 1000).toFixed(1)}k`,
          monthlyViewsRaw: `${((latest.monthlyViews + 300) / 1000).toFixed(1)}k`,
          timestamp: new Date().toISOString(),
          snapshotDate: new Date().toISOString().split('T')[0]
        };

        mockStore.analyticsHistory.push(updated);
        return {
          accountId,
          followers: updated.followersRaw,
          monthlyViews: updated.monthlyViewsRaw,
          impressions: String(updated.impressions),
          engagements: String(updated.engagements),
          outboundClicks: String(updated.outboundClicks),
          saves: String(updated.saves),
          timestamp: updated.timestamp
        };
      },
      getAnalyticsHistory: async (accountId?: string) => {
        if (accountId) {
          let list = mockStore.analyticsHistory.filter(h => h.accountId === accountId);
          if (list.length === 0) {
            const seeded = generateMockHistory(accountId);
            mockStore.analyticsHistory.push(...seeded);
            list = seeded;
          }
          return list.sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
        }
        return mockStore.analyticsHistory;
      },
      saveAnalyticsSnapshot: async (snap: Partial<AnalyticsSnapshot>) => {
        const id = snap.id || `snap_${Date.now()}`;
        const followers = parseNum(snap.followers ?? snap.followersRaw);
        const monthlyViews = parseNum(snap.monthlyViews ?? snap.monthlyViewsRaw);
        const item: AnalyticsSnapshot = {
          id,
          accountId: snap.accountId || 'mock-acc-1',
          followers,
          monthlyViews,
          impressions: snap.impressions || 0,
          engagements: snap.engagements || 0,
          outboundClicks: snap.outboundClicks || 0,
          saves: snap.saves || 0,
          followersRaw: snap.followersRaw || String(followers),
          monthlyViewsRaw: snap.monthlyViewsRaw || String(monthlyViews),
          timestamp: snap.timestamp || new Date().toISOString(),
          snapshotDate: snap.snapshotDate || new Date().toISOString().split('T')[0]
        };
        mockStore.analyticsHistory.push(item);
        return item;
      },
      seedAnalyticsHistory: async (accountId: string) => {
        const seeded = generateMockHistory(accountId);
        mockStore.analyticsHistory.push(...seeded);
        return seeded;
      },

      getBoards: async (accountId: string) => {
        return mockStore.boards.filter(b => b.accountId === accountId);
      },
      fetchBoardsFromPinterest: async (accountId: string) => {
        const newBoards = [
          { id: `mb-${Date.now()}-1`, accountId, name: 'Pinterest Styling Tips', url: `https://www.pinterest.com/board/styling-${Date.now()}/`, lastFetchedAt: new Date().toISOString() }
        ];
        mockStore.boards = [...mockStore.boards, ...newBoards];
        return newBoards;
      },
      saveBoard: async (board: Partial<Board>) => {
        const id = board.id || `mb-${Date.now()}`;
        const newB = {
          id,
          accountId: board.accountId || 'mock-acc-1',
          name: board.name || 'Custom Board',
          url: board.url || 'https://pinterest.com',
          lastFetchedAt: new Date().toISOString()
        };
        mockStore.boards.push(newB);
        return newB;
      },
      deleteBoard: async (id: string) => {
        mockStore.boards = mockStore.boards.filter(b => b.id !== id);
      },
      getDrafts: async () => {
        return mockStore.drafts;
      },
      saveDraft: async (draft: Partial<Draft>) => {
        const id = draft.id || `draft-${Date.now()}`;
        const existingIdx = mockStore.drafts.findIndex(d => d.id === id);
        const newD = {
          id,
          title: draft.title || '',
          description: draft.description || '',
          destinationUrl: draft.destinationUrl || '',
          altText: draft.altText || '',
          notes: draft.notes || '',
          imagePath: draft.imagePath || '',
          accountId: draft.accountId || null,
          boardName: draft.boardName || null,
          boardUrl: draft.boardUrl || null,
          scheduledDate: draft.scheduledDate || null,
          scheduledTime: draft.scheduledTime || null,
          createdAt: draft.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        if (existingIdx !== -1) {
          mockStore.drafts[existingIdx] = newD;
        } else {
          mockStore.drafts.push(newD);
        }
        return newD;
      },
      deleteDraft: async (id: string) => {
        mockStore.drafts = mockStore.drafts.filter(d => d.id !== id);
      },
      importDrafts: async (drafts: Partial<Draft>[]) => {
        let count = 0;
        for (const d of drafts) {
          mockStore.drafts.push({
            id: `draft-${Date.now()}-${Math.random()}`,
            title: d.title || '',
            description: d.description || '',
            destinationUrl: d.destinationUrl || '',
            altText: d.altText || '',
            notes: d.notes || '',
            imagePath: d.imagePath || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          count++;
        }
        return count;
      },
      getQueue: async () => {
        return mockStore.queue;
      },
      addQueueJob: async (job: Partial<QueueJob>) => {
        const id = job.id || `job-${Date.now()}-${Math.random()}`;
        const existingIdx = job.id ? mockStore.queue.findIndex(q => q.id === job.id) : -1;
        if (existingIdx !== -1) {
          const existingJob = mockStore.queue[existingIdx];
          const updatedJob: QueueJob = {
            ...existingJob,
            ...job,
            id: existingJob.id
          };
          mockStore.queue[existingIdx] = updatedJob;
          return updatedJob;
        }

        const newJob: QueueJob = {
          id,
          accountId: job.accountId || 'mock-acc-1',
          boardName: job.boardName || 'My Board',
          boardUrl: job.boardUrl || '',
          imagePath: job.imagePath || '',
          title: job.title || '',
          description: job.description || '',
          destinationUrl: job.destinationUrl || '',
          altText: job.altText || '',
          notes: job.notes || '',
          status: job.status || 'pending',
          scheduledDate: job.scheduledDate || null,
          scheduledTime: job.scheduledTime || null,
          livePinUrl: null,
          createdAt: new Date().toISOString()
        };
        mockStore.queue.push(newJob);
        return newJob;
      },
      updateQueueJobStatus: async (id: string, status: any, error?: string) => {
        const idx = mockStore.queue.findIndex(q => q.id === id);
        if (idx !== -1) {
          mockStore.queue[idx].status = status;
          if (error) mockStore.queue[idx].errorMessage = error;
        }
      },
      deleteQueueJob: async (id: string) => {
        mockStore.queue = mockStore.queue.filter(q => q.id !== id);
      },
      clearQueue: async () => {
        mockStore.queue = mockStore.queue.filter(q => q.status === 'running');
      },
      clearCompletedJobs: async () => {
        mockStore.queue = mockStore.queue.filter(q => q.status !== 'completed');
      },
      clearFailedJobs: async () => {
        mockStore.queue = mockStore.queue.filter(q => q.status !== 'failed');
      },
      startQueueExecution: async (jobIds: string[]) => {
        // Trigger execution simulations
        console.log('Simulating mock queue start', jobIds);
        return true;
      },
      pauseQueueExecution: async () => true,
      resumeQueueExecution: async () => true,
      stopQueueExecution: async () => true,
      getSettings: async () => {
        return mockStore.settings;
      },
      saveSetting: async (key: string, value: any) => {
        mockStore.settings[key] = value;
        return mockStore.settings;
      },
      getLogs: async () => {
        return mockStore.logs;
      },
      clearLogs: async () => {
        mockStore.logs = [];
      },
      openLogFolder: async () => {
        console.log('Mock: Open log folder requested');
      },
      exportBackup: async () => {
        console.log('Mock: Export backup requested');
        return true;
      },
      importBackup: async () => {
        console.log('Mock: Import backup requested');
        return true;
      },
      setStartup: async (enabled: boolean) => {
        console.log('Mock: setStartup requested with', enabled);
        mockStore.settings.autostart = enabled;
      },
      getStartup: async () => {
        console.log('Mock: getStartup requested');
        return { openAtLogin: !!mockStore.settings.autostart, wasOpenedAtLogin: false };
      },
      writeToClipboard: async (text: string) => {
        console.log('Mock: writeToClipboard requested', text);
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard) {
            await navigator.clipboard.writeText(text);
          }
        } catch (e) {
          console.error('Mock clipboard write failed', e);
        }
      },
      saveTempImage: async (base64Data: string, prefix: string = 'pin_canvas') => {
        return base64Data;
      },
      aiDiagnose: async () => {
        return {
          resourcesPath: 'N/A (Mock Mode)',
          foundPath: 'NOT FOUND (Mock Mode)',
          accountCount: 1,
          searchPaths: [],
          speedMs: 120,
          platform: 'browser',
          version: '1.0.0-mock'
        };
      },
      toggleFleet: async (enabled: boolean) => {
        console.log('Mock toggle fleet:', enabled);
        return true;
      },
      getFleetStatus: async () => {
        return false;
      },
      onFleetLog: (_cb: (msg: string) => void) => {
        return () => {};
      },
      onFleetJobUpdate: (_cb: () => void) => {
        return () => {};
      },
      callAI: async (action: string, payload: any) => {
        console.log('Mock AI call:', action, payload);
        const kw = payload?.keyword || payload?.topic || payload?.boardName || 'Layered Hair';
        if (action === 'validatePinMetadata') {
          return { isValid: true, warnings: [] };
        }
        if (action === 'generateTitleSuggestions') {
          return [
            `${kw} On Long Wavy Hair With Face-Framing Layers`,
            `How To Style A Modern ${kw} For Volume`,
            `${kw} Cut For Natural Texture And Everyday Movement`,
            `${kw} Style Ideas For Medium Length Hair`,
            `${kw} Haircut With Soft Blended Ends`
          ];
        }
        if (action === 'generateDescriptionSuggestions') {
          return [
            `${kw} creates soft movement and natural texture that works well on many hair types. The cut is shaped through the mid-lengths with lightweight ends. Save this pin for your next salon idea.`,
            `${kw} gives a clean finish and effortless shape for everyday wear. The stylist used face-framing pieces to add soft dimension. Pin this look to your board for style inspiration.`,
            `${kw} works with natural texture and requires minimal heat styling. The length is kept balanced around the shoulders for a practical finish. Save this pin for your next haircut.`
          ];
        }
        if (action === 'improveAltText') {
          return `Person with a ${kw} hairstyle featuring soft face-framing layers and natural movement.`;
        }
        if (action === 'generateKeywords') {
          return [
            kw, `${kw} ideas`, `${kw} hairstyle`, `${kw} for fine hair`,
            `${kw} tutorial`, `how to style ${kw}`, `${kw} short`, `${kw} medium`,
            `${kw} 2026`, `${kw} inspo`
          ];
        }
        if (action === 'generateSEOComplete' || action === 'analyzeImage') {
          return {
            title: `${kw} On Long Wavy Hair With Face-Framing Layers`,
            description: `${kw} creates soft movement and natural texture that works well on many hair types. The cut is shaped through the mid-lengths with lightweight ends. Save this pin for your next salon idea.`,
            altText: `Person with a ${kw} hairstyle featuring soft face-framing layers and natural movement.`,
            shouldPost: true
          };
        }
        return null;
      },
      batchScrubImages: async (items: any[], _options: any) => {
        console.log('Mock batchScrubImages requested for', items.length, 'items');
        const res: Record<string, string> = {};
        for (const item of items) {
          res[item.imagePath] = item.imagePath;
        }
        return res;
      },
      onQueueProgress: () => {},
      onBrowserStatusChange: () => {},
      onLogAdded: () => {},
      saveQueueJob: async (job: QueueJob) => {
        const idx = mockStore.queue.findIndex(q => q.id === job.id);
        if (idx !== -1) {
          mockStore.queue[idx] = { ...mockStore.queue[idx], ...job };
          return mockStore.queue[idx];
        } else {
          mockStore.queue.push(job);
          return job;
        }
      },
      getSchedulerStatus: async () => {
        const scheduledJobs = mockStore.queue.filter(q => q.status === 'scheduled');
        let nextJobTime: string | null = null;
        if (scheduledJobs.length > 0) {
          let earliestMs = Infinity;
          for (const job of scheduledJobs) {
            if (job.scheduledDate && job.scheduledTime) {
              try {
                const timeTrimmed = job.scheduledTime.trim().toLowerCase();
                let hour = 0, minute = 0;
                if (timeTrimmed.endsWith('am') || timeTrimmed.endsWith('pm')) {
                  const isPm = timeTrimmed.endsWith('pm');
                  const parts = timeTrimmed.slice(0, -2).trim().split(':');
                  hour = parseInt(parts[0], 10);
                  minute = parts.length > 1 ? parseInt(parts[1], 10) : 0;
                  if (isPm && hour !== 12) hour += 12;
                  if (!isPm && hour === 12) hour = 0;
                } else {
                  const parts = timeTrimmed.split(':');
                  hour = parseInt(parts[0], 10);
                  minute = parts.length > 1 ? parseInt(parts[1], 10) : 0;
                }

                // Parse date string (supports both YYYY-MM-DD and MM-DD-YYYY or DD-MM-YYYY with either - or /)
                const dateParts = job.scheduledDate.split(/[-/]/).map(Number);
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

                const jobTime = !isNaN(year) && !isNaN(month) && !isNaN(day)
                  ? new Date(year, month - 1, day, hour, minute, 0)
                  : new Date(`${job.scheduledDate} ${job.scheduledTime}`);

                const ms = jobTime.getTime();
                if (!isNaN(ms) && ms < earliestMs) {
                  earliestMs = ms;
                  nextJobTime = jobTime.toISOString();
                }
              } catch (e) {
                // ignore
              }
            }
          }
          if (!nextJobTime) {
            const mockDate = new Date(Date.now() + 120000);
            nextJobTime = mockDate.toISOString();
          }
        }
        return {
          active: true,
          nextJobTime,
          pendingCount: scheduledJobs.length
        };
      },
      onSchedulerFired: (_callback: (jobId: string) => void) => {
        return () => {};
      }
    };

    if (typeof mockApis[methodName] === 'function') {
      return mockApis[methodName](...args);
    }
    return Promise.resolve(null);
  };
};

export const api = new Proxy({} as any, {
  get: (_target, prop) => {
    return getApiMethod(String(prop));
  }
});
