import { contextBridge, ipcRenderer } from 'electron';
import { Account, Board, Draft, QueueJob, LogFilters, Log } from './types';

contextBridge.exposeInMainWorld('electronAPI', {
  // Accounts
  getAccounts: () => ipcRenderer.invoke('db:getAccounts'),
  saveAccount: (account: Account) => ipcRenderer.invoke('db:saveAccount', account),
  deleteAccount: (id: string) => ipcRenderer.invoke('db:deleteAccount', id),
  openPinterestSession: (accountId: string) => ipcRenderer.invoke('pinterest:openSession', accountId),
  verifyPinterestSession: (accountId: string) => ipcRenderer.invoke('pinterest:verifySession', accountId),
  fetchAnalytics: (accountId: string) => ipcRenderer.invoke('pinterest:fetchAnalytics', accountId),

  // Repin
  getRepinJobs: () => ipcRenderer.invoke('db:getRepinJobs'),
  saveRepinJob: (job: any) => ipcRenderer.invoke('db:saveRepinJob', job),
  deleteRepinJob: (id: string) => ipcRenderer.invoke('db:deleteRepinJob', id),
  startRepinJob: (id: string) => ipcRenderer.invoke('repin:start', id),

  // Boards
  getBoards: (accountId: string) => ipcRenderer.invoke('db:getBoards', accountId),
  fetchBoardsFromPinterest: (accountId: string) => ipcRenderer.invoke('pinterest:fetchBoards', accountId),
  saveBoard: (board: Board) => ipcRenderer.invoke('db:saveBoard', board),
  deleteBoard: (id: string) => ipcRenderer.invoke('db:deleteBoard', id),

  // Drafts
  getDrafts: () => ipcRenderer.invoke('db:getDrafts'),
  saveDraft: (draft: Draft) => ipcRenderer.invoke('db:saveDraft', draft),
  deleteDraft: (id: string) => ipcRenderer.invoke('db:deleteDraft', id),
  importDrafts: (drafts: Draft[]) => ipcRenderer.invoke('db:importDrafts', drafts),

  // Queue
  getQueue: () => ipcRenderer.invoke('db:getQueue'),
  addQueueJob: (job: QueueJob) => ipcRenderer.invoke('db:addQueueJob', job),
  updateQueueJobStatus: (id: string, status: string, error?: string) => ipcRenderer.invoke('db:updateQueueJobStatus', id, status, error),
  deleteQueueJob: (id: string) => ipcRenderer.invoke('db:deleteQueueJob', id),
  clearQueue: () => ipcRenderer.invoke('db:clearQueue'),
  startQueueExecution: (jobIds: string[]) => ipcRenderer.invoke('queue:start', jobIds),
  pauseQueueExecution: () => ipcRenderer.invoke('queue:pause'),
  resumeQueueExecution: () => ipcRenderer.invoke('queue:resume'),
  stopQueueExecution: () => ipcRenderer.invoke('queue:stop'),

  // Settings
  getSettings: () => ipcRenderer.invoke('db:getSettings'),
  saveSetting: (key: string, value: any) => ipcRenderer.invoke('db:saveSetting', key, value),

  // Logs
  getLogs: (filters?: LogFilters) => ipcRenderer.invoke('db:getLogs', filters),
  clearLogs: () => ipcRenderer.invoke('db:clearLogs'),
  openLogFolder: () => ipcRenderer.invoke('sys:openLogFolder'),

  // System
  exportBackup: () => ipcRenderer.invoke('sys:exportBackup'),
  importBackup: () => ipcRenderer.invoke('sys:importBackup'),
  writeToClipboard: (text: string) => ipcRenderer.invoke('clipboard:write', text),

  // AI Provider
  aiCall: (action: string, payload: any) => ipcRenderer.invoke('ai:call', action, payload),
  aiDiagnose: () => ipcRenderer.invoke('ai:diagnose'),
  toggleFleet: (enabled: boolean) => ipcRenderer.invoke('fleet:toggle', enabled),
  getFleetStatus: () => ipcRenderer.invoke('fleet:status'),
  onFleetLog: (callback: (msg: string) => void) => {
    const handler = (_: any, msg: string) => callback(msg);
    ipcRenderer.on('fleet:log', handler);
    return () => ipcRenderer.removeListener('fleet:log', handler);
  },
  onFleetJobUpdate: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('fleet:jobUpdate', handler);
    return () => ipcRenderer.removeListener('fleet:jobUpdate', handler);
  },

  // Listeners
  onQueueProgress: (callback: (event: any, data: any) => void) => {
    ipcRenderer.removeAllListeners('queue:progress');
    ipcRenderer.on('queue:progress', callback);
  },
  onBrowserStatusChange: (callback: (event: any, data: any) => void) => {
    ipcRenderer.removeAllListeners('pinterest:browserStatus');
    ipcRenderer.on('pinterest:browserStatus', callback);
  },
  onLogAdded: (callback: (event: any, data: any) => void) => {
    ipcRenderer.removeAllListeners('sys:logAdded');
    ipcRenderer.on('sys:logAdded', callback);
  }
});
