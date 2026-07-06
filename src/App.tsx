import React, { useState, useEffect, useRef } from 'react';
import { version } from '../package.json';
import { 
  LayoutDashboard, Users, FolderHeart, PlusCircle, 
  ListOrdered, FileText, ScrollText, Settings as SettingsIcon,
  Sparkles, AlertTriangle, Zap
} from 'lucide-react';

// Import Screens
import { Dashboard } from './screens/Dashboard';
import { Accounts } from './screens/Accounts';
import { Boards } from './screens/Boards';
import { CreatePin } from './screens/CreatePin';
import { Queue } from './screens/Queue';
import { Drafts } from './screens/Drafts';
import { Logs } from './screens/Logs';
import { Settings } from './screens/Settings';

// Import Components
import { Toast, ToastType } from './components/Toast';
import { api } from './services/api';
import { Account, Draft, QueueJob, Log } from './types';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'accounts', label: 'Accounts', icon: Users },
  { id: 'boards', label: 'Boards', icon: FolderHeart },
  { id: 'create', label: 'Create Pin', icon: PlusCircle },
  { id: 'queue', label: 'Publish Queue', icon: ListOrdered },
  { id: 'drafts', label: 'Drafts', icon: FileText },
  { id: 'logs', label: 'Logs', icon: ScrollText },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export default function App() {
  const [activeScreen, setActiveScreen] = useState('dashboard');
  
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [queue, setQueue] = useState<QueueJob[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [isMockMode, setIsMockMode] = useState(true);
  const [editingDraft, setEditingDraft] = useState<Draft | null>(null);
  const fetchedBoardAccountIds = useRef<Set<string>>(new Set());
  const [browserStatus, setBrowserStatus] = useState<{ accountId: string; isOpen: boolean; message: string } | null>(null);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: ToastType }[]>([]);

  const showToast = (message: string, type: ToastType = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const fetchAccounts = async () => {
    try {
      const data = await api.getAccounts();
      setAccounts(data);
      // Auto-fetch boards for connected accounts not yet fetched this session
      data.forEach(acc => {
        if (acc.sessionStatus === 'connected' && !fetchedBoardAccountIds.current.has(acc.id)) {
          fetchedBoardAccountIds.current.add(acc.id);
          api.fetchBoardsFromPinterest(acc.id).catch((err) => {
            console.error(`Auto-fetch boards failed for ${acc.nickname}:`, err);
          });
        }
      });
    } catch (e) {
      console.error('Failed to load accounts:', e);
    }
  };

  const fetchDrafts = async () => {
    try { setDrafts(await api.getDrafts()); } catch (e) { console.error(e); }
  };

  const fetchQueue = async () => {
    try { setQueue(await api.getQueue()); } catch (e) { console.error(e); }
  };

  const fetchLogs = async () => {
    try { setLogs(await api.getLogs()); } catch (e) { console.error(e); }
  };

  const loadSettings = async () => {
    try {
      const settings = await api.getSettings();
      setIsMockMode(settings.mockMode === true);
    } catch (e) { console.error(e); }
  };

  const refreshAll = async () => {
    await fetchAccounts();
    await fetchDrafts();
    await fetchQueue();
    await fetchLogs();
    await loadSettings();
  };

  useEffect(() => {
    refreshAll();
    api.onBrowserStatusChange((event, status) => {
      setBrowserStatus(status.isOpen ? status : null);
      if (!status.isOpen) {
        // Small delay to ensure DB write from verifySession has committed
        // before we read the updated sessionStatus via fetchAccounts
        setTimeout(() => fetchAccounts(), 500);
      }
    });
    api.onLogAdded((event, log) => {
      setLogs((prev) => [log, ...prev].slice(0, 100));
    });
  }, []);

  const handleSaveAccount = async (account: Partial<Account>) => {
    await api.saveAccount(account);
    await fetchAccounts();
  };

  const handleDeleteAccount = async (id: string) => {
    await api.deleteAccount(id);
    await fetchAccounts();
  };

  const handleOpenSession = async (id: string): Promise<boolean> => {
    const result = await api.openPinterestSession(id);
    return result as boolean;
  };

  const handleVerifySession = async (id: string) => {
    showToast('Verifying session status...', 'info');
    try {
      const isConnected = await api.verifyPinterestSession(id);
      await fetchAccounts();
      showToast(isConnected ? '✅ Account verified and connected!' : '⚠️ Session expired — please log in again.', isConnected ? 'success' : 'warn');
    } catch (e: any) {
      showToast(`Verification error: ${e.message}`, 'error');
    }
  };

  const handleSaveDraft = async (draft: Partial<Draft>): Promise<Draft> => {
    const res = await api.saveDraft(draft);
    await fetchDrafts();
    return res;
  };

  const handleDeleteDraft = async (id: string) => {
    await api.deleteDraft(id);
    await fetchDrafts();
  };

  const handleAddQueueJob = async (job: Partial<QueueJob>): Promise<QueueJob> => {
    const res = await api.addQueueJob(job);
    await fetchQueue();
    return res;
  };

  const handleEditDraftRequest = (draft: Draft) => {
    setEditingDraft(draft);
    setActiveScreen('create');
  };

  const handleNavigate = (screen: string) => {
    if (screen !== 'create') setEditingDraft(null);
    setActiveScreen(screen);
  };

  const activeQueueCount = queue.filter(q => q.status === 'pending' || q.status === 'running').length;
  const connectedCount = accounts.filter(a => a.sessionStatus === 'connected').length;
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI;

  return (
    <div className="flex h-screen text-slate-100 overflow-hidden" style={{ background: 'linear-gradient(135deg, #0a0a0f 0%, #0f0f1a 50%, #0a0a0f 100%)' }}>
      
      {/* Sidebar */}
      <aside className="w-64 flex flex-col justify-between flex-shrink-0 relative" style={{ 
        background: 'rgba(10, 10, 18, 0.95)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(20px)'
      }}>
        {/* Subtle glow accent */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent 0%, #e60023 50%, transparent 100%)', opacity: 0.6 }} />

        <div className="flex flex-col gap-5 p-5">
          {/* Logo */}
          <div className="flex items-center gap-3 px-1 py-2">
            <div style={{ 
              width: 40, height: 40, borderRadius: 14,
              background: 'linear-gradient(135deg, #e60023 0%, #ad081b 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 25px rgba(230,0,35,0.4), 0 0 0 1px rgba(230,0,35,0.2)',
              flexShrink: 0
            }}>
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white tracking-wide leading-tight">PIN PUBLISHER</h2>
              <span className="text-[10px] font-bold tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>AI POWERED</span>
            </div>
          </div>

          {/* Mock Mode Badge */}
          {isMockMode && (
            <div style={{ 
              background: 'rgba(245,158,11,0.1)', 
              border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 10, padding: '6px 10px',
              display: 'flex', alignItems: 'center', gap: 6
            }}>
              <Zap className="w-3 h-3" style={{ color: '#f59e0b', flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.05em' }}>DEMO SANDBOX MODE</span>
            </div>
          )}

          {/* Nav */}
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
              const isActive = activeScreen === id;
              const badge = id === 'accounts' ? (accounts.length > 0 ? accounts.length : null)
                : id === 'queue' ? (activeQueueCount > 0 ? activeQueueCount : null)
                : id === 'drafts' ? (drafts.length > 0 ? drafts.length : null)
                : null;

              return (
                <button
                  key={id}
                  onClick={() => handleNavigate(id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', borderRadius: 11, width: '100%',
                    background: isActive ? 'rgba(230,0,35,0.12)' : 'transparent',
                    border: isActive ? '1px solid rgba(230,0,35,0.2)' : '1px solid transparent',
                    color: isActive ? '#f87171' : 'rgba(255,255,255,0.45)',
                    fontWeight: 700, fontSize: 13, cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.15s ease',
                    boxShadow: isActive ? '0 0 20px rgba(230,0,35,0.08) inset' : 'none'
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span style={{ flex: 1 }}>{label}</span>
                  {badge !== null && (
                    <span style={{
                      fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 6,
                      background: id === 'queue' ? 'rgba(230,0,35,0.2)' : 'rgba(255,255,255,0.08)',
                      color: id === 'queue' ? '#f87171' : 'rgba(255,255,255,0.5)',
                      border: id === 'queue' ? '1px solid rgba(230,0,35,0.2)' : '1px solid rgba(255,255,255,0.08)'
                    }}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div style={{ 
          padding: '16px 20px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(0,0,0,0.3)'
        }}>
          {!isElectron && (
            <div style={{ 
              display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 10,
              background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.2)', marginBottom: 10
            }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#f87171' }} />
              <span style={{ fontSize: 10, color: '#f87171', fontWeight: 600, lineHeight: 1.4 }}>
                Web browser mode. Switch to Desktop App for real publishing.
              </span>
            </div>
          )}
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ 
              width: 8, height: 8, borderRadius: 4,
              background: connectedCount > 0 ? '#22c55e' : '#ef4444',
              boxShadow: connectedCount > 0 ? '0 0 8px rgba(34,197,94,0.5)' : '0 0 8px rgba(239,68,68,0.5)'
            }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
              {connectedCount > 0 ? `${connectedCount} account${connectedCount > 1 ? 's' : ''} connected` : 'No accounts connected'}
            </span>
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 6, textAlign: 'center' }}>v{version} · Safe Publishing Assistant</div>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ 
        flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column',
        background: 'transparent'
      }}>
        <div style={{ padding: '32px 40px', minHeight: '100%' }}>
          {activeScreen === 'dashboard' && (
            <Dashboard accounts={accounts} drafts={drafts} queue={queue} logs={logs} onNavigate={handleNavigate} onRefresh={refreshAll} isMockMode={isMockMode} />
          )}
          {activeScreen === 'accounts' && (
          <Accounts accounts={accounts} onSaveAccount={handleSaveAccount} onDeleteAccount={handleDeleteAccount} onOpenSession={handleOpenSession} onVerifySession={handleVerifySession} onRefreshAccounts={fetchAccounts} onShowToast={showToast} browserStatus={browserStatus} />
          )}
          {activeScreen === 'boards' && (
            <Boards accounts={accounts} onShowToast={showToast} />
          )}
          {/* CreatePin is ALWAYS mounted to preserve images/AI state when switching tabs */}
          <div style={{ display: activeScreen === 'create' ? 'block' : 'none' }}>
            <CreatePin accounts={accounts} drafts={drafts} onSaveDraft={handleSaveDraft} onAddQueueJob={handleAddQueueJob} onNavigate={handleNavigate} onShowToast={showToast} editingDraft={editingDraft} clearEditingDraft={() => setEditingDraft(null)} />
          </div>
          {activeScreen === 'queue' && (
            <Queue accounts={accounts} queue={queue} onRefreshQueue={fetchQueue} onShowToast={showToast} />
          )}
          {activeScreen === 'drafts' && (
            <Drafts accounts={accounts} drafts={drafts} onRefreshDrafts={fetchDrafts} onEditDraft={handleEditDraftRequest} onDeleteDraft={handleDeleteDraft} onSaveDraft={handleSaveDraft} onAddQueueJob={handleAddQueueJob} onNavigate={handleNavigate} onShowToast={showToast} />
          )}
          {activeScreen === 'logs' && (
            <Logs logs={logs} onRefreshLogs={fetchLogs} onShowToast={showToast} />
          )}
          {activeScreen === 'settings' && (
            <Settings onRefreshSettings={refreshAll} onShowToast={showToast} isMockMode={isMockMode} setIsMockMode={async (val) => {
              await api.saveSetting('mockMode', val);
              setIsMockMode(val);
              showToast(val ? 'Sandbox Mode enabled.' : 'Production Mode enabled.', 'info');
            }} />
          )}
        </div>
      </main>

      {/* Toast Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full">
        {toasts.map((toast) => (
          <Toast key={toast.id} id={toast.id} message={toast.message} type={toast.type} onClose={removeToast} />
        ))}
      </div>
    </div>
  );
}
