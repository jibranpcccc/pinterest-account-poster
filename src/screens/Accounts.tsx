import React, { useState } from 'react';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { Account } from '../types';
import { 
  UserPlus, ExternalLink, RefreshCw, Trash2, 
  CheckCircle, AlertTriangle, Key, Shield, Wifi, WifiOff
} from 'lucide-react';

interface AccountsProps {
  accounts: Account[];
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
      onShowToast('Account created! Click "Connect Account" to log in.', 'success');
      setNewNickname(''); setNewEmail(''); setNewPassword('');
      setIsAddModalOpen(false);
    } catch (e: any) {
      onShowToast(`Failed: ${e.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenBrowser = async (id: string) => {
    try {
      onShowToast('Opening Pinterest login browser... Log in and then close the window.', 'info');
      const isConnected = await onOpenSession(id);
      // This resolves AFTER the user closes the browser AND session is verified
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.2 }}>Accounts</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>Manage Pinterest browser sessions and login profiles</p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 12, cursor: 'pointer',
            background: 'linear-gradient(135deg, #e60023, #ad081b)',
            border: '1px solid transparent', color: '#fff', fontWeight: 800, fontSize: 13,
            boxShadow: '0 4px 20px rgba(230,0,35,0.35)'
          }}>
          <UserPlus className="w-4 h-4" /> Add Account
        </button>
      </div>

      {/* Security Notice */}
      <div style={{ 
        display: 'flex', gap: 14, padding: '16px 20px',
        background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)',
        borderRadius: 14
      }}>
        <Shield className="w-5 h-5 flex-shrink-0" style={{ color: '#818cf8', marginTop: 1 }} />
        <div>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#a5b4fc', display: 'block', marginBottom: 3 }}>Zero-Password Storage Promise</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
            We never store your Pinterest password. Clicking "Connect Account" opens a standard Chromium window where you log in directly on Pinterest's official site. 
            Your session cookies stay on your local machine and are only used to publish pins under your command.
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {accounts.map((account) => {
            const isBrowserOpen = browserStatus?.accountId === account.id && browserStatus?.isOpen;
            const isConnected = account.sessionStatus === 'connected';
            const isVerifying = verifyingId === account.id;

            return (
              <div key={account.id} style={{ 
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${isConnected ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 18, overflow: 'hidden',
                transition: 'all 0.2s ease',
                boxShadow: isConnected ? '0 0 30px rgba(52,211,153,0.04) inset' : 'none'
              }}>
                {/* Card Header */}
                <div style={{ 
                  padding: '18px 20px 16px',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* Avatar */}
                    <div style={{ 
                      width: 42, height: 42, borderRadius: 14, flexShrink: 0,
                      background: `linear-gradient(135deg, ${isConnected ? '#065f46, #047857' : '#1e1b4b, #312e81'})`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: `2px solid ${isConnected ? 'rgba(52,211,153,0.3)' : 'rgba(99,102,241,0.2)'}`,
                      fontSize: 18, fontWeight: 900, color: '#fff',
                      boxShadow: isConnected ? '0 0 16px rgba(52,211,153,0.2)' : 'none',
                      overflow: 'hidden'
                    }}>
                      {account.avatarUrl ? (
                        <img src={account.avatarUrl} alt={account.nickname} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        account.nickname.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div>
                      <h3 style={{ fontSize: 14, fontWeight: 800, color: '#fff', margin: 0 }}>{account.nickname}</h3>
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

                  {/* Status Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px', borderRadius: 20,
                    background: isConnected ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${isConnected ? 'rgba(52,211,153,0.25)' : 'rgba(239,68,68,0.25)'}`,
                    fontSize: 11, fontWeight: 800,
                    color: isConnected ? '#34d399' : '#f87171'
                  }}>
                    {/* Pulsing dot */}
                    <div style={{ 
                      width: 6, height: 6, borderRadius: 3,
                      background: isConnected ? '#34d399' : '#f87171',
                      animation: isConnected ? 'pulse-green 2s infinite' : 'none'
                    }} />
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </div>
                </div>

                {/* Card Body */}
                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Info Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', display: 'block', marginBottom: 3 }}>Last Verified</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>
                        {account.lastUsedAt ? new Date(account.lastUsedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', display: 'block', marginBottom: 3 }}>Auto-Login</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: account.email && account.password ? '#34d399' : 'rgba(255,255,255,0.35)' }}>
                        {account.email && account.password ? `✓ ${account.email}` : 'Manual only'}
                      </span>
                    </div>
                  </div>

                  {/* Browser Active Banner */}
                  {isBrowserOpen && (
                    <div style={{ 
                      padding: '10px 14px', borderRadius: 10,
                      background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.2)',
                      display: 'flex', gap: 8, alignItems: 'flex-start'
                    }}>
                      <Wifi className="w-4 h-4 flex-shrink-0" style={{ color: '#fb923c', marginTop: 1 }} />
                      <div>
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#fb923c', textTransform: 'uppercase', display: 'block' }}>Browser Window Open</span>
                        <span style={{ fontSize: 11, color: 'rgba(251,146,60,0.8)', lineHeight: 1.4, display: 'block', marginTop: 2 }}>{browserStatus?.message}</span>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button
                      onClick={() => handleOpenBrowser(account.id)}
                      disabled={isBrowserOpen}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                        padding: '9px 14px', borderRadius: 10, cursor: isBrowserOpen ? 'not-allowed' : 'pointer',
                        background: isConnected ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #e60023, #ad081b)',
                        border: isConnected ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
                        color: isConnected ? 'rgba(255,255,255,0.7)' : '#fff',
                        fontWeight: 700, fontSize: 12, opacity: isBrowserOpen ? 0.5 : 1,
                        boxShadow: !isConnected ? '0 3px 12px rgba(230,0,35,0.3)' : 'none',
                        transition: 'all 0.15s ease'
                      }}>
                      <ExternalLink className="w-3.5 h-3.5" />
                      {isConnected ? 'Re-Login' : 'Connect Account'}
                    </button>

                    <button
                      onClick={() => handleVerify(account.id)}
                      disabled={isBrowserOpen || isVerifying}
                      title="Verify Session"
                      style={{
                        padding: '9px 12px', borderRadius: 10,
                        cursor: (isBrowserOpen || isVerifying) ? 'not-allowed' : 'pointer',
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.5)', opacity: (isBrowserOpen || isVerifying) ? 0.4 : 1,
                        display: 'flex', alignItems: 'center', transition: 'all 0.15s ease'
                      }}>
                      <RefreshCw className={`w-4 h-4 ${isVerifying ? 'animate-spin' : ''}`} />
                    </button>

                    <button
                      onClick={async () => {
                        if (confirm(`Delete account "${account.nickname}" and its saved cookies?`)) {
                          try {
                            await onDeleteAccount(account.id);
                            onShowToast('Account deleted.', 'success');
                          } catch (e: any) {
                            onShowToast(`Delete failed: ${e.message}`, 'error');
                          }
                        }
                      }}
                      disabled={isBrowserOpen}
                      title="Delete Account"
                      style={{
                        padding: '9px 12px', borderRadius: 10,
                        cursor: isBrowserOpen ? 'not-allowed' : 'pointer',
                        background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)',
                        color: 'rgba(248,113,113,0.6)', opacity: isBrowserOpen ? 0.4 : 1,
                        display: 'flex', alignItems: 'center', transition: 'all 0.15s ease'
                      }}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
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
              placeholder="e.g. My Craft Board Account"
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
              If provided, the app will automatically re-authenticate your session when cookies expire. These are stored encrypted locally on your device only.
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
      `}</style>
    </div>
  );
};
