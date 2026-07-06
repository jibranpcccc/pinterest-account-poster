import { contextBridge, ipcRenderer } from 'electron';
import { Account, Board, Draft, QueueJob, LogFilters, Log } from './types';

contextBridge.exposeInMainWorld('electronAPI', {
  // Accounts
  getAccounts: () => ipcRenderer.invoke('db:getAccounts'),
  saveAccount: (account: Account) => ipcRenderer.invoke('db:saveAccount', account),
  deleteAccount: (id: string) => ipcRenderer.invoke('db:deleteAccount', id),
  openPinterestSession: (accountId: string) => ipcRenderer.invoke('pinterest:openSession', accountId),
  verifyPinterestSession: (accountId: string) => ipcRenderer.invoke('pinterest:verifySession', accountId),

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
  writeToClipboard: (text: string) => ipcRenderer.invoke('clipboard:write', text),

  // AI Provider
  callAI: (action: string, payload: any) => ipcRenderer.invoke('ai:call', action, payload),

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
