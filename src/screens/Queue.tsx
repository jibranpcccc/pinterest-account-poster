import React, { useEffect, useState, useRef } from 'react';
import { QueueItemRow } from '../components/QueueItemRow';
import { QueueJob, Account, QueueProgressData } from '../types';
import { 
  Play, Pause, Square, Trash2, ListOrdered, 
  CheckCircle2, XCircle, RefreshCw, Terminal, Zap, Clock
} from 'lucide-react';
import { api } from '../services/api';

interface QueueProps {
  accounts: Account[];
  queue: QueueJob[];
  onRefreshQueue: () => Promise<void>;
  onShowToast: (msg: string, type: 'success' | 'error' | 'warn' | 'info') => void;
}

export const Queue: React.FC<QueueProps> = ({
  accounts,
  queue,
  onRefreshQueue,
  onShowToast
}) => {
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [logMessages, setLogMessages] = useState<{ text: string; ts: string }[]>([]);
  const [queueSummary, setQueueSummary] = useState<QueueProgressData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const pendingJobs = queue.filter(q => q.status === 'pending');
  const completedJobs = queue.filter(q => q.status === 'completed');
  const failedJobs = queue.filter(q => q.status === 'failed');

  const addLog = (text: string) => {
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogMessages(prev => [...prev.slice(-49), { text, ts }]);
    setTimeout(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, 50);
  };

  useEffect(() => {
    if (queue.filter(q => q.status === 'running').length > 0) {
      setIsProcessing(true);
      setRunningJobId(queue.find(q => q.status === 'running')?.id || null);
    }
  }, [queue]);

  useEffect(() => {
    api.onQueueProgress((event, data: QueueProgressData) => {
      setQueueSummary(data);
      setRunningJobId(data.jobId);
      setCurrentProgress(data.progress);
      addLog(data.message);
      
      if (data.status === 'running') {
        setIsProcessing(true);
        setIsPaused(false);
      } else if (data.status === 'paused') {
        setIsProcessing(true);
        setIsPaused(true);
      } else if (data.status === 'completed' || data.status === 'failed') {
        onRefreshQueue();
      }

      if (data.completedCount + data.failedCount === data.totalCount && data.progress === 100 && (data.status === 'completed' || data.status === 'failed')) {
        setIsProcessing(false);
        setIsPaused(false);
        setRunningJobId(null);
        onRefreshQueue();
        onShowToast('🎉 Publish queue execution completed!', 'success');
      }
    });
    // NOTE: onBrowserStatusChange is handled globally in App.tsx to keep the status banner working
    // across all screens. Individual browser log messages arrive via queue:progress events.
  }, [onRefreshQueue, onShowToast]);

  const handleStartQueue = async () => {
    const targets = queue.filter(q => q.status === 'pending' || q.status === 'failed');
    if (targets.length === 0) {
      onShowToast('No pending or failed jobs to process.', 'warn');
      return;
    }
    setIsProcessing(true);
    setIsPaused(false);
    setLogMessages([]);
    addLog('Initializing publish queue execution...');
    try {
      await api.startQueueExecution(targets.map(t => t.id));
      onShowToast('Queue started.', 'success');
    } catch (e: any) {
      onShowToast(`Failed to start queue: ${e.message}`, 'error');
      setIsProcessing(false);
    }
  };

  const handlePauseQueue = async () => {
    try {
      await api.pauseQueueExecution();
      setIsPaused(true);
      addLog('Queue paused by user.');
      onShowToast('Queue paused.', 'warn');
    } catch (e: any) { onShowToast(`Pause failed: ${e.message}`, 'error'); }
  };

  const handleResumeQueue = async () => {
    try {
      await api.resumeQueueExecution();
      setIsPaused(false);
      addLog('Queue resumed by user.');
      onShowToast('Queue resumed.', 'success');
    } catch (e: any) { onShowToast(`Resume failed: ${e.message}`, 'error'); }
  };

  const handleStopQueue = async () => {
    try {
      await api.stopQueueExecution();
      setIsProcessing(false);
      setIsPaused(false);
      setRunningJobId(null);
      addLog('Queue stopped by user.');
      onShowToast('Queue stopped.', 'error');
      await onRefreshQueue();
    } catch (e: any) { onShowToast(`Stop failed: ${e.message}`, 'error'); }
  };

  const handleClearQueue = async () => {
    if (confirm('Clear all completed, failed, and pending jobs from the queue?')) {
      try {
        await api.clearQueue();
        onShowToast('Queue cleared.', 'success');
        await onRefreshQueue();
      } catch (e: any) { onShowToast(`Clear failed: ${e.message}`, 'error'); }
    }
  };

  const handleDeleteJob = async (id: string) => {
    try {
      await api.deleteQueueJob(id);
      onShowToast('Job removed.', 'success');
      await onRefreshQueue();
    } catch (e: any) { onShowToast(`Delete failed: ${e.message}`, 'error'); }
  };

  const handleRetryJob = async (job: QueueJob) => {
    try {
      await api.updateQueueJobStatus(job.id, 'pending');
      onShowToast('Job reset to pending.', 'success');
      await onRefreshQueue();
    } catch (e: any) { onShowToast(`Reset failed: ${e.message}`, 'error'); }
  };

  const totalCount = queueSummary ? queueSummary.totalCount : pendingJobs.length + completedJobs.length + failedJobs.length;
  const processedCount = queueSummary ? (queueSummary.completedCount + queueSummary.failedCount) : completedJobs.length + failedJobs.length;
  const overallPct = totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;

  const runningJob = queue.find(q => q.id === runningJobId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.2 }}>Publish Queue</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
            {pendingJobs.length} pending · {completedJobs.length} published · {failedJobs.length} failed
          </p>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isProcessing ? (
            <button onClick={handleStartQueue}
              disabled={queue.filter(q => q.status === 'pending' || q.status === 'failed').length === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 20px', borderRadius: 12, cursor: 'pointer',
                background: 'linear-gradient(135deg, #e60023, #ad081b)',
                border: '1px solid transparent', color: '#fff', fontWeight: 800, fontSize: 13,
                boxShadow: '0 4px 20px rgba(230,0,35,0.35)',
                transition: 'all 0.15s ease', opacity: queue.filter(q => q.status === 'pending' || q.status === 'failed').length === 0 ? 0.4 : 1
              }}>
              <Play className="w-4 h-4" /> Start Queue
            </button>
          ) : isPaused ? (
            <button onClick={handleResumeQueue} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 12, cursor: 'pointer',
              background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)',
              color: '#34d399', fontWeight: 800, fontSize: 13
            }}>
              <Play className="w-4 h-4" /> Resume
            </button>
          ) : (
            <button onClick={handlePauseQueue} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 12, cursor: 'pointer',
              background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.25)',
              color: '#fb923c', fontWeight: 800, fontSize: 13
            }}>
              <Pause className="w-4 h-4" /> Pause
            </button>
          )}

          {isProcessing && (
            <button onClick={handleStopQueue} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: 12, cursor: 'pointer',
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
              color: '#f87171', fontWeight: 800, fontSize: 13
            }}>
              <Square className="w-4 h-4" /> Stop
            </button>
          )}

          <button onClick={handleClearQueue} disabled={isProcessing}
            title="Clear Queue"
            style={{
              padding: '10px 12px', borderRadius: 12, cursor: isProcessing ? 'not-allowed' : 'pointer',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.35)', opacity: isProcessing ? 0.4 : 1,
              display: 'flex', alignItems: 'center'
            }}>
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Active Execution Panel */}
      {isProcessing && (
        <div style={{ 
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 18, padding: 24, display: 'flex', flexDirection: 'column', gap: 18
        }}>
          {/* Top row: active job info + overall progress */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <RefreshCw className="w-4 h-4" style={{ color: '#e60023', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {isPaused ? 'Paused' : 'Publishing'}
              </span>
            </div>
            <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
              {processedCount} / {totalCount} · {overallPct}%
            </span>
          </div>

          {/* Overall progress bar */}
          <div style={{ position: 'relative' }}>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ 
                height: '100%', borderRadius: 99, 
                background: isPaused ? '#fb923c' : 'linear-gradient(90deg, #e60023, #ff6b9d)',
                width: `${overallPct}%`,
                transition: 'width 0.5s ease, background 0.3s ease',
                boxShadow: isPaused ? '0 0 10px rgba(251,146,60,0.4)' : '0 0 12px rgba(230,0,35,0.5)'
              }} />
            </div>
          </div>

          {/* Currently running job */}
          {runningJob && (
            <div style={{ 
              background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '14px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              border: '1px solid rgba(255,255,255,0.05)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {/* Thumbnail */}
                <div style={{ width: 32, height: 44, background: 'rgba(0,0,0,0.4)', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                  {runningJob.imagePath && (
                    <img src={`media:///${runningJob.imagePath.replace(/\\/g, '/')}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>
                <div>
                  <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', display: 'block' }}>Currently Processing</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.9)', display: 'block', marginTop: 2 }}>{runningJob.title || 'Untitled Pin'}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', display: 'block', marginTop: 1 }}>Board: {runningJob.boardName}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: '#fb923c' }}>{currentProgress}%</span>
                <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: '#fb923c', borderRadius: 99, width: `${currentProgress}%`, transition: 'width 0.4s ease' }} />
                </div>
              </div>
            </div>
          )}

          {/* Live Log Console */}
          <div style={{ 
            background: 'rgba(0,0,0,0.4)', borderRadius: 12, padding: '12px 14px',
            border: '1px solid rgba(255,255,255,0.04)', maxHeight: 160, overflowY: 'auto',
            fontFamily: 'monospace', fontSize: 11
          }} ref={logRef}>
            {logMessages.length === 0 ? (
              <div style={{ color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>Waiting for publisher log...</div>
            ) : logMessages.map((msg, i) => (
              <div key={i} style={{ 
                display: 'flex', gap: 10, padding: '2px 0',
                borderBottom: i < logMessages.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none'
              }}>
                <span style={{ color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>[{msg.ts}]</span>
                <span style={{ color: i === logMessages.length - 1 ? '#34d399' : 'rgba(255,255,255,0.5)', wordBreak: 'break-word' }}>
                  {msg.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Queue Items */}
      <div style={{ 
        background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 18, overflow: 'hidden'
      }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#fff', margin: 0 }}>Queue Items</h3>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: '3px 0 0' }}>{queue.length} jobs in local database</p>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
            <span style={{ color: '#60a5fa' }}>● {pendingJobs.length} pending</span>
            <span style={{ color: '#34d399' }}>● {completedJobs.length} done</span>
            {failedJobs.length > 0 && <span style={{ color: '#f87171' }}>● {failedJobs.length} failed</span>}
          </div>
        </div>

        <div style={{ padding: '12px 16px' }}>
          {queue.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '56px 24px' }}>
              <div style={{ 
                width: 64, height: 64, borderRadius: 20,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'
              }}>
                <ListOrdered className="w-7 h-7" style={{ color: 'rgba(255,255,255,0.2)' }} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'rgba(255,255,255,0.4)', margin: '0 0 8px' }}>Queue is Empty</h3>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', maxWidth: 320, margin: '0 auto' }}>
                Go to Create Pin to design pins, assign boards, and add them to the queue.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {queue.map((job) => (
                <QueueItemRow
                  key={job.id}
                  job={job}
                  accounts={accounts}
                  onDelete={handleDeleteJob}
                  onRetry={handleRetryJob}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
