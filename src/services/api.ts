import { Account, Board, Draft, QueueJob, LogFilters, Log } from '../types';

declare global {
  interface Window {
    electronAPI: {
      getAccounts: () => Promise<Account[]>;
      saveAccount: (account: Partial<Account>) => Promise<Account>;
      deleteAccount: (id: string) => Promise<void>;
      openPinterestSession: (accountId: string) => Promise<boolean>;
      verifyPinterestSession: (accountId: string) => Promise<boolean>;

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

      callAI: (action: string, payload: any) => Promise<any>;

      onQueueProgress: (callback: (event: any, data: any) => void) => void;
      onBrowserStatusChange: (callback: (event: any, data: any) => void) => void;
      onLogAdded: (callback: (event: any, data: any) => void) => void;
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
  ],
  boards: [
    { id: 'mb-1', accountId: 'mock-acc-1', name: 'Kitchen Remodel DIY', url: 'https://www.pinterest.com/greyson/kitchen-remodel-diy/', lastFetchedAt: new Date().toISOString() },
    { id: 'mb-2', accountId: 'mock-acc-1', name: 'Cozy Living Room Decor', url: 'https://www.pinterest.com/greyson/cozy-living-room-decor/', lastFetchedAt: new Date().toISOString() },
    { id: 'mb-3', accountId: 'mock-acc-1', name: 'Modern Architecture Design', url: 'https://www.pinterest.com/greyson/modern-architecture/', lastFetchedAt: new Date().toISOString() }
  ],
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
  ],
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
      if (typeof apiObj[methodName] === 'function') {
        return apiObj[methodName](...args);
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
      callAI: async (action: string, payload: any) => {
        console.log('Mock AI call:', action, payload);
        if (action === 'validatePinMetadata') {
          return { isValid: true, warnings: [] };
        }
        return null;
      },
      onQueueProgress: () => {},
      onBrowserStatusChange: () => {},
      onLogAdded: () => {}
    };

    if (typeof mockApis[methodName] === 'function') {
      return mockApis[methodName](...args);
    }
    return Promise.resolve(null);
  };
};

export const api = new Proxy({} as any, {
  get: (target, prop) => {
    return getApiMethod(String(prop));
  }
});
