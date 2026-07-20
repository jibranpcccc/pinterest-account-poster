import { Account, Board, Draft, QueueJob, LogFilters, Log } from '../types';

declare global {
  interface Window {
    electronAPI: {
      getAccounts: () => Promise<Account[]>;
      saveAccount: (account: Partial<Account>) => Promise<Account>;
      deleteAccount: (id: string) => Promise<void>;
      openPinterestSession: (accountId: string) => Promise<boolean>;
      verifyPinterestSession: (accountId: string) => Promise<boolean>;
      fetchAnalytics: (accountId: string) => Promise<any>;

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
      aiDiagnose: () => Promise<any>;
      toggleFleet: (enabled: boolean) => Promise<boolean>;
      getFleetStatus: () => Promise<boolean>;
      onFleetLog: (cb: (msg: string) => void) => () => void;
      onFleetJobUpdate: (cb: () => void) => () => void;

      callAI: (action: string, payload: any) => Promise<any>;

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
    aiModel: 'opencode-big-pickle',
    aiTimeout: 30
  } as Record<string, any>,
  logs: [
    { level: 'info' as const, message: 'Pinterest Pin Publisher initialised.', createdAt: new Date().toISOString() }
  ] as Log[]
};

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
        if (action === 'validatePinMetadata') {
          return { isValid: true, warnings: [] };
        }
        return null;
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
