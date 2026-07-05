import React from 'react';
import { 
  Users, FileText, ListOrdered, CheckCircle2, XCircle, 
  Plus, Upload, Zap, ExternalLink, Activity, ArrowRight,
  TrendingUp, Clock
} from 'lucide-react';
import { Account, QueueJob, Draft, Log } from '../types';

interface DashboardProps {
  accounts: Account[];
  drafts: Draft[];
  queue: QueueJob[];
  logs: Log[];
  onNavigate: (screen: string) => void;
  onRefresh: () => void;
  isMockMode: boolean;
}

const StatCard: React.FC<{
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ReactNode;
  color: string;
  glow: string;
  onClick?: () => void;
}> = ({ label, value, sub, icon, color, glow, onClick }) => (
  <div
    onClick={onClick}
    style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 18,
      padding: '20px 22px',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.2s ease',
      position: 'relative',
      overflow: 'hidden'
    }}
    onMouseEnter={e => { if (onClick) { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.12)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; } }}
    onMouseLeave={e => { if (onClick) { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; } }}
  >
    {/* Subtle gradient overlay */}
    <div style={{ position: 'absolute', top: 0, right: 0, width: 120, height: 120, background: `radial-gradient(circle at 100% 0%, ${glow} 0%, transparent 70%)`, opacity: 0.15 }} />
    
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>{label}</span>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${glow}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${glow}25`, flexShrink: 0 }}>
        <div style={{ color }}>{icon}</div>
      </div>
    </div>
    
    <div>
      <span style={{ fontSize: 36, fontWeight: 900, color: '#fff', lineHeight: 1, display: 'block', letterSpacing: '-0.02em' }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4, display: 'block' }}>{sub}</span>}
    </div>
  </div>
);

export const Dashboard: React.FC<DashboardProps> = ({
  accounts,
  drafts,
  queue,
  logs,
  onNavigate,
  onRefresh,
  isMockMode
}) => {
  const connectedAccountsCount = accounts.filter(a => a.sessionStatus === 'connected').length;
  const pendingJobs = queue.filter(q => q.status === 'pending' || q.status === 'running' || q.status === 'paused');
  const completedJobs = queue.filter(q => q.status === 'completed');
  const failedJobs = queue.filter(q => q.status === 'failed');

  const recentPublished = [...completedJobs]
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))
    .slice(0, 6);

  const recentFailed = [...failedJobs]
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))
    .slice(0, 4);

  const successRate = (completedJobs.length + failedJobs.length) > 0
    ? Math.round((completedJobs.length / (completedJobs.length + failedJobs.length)) * 100)
    : 0;

  // Auto-refresh every 30 seconds so published pins appear without manual interaction
  React.useEffect(() => {
    const interval = setInterval(onRefresh, 30000);
    return () => clearInterval(interval);
  }, [onRefresh]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.2 }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>Your Pinterest publishing command center</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isMockMode && (
            <span style={{ 
              background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 700,
              color: '#f59e0b', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6
            }}>
              <Zap className="w-3 h-3" /> DEMO MODE
            </span>
          )}
          <button onClick={onRefresh} style={{ 
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10, padding: '8px 14px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
            transition: 'all 0.15s ease'
          }}>
            <Activity className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
        <StatCard
          label="Connected" value={connectedAccountsCount}
          sub={`of ${accounts.length} accounts`}
          icon={<Users className="w-4.5 h-4.5" />}
          color="#60a5fa" glow="#3b82f6"
          onClick={() => onNavigate('accounts')}
        />
        <StatCard
          label="Drafts" value={drafts.length}
          sub="saved templates"
          icon={<FileText className="w-4.5 h-4.5" />}
          color="#a78bfa" glow="#8b5cf6"
          onClick={() => onNavigate('drafts')}
        />
        <StatCard
          label="In Queue" value={pendingJobs.length}
          sub="awaiting publish"
          icon={<ListOrdered className="w-4.5 h-4.5" />}
          color="#fb923c" glow="#f97316"
          onClick={() => onNavigate('queue')}
        />
        <StatCard
          label="Published" value={completedJobs.length}
          sub="pins live"
          icon={<CheckCircle2 className="w-4.5 h-4.5" />}
          color="#34d399" glow="#10b981"
          onClick={() => onNavigate('queue')}
        />
        <StatCard
          label="Success Rate" value={`${successRate}%`}
          sub={failedJobs.length > 0 ? `${failedJobs.length} failed` : 'no failures'}
          icon={<TrendingUp className="w-4.5 h-4.5" />}
          color={successRate >= 80 ? '#34d399' : successRate >= 50 ? '#fb923c' : '#f87171'}
          glow={successRate >= 80 ? '#10b981' : successRate >= 50 ? '#f97316' : '#ef4444'}
        />
      </div>

      {/* Quick Actions */}
      <div style={{ 
        display: 'flex', flexWrap: 'wrap', gap: 10, padding: '18px 20px',
        background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16, alignItems: 'center'
      }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginRight: 4 }}>Quick Actions</span>
        {[
          { label: 'Create Pin', icon: <Plus className="w-3.5 h-3.5" />, screen: 'create', primary: true },
          { label: 'Add Account', icon: <Users className="w-3.5 h-3.5" />, screen: 'accounts', primary: false },
          { label: 'Import Drafts', icon: <Upload className="w-3.5 h-3.5" />, screen: 'drafts', primary: false },
          { label: 'View Queue', icon: <ArrowRight className="w-3.5 h-3.5" />, screen: 'queue', primary: false },
        ].map(({ label, icon, screen, primary }) => (
          <button
            key={screen}
            onClick={() => onNavigate(screen)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
              fontSize: 12, fontWeight: 700, border: '1px solid',
              transition: 'all 0.15s ease',
              background: primary ? 'linear-gradient(135deg, #e60023, #ad081b)' : 'rgba(255,255,255,0.04)',
              borderColor: primary ? 'transparent' : 'rgba(255,255,255,0.1)',
              color: primary ? '#fff' : 'rgba(255,255,255,0.6)',
              boxShadow: primary ? '0 4px 15px rgba(230,0,35,0.3)' : 'none'
            }}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* Content Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Recently Published */}
        <div style={{ 
          background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 18, overflow: 'hidden'
        }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#fff', margin: 0 }}>Recently Published</h3>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: '3px 0 0' }}>Latest successful uploads</p>
            </div>
            <CheckCircle2 className="w-4 h-4" style={{ color: '#34d399' }} />
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentPublished.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>
                No pins published yet
              </div>
            ) : recentPublished.map((job) => (
              <div key={job.id} style={{ 
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                background: 'rgba(255,255,255,0.02)', borderRadius: 10, 
                border: '1px solid rgba(255,255,255,0.04)',
                transition: 'all 0.15s ease'
              }}>
                <div style={{ width: 32, height: 44, background: 'rgba(0,0,0,0.4)', borderRadius: 8, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {job.imagePath ? (
                    <img
                      src={`media:///${job.imagePath.replace(/\\/g, '/')}`}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                  ) : <FileText className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.2)' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {job.title || 'Untitled Pin'}
                  </p>
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {job.boardName} · {job.completedAt ? new Date(job.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </p>
                </div>
                {(job as any).livePinUrl ? (
                  <a href={(job as any).livePinUrl} target="_blank" rel="noreferrer"
                    style={{ color: '#34d399', flexShrink: 0 }} title="View on Pinterest">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : job.destinationUrl ? (
                  <a href={job.destinationUrl} target="_blank" rel="noreferrer"
                    style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* Activity Log */}
        <div style={{ 
          background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 18, overflow: 'hidden'
        }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#fff', margin: 0 }}>Activity Log</h3>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: '3px 0 0' }}>Real-time system events</p>
            </div>
            <button onClick={() => onNavigate('logs')} style={{ 
              fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)',
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4
            }}>
              Full Logs <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div style={{ padding: '8px 16px', maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {logs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>No events yet</div>
            ) : logs.slice(0, 12).map((log, idx) => {
              const colors = { info: 'rgba(255,255,255,0.4)', warn: '#fb923c', error: '#f87171' };
              const bg = { info: 'transparent', warn: 'rgba(251,146,60,0.04)', error: 'rgba(248,113,113,0.04)' };
              return (
                <div key={idx} style={{ 
                  display: 'flex', gap: 10, padding: '7px 4px',
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                  background: bg[log.level],
                  borderRadius: 6
                }}>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', flexShrink: 0, fontFamily: 'monospace', marginTop: 1 }}>
                    {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span style={{ 
                    fontSize: 9, fontWeight: 800, textTransform: 'uppercase', flexShrink: 0,
                    padding: '1px 5px', borderRadius: 4, alignSelf: 'flex-start', marginTop: 1,
                    background: log.level === 'error' ? 'rgba(248,113,113,0.15)' : log.level === 'warn' ? 'rgba(251,146,60,0.15)' : 'rgba(255,255,255,0.06)',
                    color: colors[log.level]
                  }}>
                    {log.level}
                  </span>
                  <span style={{ fontSize: 11, color: colors[log.level], flex: 1, lineHeight: 1.4, wordBreak: 'break-word' }}>
                    {log.message}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Failures (if any) */}
      {recentFailed.length > 0 && (
        <div style={{ 
          background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)',
          borderRadius: 18, overflow: 'hidden'
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <XCircle className="w-4 h-4" style={{ color: '#f87171' }} />
            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#f87171', margin: 0 }}>Failed Jobs ({recentFailed.length})</h3>
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentFailed.map(job => (
              <div key={job.id} style={{ 
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px',
                background: 'rgba(239,68,68,0.04)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.1)'
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)', margin: 0 }}>{job.title || 'Untitled Pin'}</p>
                  <p style={{ fontSize: 11, color: '#f87171', margin: '4px 0 0', fontFamily: 'monospace' }}>{job.errorMessage || 'Unknown error'}</p>
                </div>
                <span style={{ 
                  fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
                  background: 'rgba(239,68,68,0.15)', color: '#f87171',
                  border: '1px solid rgba(239,68,68,0.2)', flexShrink: 0
                }}>FAILED</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
