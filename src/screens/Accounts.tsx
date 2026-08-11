import React, { useState, useEffect } from 'react';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { Account, QueueJob } from '../types';
import { 
  UserPlus, ExternalLink, RefreshCw, Trash2, 
  CheckCircle, AlertTriangle, Key, Shield, Wifi, WifiOff,
  Activity, Gauge, Clock, Sliders, X, Sparkles, Layers,
  ChevronRight, Check, AlertCircle, Info, Zap
} from 'lucide-react';
import { api } from '../services/api';

interface AccountsProps {
  accounts: Account[];
  queue?: QueueJob[];
  onSaveAccount: (account: Partial<Account>) => Promise<void>;
  onDeleteAccount: (id: string) => Promise<void>;
  onOpenSession: (id: string) => Promise<boolean>;
  onVerifySession: (id: string) => Promise<void>;
  onRefreshAccounts: () => Promise<void>;
  onShowToast: (msg: string, type: 'success' | 'error' | 'warn' | 'info') => void;
  browserStatus: { accountId: string; isOpen: boolean; message: string } | null;
}

export const Accounts: React.FC<AccountsProps> = ({
  accounts,
  queue = [],
  onSaveAccount,
  onDeleteAccount,
  onOpenSession,
  onVerifySession,
  onRefreshAccounts,
  onShowToast,
  browserStatus
}) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newNickname, setNewNickname] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // Live session drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerAccountId, setDrawerAccountId] = useState<string | null>(null);

  // Quota configuration state per account (accountId -> quota limit)
  const [accountQuotas, setAccountQuotas] = useState<Record<string, number>>({});
  const [editingQuotaAccountId, setEditingQuotaAccountId] = useState<string | null>(null);
  const [tempQuotaInput, setTempQuotaInput] = useState<number>(40);

  // Load account quotas from settings on mount
  useEffect(() => {
    const loadQuotas = async () => {
      try {
        const settings = await api.getSettings();
        const quotas: Record<string, number> = {};
        accounts.forEach(acc => {
          quotas[acc.id] = settings[`quota_${acc.id}`] || 40;
        });
        setAccountQuotas(quotas);
      } catch (e) {
        console.error('Failed to load account quotas:', e);
      }
    };
    if (accounts.length > 0) {
      loadQuotas();
    }
  }, [accounts]);

  // Open drawer automatically when browser status activates
  useEffect(() => {
    if (browserStatus?.isOpen) {
      setIsDrawerOpen(true);
      if (browserStatus.accountId) {
        setDrawerAccountId(browserStatus.accountId);
      }
    }
  }, [browserStatus]);

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNickname.trim()) return;
    setIsSubmitting(true);
    try {
      await onSaveAccount({ 
        nickname: newNickname,
        email: newEmail.trim() || undefined,
        password: newPassword.trim() || undefined
      });
      onShowToast('Account profile created! Click "Connect Account" to log in.', 'success');
      setNewNickname(''); setNewEmail(''); setNewPassword('');
      setIsAddModalOpen(false);
    } catch (e: any) {
      onShowToast(`Failed: ${e.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenBrowser = async (id: string) => {
    setDrawerAccountId(id);
    setIsDrawerOpen(true);
    try {
      onShowToast('Opening Pinterest login browser... Log in and then close the window.', 'info');
      const isConnected = await onOpenSession(id);
      await onRefreshAccounts();
      if (isConnected) {
        onShowToast('✅ Login successful! Account is now connected.', 'success');
      } else {
        onShowToast('⚠️ Session not detected. Please log in to Pinterest before closing the browser.', 'warn');
      }
    } catch (e: any) {
      onShowToast(`Failed to launch browser: ${e.message}`, 'error');
    }
  };

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    try {
      await onVerifySession(id);
    } finally {
      setVerifyingId(null);
    }
  };

  const handleSaveQuota = async (accountId: string, newQuota: number) => {
    const quotaVal = Math.max(1, Math.min(500, newQuota));
    try {
      await api.saveSetting(`quota_${accountId}`, quotaVal);
      setAccountQuotas(prev => ({ ...prev, [accountId]: quotaVal }));
      setEditingQuotaAccountId(null);
      onShowToast(`Daily pin limit set to ${quotaVal} pins/day.`, 'success');
    } catch (e: any) {
      onShowToast(`Failed to save quota: ${e.message}`, 'error');
    }
  };

  // Compute pins published today for a specific account
  const getPinsToday = (accountId: string): number => {
    const todayStr = new Date().toDateString();
    return queue.filter(q => 
      q.accountId === accountId && 
      q.status === 'completed' && 
      new Date(q.completedAt || q.createdAt).toDateString() === todayStr
    ).length;
  };

  // Compute session health metrics
  const getHealthMetrics = (account: Account) => {
    const isConnected = account.sessionStatus === 'connected';
    const hasCredentials = Boolean(account.email && account.password);
    const pinsToday = getPinsToday(account.id);
    const quotaLimit = accountQuotas[account.id] || 40;
    const quotaPct = Math.min(100, Math.round((pinsToday / quotaLimit) * 100));

    let score = 0;
    if (isConnected) score += 60;
    if (hasCredentials) score += 20;
    if (account.lastUsedAt) {
      const hoursAgo = (Date.now() - new Date(account.lastUsedAt).getTime()) / (1000 * 60 * 60);
      if (hoursAgo < 24) score += 20;
      else if (hoursAgo < 72) score += 10;
    }

    let statusLabel = 'Disconnected';
    let statusColor = '#f87171'; // rose
    let badgeBg = 'rgba(239,68,68,0.1)';
    let borderClr = 'rgba(239,68,68,0.25)';

    if (isConnected) {
      if (score >= 80) {
        statusLabel = 'Optimal Health';
        statusColor = '#34d399'; // emerald
        badgeBg = 'rgba(52,211,153,0.1)';
        borderClr = 'rgba(52,211,153,0.25)';
      } else {
        statusLabel = 'Connected (Check)';
        statusColor = '#fbbf24'; // amber
        badgeBg = 'rgba(251,191,36,0.1)';
        borderClr = 'rgba(251,191,36,0.25)';
      }
    } else if (account.sessionStatus === 'expired') {
      statusLabel = 'Session Expired';
      statusColor = '#fb923c'; // orange
      badgeBg = 'rgba(251,146,60,0.1)';
      borderClr = 'rgba(251,146,60,0.25)';
    }

    return {
      score,
      statusLabel,
      statusColor,
      badgeBg,
      borderClr,
      isConnected,
      hasCredentials,
      pinsToday,
      quotaLimit,
      quotaPct
    };
  };

  const connectedCount = accounts.filter(a => a.sessionStatus === 'connected').length;
  const totalPinsToday = accounts.reduce((acc, a) => acc + getPinsToday(a.id), 0);
  const activeBrowserAcc = accounts.find(a => a.id === browserStatus?.accountId) || accounts.find(a => a.id === drawerAccountId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, position: 'relative' }}>
      
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.2 }}>
              Accounts & Sessions
            </h1>
            <span style={{ 
              fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 20,
              background: 'rgba(230,0,35,0.15)', color: '#f87171', border: '1px solid rgba(230,0,35,0.3)',
              display: 'inline-flex', alignItems: 'center', gap: 4
            }}>
              <Sparkles className="w-3 h-3" /> Live Management
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
            Monitor Pinterest session health, manage daily posting quotas, and inspect browser automation state.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Live Drawer Toggle Button */}
          <button
            onClick={() => setIsDrawerOpen(prev => !prev)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 16px', borderRadius: 12, cursor: 'pointer',
              background: browserStatus?.isOpen ? 'rgba(251,146,60,0.15)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${browserStatus?.isOpen ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.12)'}`,
              color: browserStatus?.isOpen ? '#fb923c' : 'rgba(255,255,255,0.8)',
              fontWeight: 700, fontSize: 13,
              transition: 'all 0.2s ease'
            }}>
            <Wifi className={`w-4 h-4 ${browserStatus?.isOpen ? 'animate-pulse text-amber-400' : ''}`} />
            Live Session Drawer
            {browserStatus?.isOpen && (
              <span style={{ 
                width: 8, height: 8, borderRadius: 4, background: '#fb923c',
                boxShadow: '0 0 8px #fb923c'
              }} />
            )}
          </button>

          {/* Add Account Button */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 12, cursor: 'pointer',
              background: 'linear-gradient(135deg, #e60023, #ad081b)',
              border: '1px solid transparent', color: '#fff', fontWeight: 800, fontSize: 13,
              boxShadow: '0 4px 20px rgba(230,0,35,0.35)',
              transition: 'transform 0.15s ease'
            }}>
            <UserPlus className="w-4 h-4" /> Add Account
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {/* Total Accounts */}
        <div style={{
          padding: '16px 18px', borderRadius: 16,
          background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', gap: 14
        }}>
          <div style={{ 
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Shield className="w-5 h-5" style={{ color: '#818cf8' }} />
          </div>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Connected Profiles</span>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', marginTop: 2 }}>
              {connectedCount} <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>/ {accounts.length} total</span>
            </div>
          </div>
        </div>

        {/* Daily Pins Published */}
        <div style={{
          padding: '16px 18px', borderRadius: 16,
          background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', gap: 14
        }}>
          <div style={{ 
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Zap className="w-5 h-5" style={{ color: '#34d399' }} />
          </div>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Pins Published Today</span>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', marginTop: 2 }}>
              {totalPinsToday} <span style={{ fontSize: 12, color: '#34d399', fontWeight: 600 }}>pins</span>
            </div>
          </div>
        </div>

        {/* Fleet Quota Capacity */}
        <div style={{
          padding: '16px 18px', borderRadius: 16,
          background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', gap: 14
        }}>
          <div style={{ 
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Gauge className="w-5 h-5" style={{ color: '#fb923c' }} />
          </div>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>Total Daily Capacity</span>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', marginTop: 2 }}>
              {accounts.reduce((sum, a) => sum + (accountQuotas[a.id] || 40), 0)} <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>pins max</span>
            </div>
          </div>
        </div>
      </div>

      {/* Security Notice */}
      <div style={{ 
        display: 'flex', gap: 14, padding: '14px 18px',
        background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.14)',
        borderRadius: 14, alignItems: 'center'
      }}>
        <Shield className="w-5 h-5 flex-shrink-0" style={{ color: '#818cf8' }} />
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#a5b4fc', display: 'block' }}>Zero-Password Storage Promise & Stealth Browser Session</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
            Your credentials stay encrypted locally. Browser cookies are isolated per account profile with automated session health verification.
          </span>
        </div>
      </div>

      {/* Accounts Grid */}
      {accounts.length === 0 ? (
        <div style={{ 
          textAlign: 'center', padding: '64px 24px',
          background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)',
          borderRadius: 20
        }}>
          <div style={{ 
            width: 72, height: 72, borderRadius: 24,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'
          }}>
            <UserPlus className="w-8 h-8" style={{ color: 'rgba(255,255,255,0.2)' }} />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: 'rgba(255,255,255,0.4)', margin: '0 0 8px' }}>No Pinterest Accounts</h3>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', maxWidth: 340, margin: '0 auto 20px' }}>
            Add your first account profile, then log in manually to enable pin publishing.
          </p>
          <button onClick={() => setIsAddModalOpen(true)} style={{
            padding: '10px 20px', borderRadius: 10, cursor: 'pointer',
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.7)', fontWeight: 700, fontSize: 13
          }}>Add Account Now</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 18 }}>
          {accounts.map((account) => {
            const isBrowserOpen = browserStatus?.accountId === account.id && browserStatus?.isOpen;
            const isVerifying = verifyingId === account.id;
            const health = getHealthMetrics(account);

            // Quota fill progress calculation
            const quotaRemaining = Math.max(0, health.quotaLimit - health.pinsToday);
            const progressColor = health.quotaPct >= 90 ? 'linear-gradient(90deg, #f87171, #ef4444)'
              : health.quotaPct >= 70 ? 'linear-gradient(90deg, #fbbf24, #f59e0b)'
              : 'linear-gradient(90deg, #34d399, #10b981)';

            return (
              <div key={account.id} style={{ 
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${health.isConnected ? 'rgba(52,211,153,0.22)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 20, overflow: 'hidden',
                transition: 'all 0.2s ease',
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                boxShadow: health.isConnected ? '0 0 35px rgba(52,211,153,0.03) inset' : 'none'
              }}>
                <div>
                  {/* Card Header */}
                  <div style={{ 
                    padding: '18px 20px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {/* Avatar */}
                      <div style={{ 
                        width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                        background: `linear-gradient(135deg, ${health.isConnected ? '#065f46, #047857' : '#1e1b4b, #312e81'})`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `2px solid ${health.isConnected ? 'rgba(52,211,153,0.4)' : 'rgba(99,102,241,0.25)'}`,
                        fontSize: 18, fontWeight: 900, color: '#fff',
                        boxShadow: health.isConnected ? '0 0 16px rgba(52,211,153,0.25)' : 'none',
                        overflow: 'hidden'
                      }}>
                        {account.avatarUrl ? (
                          <img src={account.avatarUrl} alt={account.nickname} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          account.nickname.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div>
                        <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: 0 }}>{account.nickname}</h3>
                        {account.username ? (
                          <span style={{ fontSize: 11, color: '#34d399', fontWeight: 700, display: 'block', marginTop: 2 }}>
                            @{account.username}
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', display: 'block', marginTop: 2 }}>
                            ID: {account.id.substring(0, 12)}...
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status & Health Pill */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 10px', borderRadius: 20,
                        background: health.badgeBg,
                        border: `1px solid ${health.borderClr}`,
                        fontSize: 11, fontWeight: 800,
                        color: health.statusColor
                      }}>
                        <div style={{ 
                          width: 6, height: 6, borderRadius: 3,
                          background: health.statusColor,
                          animation: health.isConnected ? 'pulse-green 2s infinite' : 'none'
                        }} />
                        {health.statusLabel}
                      </div>

                      {health.isConnected && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)' }}>
                          Score: {health.score}/100
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    
                    {/* Session Health Indicators */}
                    <div style={{
                      padding: '12px 14px', borderRadius: 12,
                      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                      display: 'flex', flexDirection: 'column', gap: 10
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Activity className="w-3.5 h-3.5" style={{ color: '#818cf8' }} /> Session Health
                        </span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>
                          Verified {account.lastUsedAt ? new Date(account.lastUsedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never'}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {/* Cookie Status */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                          <div style={{ 
                            width: 6, height: 6, borderRadius: 3, 
                            background: health.isConnected ? '#34d399' : '#f87171' 
                          }} />
                          <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Cookies:</span>
                          <span style={{ color: health.isConnected ? '#34d399' : '#f87171', fontWeight: 700 }}>
                            {health.isConnected ? 'Active & Valid' : 'Expired'}
                          </span>
                        </div>

                        {/* Stored Credentials */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                          <Key className="w-3.5 h-3.5" style={{ color: health.hasCredentials ? '#34d399' : 'rgba(255,255,255,0.3)' }} />
                          <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Auto-Login:</span>
                          <span style={{ color: health.hasCredentials ? '#34d399' : 'rgba(255,255,255,0.35)', fontWeight: 700 }}>
                            {health.hasCredentials ? 'Configured' : 'Manual'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Account Quota Progress Bar */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Gauge className="w-3.5 h-3.5" style={{ color: '#fb923c' }} />
                          <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.7)' }}>
                            Daily Quota Progress
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 900, color: '#fff' }}>
                            {health.pinsToday} <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>/ {health.quotaLimit} pins today</span>
                          </span>

                          <button 
                            onClick={() => {
                              setEditingQuotaAccountId(account.id);
                              setTempQuotaInput(health.quotaLimit);
                            }}
                            title="Edit Daily Quota Limit"
                            style={{ 
                              background: 'transparent', border: 'none', cursor: 'pointer',
                              color: 'rgba(255,255,255,0.4)', padding: 2
                            }}>
                            <Sliders className="w-3 h-3 hover:text-slate-200" />
                          </button>
                        </div>
                      </div>

                      {/* Quota Edit Inline Box */}
                      {editingQuotaAccountId === account.id ? (
                        <div style={{ 
                          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                          background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 10
                        }}>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>Max Pins/Day:</span>
                          <input 
                            type="number" 
                            min={1} 
                            max={500}
                            value={tempQuotaInput}
                            onChange={(e) => setTempQuotaInput(parseInt(e.target.value, 10) || 1)}
                            style={{
                              width: 60, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                              borderRadius: 6, color: '#fff', fontSize: 12, padding: '2px 6px', fontWeight: 800
                            }}
                          />
                          <button 
                            onClick={() => handleSaveQuota(account.id, tempQuotaInput)}
                            style={{
                              padding: '3px 8px', borderRadius: 6, background: '#34d399', border: 'none',
                              color: '#000', fontWeight: 800, fontSize: 11, cursor: 'pointer'
                            }}>
                            Save
                          </button>
                          <button 
                            onClick={() => setEditingQuotaAccountId(null)}
                            style={{
                              padding: '3px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.1)', border: 'none',
                              color: 'rgba(255,255,255,0.6)', fontSize: 11, cursor: 'pointer'
                            }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        /* Progress Bar Visual Track */
                        <div style={{ 
                          width: '100%', height: 8, borderRadius: 4, 
                          background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
                          position: 'relative'
                        }}>
                          <div style={{ 
                            width: `${health.quotaPct}%`, height: '100%',
                            background: progressColor,
                            borderRadius: 4,
                            transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                            boxShadow: health.quotaPct >= 90 ? '0 0 10px rgba(239,68,68,0.5)' : 'none'
                          }} />
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
                        <span>{quotaRemaining} remaining today</span>
                        <span>{health.quotaPct}% used</span>
                      </div>
                    </div>

                    {/* Browser Active Warning Banner */}
                    {isBrowserOpen && (
                      <div style={{ 
                        padding: '10px 14px', borderRadius: 12,
                        background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.25)',
                        display: 'flex', gap: 8, alignItems: 'flex-start'
                      }}>
                        <Wifi className="w-4 h-4 flex-shrink-0" style={{ color: '#fb923c', marginTop: 1 }} />
                        <div>
                          <span style={{ fontSize: 10, fontWeight: 800, color: '#fb923c', textTransform: 'uppercase', display: 'block' }}>Live Session Active</span>
                          <span style={{ fontSize: 11, color: 'rgba(251,146,60,0.9)', lineHeight: 1.4, display: 'block', marginTop: 2 }}>{browserStatus?.message}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div style={{ 
                  padding: '14px 20px', 
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(0,0,0,0.2)',
                  display: 'flex', gap: 8 
                }}>
                  <button
                    onClick={() => handleOpenBrowser(account.id)}
                    disabled={isBrowserOpen}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      padding: '10px 14px', borderRadius: 12, cursor: isBrowserOpen ? 'not-allowed' : 'pointer',
                      background: health.isConnected ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #e60023, #ad081b)',
                      border: health.isConnected ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
                      color: health.isConnected ? 'rgba(255,255,255,0.85)' : '#fff',
                      fontWeight: 800, fontSize: 12, opacity: isBrowserOpen ? 0.5 : 1,
                      boxShadow: !health.isConnected ? '0 4px 14px rgba(230,0,35,0.35)' : 'none',
                      transition: 'all 0.15s ease'
                    }}>
                    <ExternalLink className="w-3.5 h-3.5" />
                    {health.isConnected ? 'Re-Open Browser' : 'Connect Account'}
                  </button>

                  <button
                    onClick={() => handleVerify(account.id)}
                    disabled={isBrowserOpen || isVerifying}
                    title="Verify Session Health"
                    style={{
                      padding: '10px 14px', borderRadius: 12,
                      cursor: (isBrowserOpen || isVerifying) ? 'not-allowed' : 'pointer',
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                      color: 'rgba(255,255,255,0.7)', opacity: (isBrowserOpen || isVerifying) ? 0.4 : 1,
                      display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 12,
                      transition: 'all 0.15s ease'
                    }}>
                    <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
                    Verify
                  </button>

                  <button
                    onClick={async () => {
                      if (confirm(`Delete account "${account.nickname}" and its saved cookies?`)) {
                        try {
                          await onDeleteAccount(account.id);
                          onShowToast('Account profile deleted.', 'success');
                        } catch (e: any) {
                          onShowToast(`Delete failed: ${e.message}`, 'error');
                        }
                      }
                    }}
                    disabled={isBrowserOpen}
                    title="Delete Account Profile"
                    style={{
                      padding: '10px 12px', borderRadius: 12,
                      cursor: isBrowserOpen ? 'not-allowed' : 'pointer',
                      background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
                      color: 'rgba(248,113,113,0.7)', opacity: isBrowserOpen ? 0.4 : 1,
                      display: 'flex', alignItems: 'center', transition: 'all 0.15s ease'
                    }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Live Browser Session Drawer */}
      {isDrawerOpen && (
        <div style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '90vw',
          background: 'rgba(15, 15, 26, 0.98)',
          borderLeft: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(24px)',
          zIndex: 100,
          boxShadow: '-10px 0 40px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column',
          animation: 'slide-left 0.25s ease-out'
        }}>
          {/* Drawer Header */}
          <div style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ 
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Wifi className="w-4 h-4" style={{ color: '#fb923c' }} />
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 900, color: '#fff', margin: 0 }}>Live Session Drawer</h3>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Real-time Playwright Session Control</span>
              </div>
            </div>
            <button 
              onClick={() => setIsDrawerOpen(false)}
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'rgba(255,255,255,0.6)', cursor: 'pointer'
              }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Drawer Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {activeBrowserAcc ? (
              <>
                {/* Selected Account Card Banner */}
                <div style={{
                  padding: '16px', borderRadius: 16,
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', gap: 12
                }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 12,
                    background: 'linear-gradient(135deg, #e60023, #ad081b)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 900, color: '#fff'
                  }}>
                    {activeBrowserAcc.nickname.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 800, color: '#fff', margin: 0 }}>{activeBrowserAcc.nickname}</h4>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', display: 'block', marginTop: 2 }}>
                      {activeBrowserAcc.username ? `@${activeBrowserAcc.username}` : `Profile ID: ${activeBrowserAcc.id.substring(0, 10)}...`}
                    </span>
                  </div>
                </div>

                {/* Automation Status Card */}
                <div style={{
                  padding: '16px', borderRadius: 16,
                  background: browserStatus?.isOpen ? 'rgba(251,146,60,0.08)' : 'rgba(52,211,153,0.08)',
                  border: `1px solid ${browserStatus?.isOpen ? 'rgba(251,146,60,0.2)' : 'rgba(52,211,153,0.2)'}`,
                  display: 'flex', flexDirection: 'column', gap: 8
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: browserStatus?.isOpen ? '#fb923c' : '#34d399' }}>
                      {browserStatus?.isOpen ? '● Live Browser Open' : '✓ Browser Session Standby'}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.5 }}>
                    {browserStatus?.message || 'Chromium Playwright runner is idle and ready for task dispatch.'}
                  </p>
                </div>

                {/* Session Environment Spec */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)' }}>
                    Session Storage & Context
                  </span>

                  <div style={{
                    padding: '14px', borderRadius: 14,
                    background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', flexDirection: 'column', gap: 10, fontSize: 11
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>Engine</span>
                      <span style={{ color: '#fff', fontWeight: 700 }}>Playwright Chromium (Headed)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>Profile Path</span>
                      <span style={{ color: '#818cf8', fontFamily: 'monospace', fontSize: 10 }}>{activeBrowserAcc.profilePath || 'Default storage'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>Cookie Vault</span>
                      <span style={{ color: '#34d399', fontWeight: 700 }}>Encrypted SQLite</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>Anti-Detection Sandbox</span>
                      <span style={{ color: '#34d399', fontWeight: 700 }}>Active (--no-sandbox --disable-gpu)</span>
                    </div>
                  </div>
                </div>

                {/* Quick Actions in Drawer */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 'auto' }}>
                  <button
                    onClick={() => handleOpenBrowser(activeBrowserAcc.id)}
                    style={{
                      width: '100%', padding: '12px', borderRadius: 12, cursor: 'pointer',
                      background: 'linear-gradient(135deg, #e60023, #ad081b)', border: 'none',
                      color: '#fff', fontWeight: 800, fontSize: 13,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      boxShadow: '0 4px 16px rgba(230,0,35,0.35)'
                    }}>
                    <ExternalLink className="w-4 h-4" /> Launch Interactive Browser
                  </button>

                  <button
                    onClick={() => handleVerify(activeBrowserAcc.id)}
                    style={{
                      width: '100%', padding: '11px', borderRadius: 12, cursor: 'pointer',
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.8)', fontWeight: 700, fontSize: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                    }}>
                    <RefreshCw className="w-4 h-4" /> Verify Session Status Now
                  </button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.4)' }}>
                <WifiOff className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                <p style={{ fontSize: 14, fontWeight: 700 }}>No Active Session Selected</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', maxWidth: 280, margin: '8px auto 0' }}>
                  Select an account profile from the list to launch or inspect its live browser session.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      <Modal
        isOpen={isAddModalOpen}
        title="Add Pinterest Account Profile"
        onClose={() => setIsAddModalOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsAddModalOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAddAccount} loading={isSubmitting}>
              Create Profile
            </Button>
          </>
        }
      >
        <form onSubmit={handleAddAccount} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase font-extrabold text-slate-400 tracking-wider">
              Account Nickname <span style={{ color: '#f87171' }}>*</span>
            </label>
            <input
              type="text"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-slate-650"
              placeholder="e.g. My Home Decor Account"
              value={newNickname}
              onChange={(e) => setNewNickname(e.target.value)}
              disabled={isSubmitting}
              autoFocus
              required
            />
            <p className="text-[11px] text-slate-500">A private label to organize your profiles. Only you see this.</p>
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

          <div style={{ 
            padding: '12px 14px', borderRadius: 10,
            background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)'
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#a5b4fc', margin: '0 0 4px' }}>
              🔐 Optional: Auto-Login Credentials
            </p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: 0, lineHeight: 1.5 }}>
              If provided, the app will automatically re-authenticate your session when cookies expire. Stored securely on your device.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase font-extrabold text-slate-400 tracking-wider">Pinterest Email (Optional)</label>
            <input
              type="email"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-slate-650"
              placeholder="email@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase font-extrabold text-slate-400 tracking-wider">Pinterest Password (Optional)</label>
            <input
              type="password"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-slate-650"
              placeholder="••••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
        </form>
      </Modal>

      <style>{`
        @keyframes pulse-green {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(52,211,153,0.4); }
          50% { opacity: 0.8; box-shadow: 0 0 0 4px rgba(52,211,153,0); }
        }
        @keyframes slide-left {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};
