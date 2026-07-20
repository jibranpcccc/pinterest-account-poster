import React, { useEffect, useState, useRef } from 'react';
import { QueueItemRow } from '../components/QueueItemRow';
import { QueueJob, Account, QueueProgressData } from '../types';
import { 
  Play, Pause, Square, Trash2, ListOrdered, 
  RefreshCw, Clock
} from 'lucide-react';
import { api } from '../services/api';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';

// Date/Time helper functions for Bulk Scheduling Distribution
const getTodayDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
};

const parseDateTimeToMs = (dateStr: string, timeStr: string) => {
  const timeClean = timeStr.trim().toUpperCase();
  let hours = 0;
  let minutes = 0;
  
  if (timeClean.endsWith('AM') || timeClean.endsWith('PM')) {
    const isPM = timeClean.endsWith('PM');
    const timeParts = timeClean.substring(0, timeClean.length - 2).trim().split(':');
    hours = parseInt(timeParts[0]);
    minutes = parseInt(timeParts[1]);
    if (isPM && hours !== 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
  } else {
    const timeParts = timeClean.split(':');
    hours = parseInt(timeParts[0]);
    minutes = parseInt(timeParts[1]);
  }
  
  // Parse date string (supports both YYYY-MM-DD and MM-DD-YYYY or DD-MM-YYYY with either - or /)
  const dateParts = dateStr.split(/[-/]/).map(Number);
  let year = NaN, month = NaN, day = NaN;

  if (dateParts.length === 3) {
    if (dateParts[0] > 1000) {
      // YYYY-MM-DD or YYYY/MM/DD
      year = dateParts[0];
      month = dateParts[1];
      day = dateParts[2];
    } else if (dateParts[2] > 1000) {
      // MM-DD-YYYY or DD-MM-YYYY
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

  const d = !isNaN(year) && !isNaN(month) && !isNaN(day)
    ? new Date(year, month - 1, day, hours, minutes)
    : new Date(`${dateStr} ${timeStr}`);

  return d.getTime();
};

const convertMsToDateTime = (ms: number) => {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strHours = String(hours).padStart(2, '0');
  const strMinutes = String(minutes).padStart(2, '0');
  const timeStr = `${strHours}:${strMinutes} ${ampm}`;
  
  return { dateStr, timeStr };
};

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

  // States for Bulk Scheduling
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkStartDate, setBulkStartDate] = useState(getTodayDateString());
  const [bulkEndDate, setBulkEndDate] = useState(getTodayDateString());
  const [bulkPostsPerDay, setBulkPostsPerDay] = useState(2);
  const [bulkStartTime, setBulkStartTime] = useState('09:00');
  const [bulkSpreadWindow, setBulkSpreadWindow] = useState(4);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewSlots, setPreviewSlots] = useState<{ jobId: string; title: string; accountNickname: string; date: string; time: string; }[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);

  const [activeTab, setActiveTab] = useState<'queue' | 'scheduled' | 'published' | 'failed'>('queue');
  const [refreshCountdown, setRefreshCountdown] = useState(60);

  useEffect(() => {
    const timer = setInterval(() => {
      setRefreshCountdown(prev => {
        if (prev <= 1) {
          onRefreshQueue().catch(console.error);
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onRefreshQueue]);

  const handleUpdateSchedule = async (id: string, date: string, time: string) => {
    const job = queue.find(q => q.id === id);
    if (!job) return;
    try {
      const [hStr, mStr] = time.split(':');
      let hour = parseInt(hStr, 10);
      const minute = parseInt(mStr, 10);
      let formattedTime = '';
      if (!isNaN(hour) && !isNaN(minute)) {
        const ampm = hour >= 12 ? 'PM' : 'AM';
        hour = hour % 12;
        hour = hour ? hour : 12;
        formattedTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${ampm}`;
      } else {
        formattedTime = time;
      }
      const updatedJob = {
        ...job,
        scheduledDate: date,
        scheduledTime: formattedTime,
        status: 'scheduled' as const
      };
      await api.saveQueueJob(updatedJob);
      onShowToast('Post schedule updated.', 'success');
      await onRefreshQueue();
    } catch (e: any) {
      onShowToast(`Failed to update schedule: ${e.message}`, 'error');
    }
  };

  const handleUnschedule = async (id: string) => {
    const job = queue.find(q => q.id === id);
    if (!job) return;
    try {
      const updatedJob = {
        ...job,
        status: 'pending' as const,
        scheduledDate: null,
        scheduledTime: null
      };
      await api.saveQueueJob(updatedJob);
      onShowToast('Post unscheduled.', 'success');
      await onRefreshQueue();
    } catch (e: any) {
      onShowToast(`Failed to unschedule: ${e.message}`, 'error');
    }
  };

  // Sync selected job IDs with the queue, only keeping pending items
  useEffect(() => {
    setSelectedJobIds(prev => prev.filter(id => queue.some(q => q.id === id && q.status === 'pending')));
  }, [queue]);

  const handleToggleSelect = (id: string) => {
    setSelectedJobIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleGenerateBulkSchedule = async () => {
    if (bulkPostsPerDay < 1 || bulkPostsPerDay > 40) {
      onShowToast('Posts per day must be between 1 and 40.', 'warn');
      return;
    }

    const dates: string[] = [];
    let current = new Date(bulkStartDate + 'T00:00:00');
    const end = new Date(bulkEndDate + 'T00:00:00');
    if (isNaN(current.getTime()) || isNaN(end.getTime())) {
      onShowToast('Please provide valid start and end dates.', 'error');
      return;
    }
    if (current > end) {
      onShowToast('Start Date must be before or equal to End Date.', 'error');
      return;
    }
    while (current <= end) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, '0');
      const d = String(current.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
      current.setDate(current.getDate() + 1);
    }

    const getOrAddDateString = (index: number) => {
      while (index >= dates.length) {
        const lastDate = new Date(dates[dates.length - 1] + 'T00:00:00');
        lastDate.setDate(lastDate.getDate() + 1);
        const y = lastDate.getFullYear();
        const m = String(lastDate.getMonth() + 1).padStart(2, '0');
        const d = String(lastDate.getDate()).padStart(2, '0');
        dates.push(`${y}-${m}-${d}`);
      }
      return dates[index];
    };

    const selectedJobs = queue.filter(j => selectedJobIds.includes(j.id) && j.status === 'pending');
    if (selectedJobs.length === 0) {
      onShowToast('No pending jobs selected.', 'error');
      return;
    }

    const jobsByAccount: Record<string, QueueJob[]> = {};
    selectedJobs.forEach(job => {
      if (!jobsByAccount[job.accountId]) {
        jobsByAccount[job.accountId] = [];
      }
      jobsByAccount[job.accountId].push(job);
    });

    let latestQueue: QueueJob[] = [];
    try {
      latestQueue = await api.getQueue();
    } catch (e) {
      console.error('Failed to fetch latest queue', e);
    }

    const slots: { jobId: string; title: string; accountNickname: string; date: string; time: string; }[] = [];

    const [shour, smin] = bulkStartTime.split(':').map(Number);
    if (isNaN(shour) || isNaN(smin) || shour < 0 || shour > 23 || smin < 0 || smin > 59) {
      onShowToast('Please provide a valid start time (HH:MM).', 'error');
      return;
    }
    const startMinutes = shour * 60 + smin;

    for (const accountId in jobsByAccount) {
      const jobs = jobsByAccount[accountId];

      // 1. Group jobs by boardName for round-robin interleaving
      const jobsByBoard: Record<string, QueueJob[]> = {};
      jobs.forEach(job => {
        const bName = (job.boardName || '').trim() || 'Default Board';
        if (!jobsByBoard[bName]) {
          jobsByBoard[bName] = [];
        }
        jobsByBoard[bName].push(job);
      });

      // 2. Interleave the jobs round-robin by board
      const interleavedJobs: QueueJob[] = [];
      const boardNames = Object.keys(jobsByBoard);
      const boardQueues = boardNames.map(name => jobsByBoard[name]);
      
      let hasMore = true;
      let round = 0;
      while (hasMore) {
        hasMore = false;
        for (let i = 0; i < boardQueues.length; i++) {
          const q = boardQueues[i];
          if (round < q.length) {
            interleavedJobs.push(q[round]);
            hasMore = true;
          }
        }
        round++;
      }

      // 3. Keep track of daily scheduled count and board limits
      const accountScheduledJobs = latestQueue.filter(j => j.accountId === accountId && j.status === 'scheduled' && j.scheduledDate && j.scheduledTime);
      const accountTimestamps = accountScheduledJobs.map(j => parseDateTimeToMs(j.scheduledDate!, j.scheduledTime!));

      const dailyAccountCount: Record<string, number> = {};
      const dailyBoardCount: Record<string, Record<string, number>> = {};

      accountScheduledJobs.forEach(j => {
        const dStr = j.scheduledDate!;
        const bName = (j.boardName || '').trim() || 'Default Board';
        
        dailyAccountCount[dStr] = (dailyAccountCount[dStr] || 0) + 1;
        if (!dailyBoardCount[dStr]) {
          dailyBoardCount[dStr] = {};
        }
        dailyBoardCount[dStr][bName] = (dailyBoardCount[dStr][bName] || 0) + 1;
      });

      const assignedJobsByDate: Record<string, QueueJob[]> = {};
      let dateIdx = 0;
      const remainingJobs = [...interleavedJobs];

      while (remainingJobs.length > 0) {
        const dStr = getOrAddDateString(dateIdx);
        if (!dailyBoardCount[dStr]) {
          dailyBoardCount[dStr] = {};
        }
        if (!assignedJobsByDate[dStr]) {
          assignedJobsByDate[dStr] = [];
        }

        const currentAccCount = dailyAccountCount[dStr] || 0;
        const accLimit = Math.min(40, bulkPostsPerDay);
        
        if (currentAccCount >= accLimit) {
          dateIdx++;
          continue;
        }

        // Find the first job that fits within limits (max 7 per board on this day)
        let chosenJobIdx = -1;
        for (let idx = 0; idx < remainingJobs.length; idx++) {
          const job = remainingJobs[idx];
          const bName = (job.boardName || '').trim() || 'Default Board';
          const boardCountOnDay = dailyBoardCount[dStr][bName] || 0;

          if (boardCountOnDay < 7) {
            chosenJobIdx = idx;
            break;
          }
        }

        if (chosenJobIdx !== -1) {
          const job = remainingJobs.splice(chosenJobIdx, 1)[0];
          const bName = (job.boardName || '').trim() || 'Default Board';

          assignedJobsByDate[dStr].push(job);
          dailyAccountCount[dStr] = (dailyAccountCount[dStr] || 0) + 1;
          dailyBoardCount[dStr][bName] = (dailyBoardCount[dStr][bName] || 0) + 1;
        } else {
          dateIdx++;
        }
      }

      // 4. Distribute the assigned jobs across the hours of each day
      for (const dStr of dates) {
        const dayJobs = assignedJobsByDate[dStr] || [];
        const K = dayJobs.length;
        if (K === 0) continue;

        const intervalMinutes = K > 1 ? (bulkSpreadWindow * 60) / (K - 1) : 0;

        for (let j = 0; j < K; j++) {
          const job = dayJobs[j];
          const proposedMinutes = startMinutes + j * intervalMinutes;
          
          const [year, month, day] = dStr.split('-').map(Number);
          const baseHour = Math.floor(proposedMinutes / 60);
          const baseMin = Math.floor(proposedMinutes % 60);
          const baseCandDate = new Date(year, month - 1, day, baseHour, baseMin);
          const baseCandMs = baseCandDate.getTime();

          let tCandMs = baseCandMs;
          let found = false;
          let multiplier = 1;

          while (!found) {
            const hasCollision = accountTimestamps.some(tOther => Math.abs(tCandMs - tOther) < 30 * 60 * 1000);
            if (!hasCollision) {
              found = true;
            } else {
              const currentOffsetMinutes = 30 * multiplier;
              tCandMs = baseCandMs + currentOffsetMinutes * 60 * 1000;
              
              if (multiplier > 0) {
                multiplier = -multiplier;
              } else {
                multiplier = -multiplier + 1;
              }
            }
          }

          accountTimestamps.push(tCandMs);

          const { dateStr: finalDate, timeStr: finalTime } = convertMsToDateTime(tCandMs);

          const accNickname = accounts.find(a => a.id === accountId)?.nickname || accountId;
          slots.push({
            jobId: job.id,
            title: job.title || 'Untitled Pin',
            accountNickname: accNickname,
            date: finalDate,
            time: finalTime
          });
        }
      }
    }

    setPreviewSlots(slots);
    setIsPreviewMode(true);
  };

  const handleConfirmBulkSchedule = async () => {
    setIsConfirming(true);
    try {
      for (const slot of previewSlots) {
        const originalJob = queue.find(j => j.id === slot.jobId);
        if (!originalJob) continue;

        await api.saveQueueJob({
          ...originalJob,
          scheduledDate: slot.date,
          scheduledTime: slot.time,
          status: 'scheduled'
        });
      }
      
      onShowToast(`Successfully scheduled ${previewSlots.length} jobs!`, 'success');
      setSelectedJobIds([]);
      setShowBulkModal(false);
      await onRefreshQueue();
    } catch (e: any) {
      onShowToast(`Failed to update some jobs: ${e.message}`, 'error');
    } finally {
      setIsConfirming(false);
    }
  };

  const pendingJobs = queue.filter(q => q.status === 'pending');
  const scheduledJobs = queue.filter(q => q.status === 'scheduled');
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
    api.onQueueProgress((_event: any, data: QueueProgressData) => {
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

  const totalCount = queueSummary ? queueSummary.totalCount : pendingJobs.length + scheduledJobs.length + completedJobs.length + failedJobs.length;
  const processedCount = queueSummary ? (queueSummary.completedCount + queueSummary.failedCount) : completedJobs.length + failedJobs.length;
  const overallPct = totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;
  const runningJob = queue.find(q => q.id === runningJobId);

  const getFilteredJobs = () => {
    switch (activeTab) {
      case 'queue':
        return queue.filter(q => q.status === 'pending' || q.status === 'running' || q.status === 'paused');
      case 'scheduled':
        return [...queue.filter(q => q.status === 'scheduled')].sort((a, b) => {
          if (!a.scheduledDate || !b.scheduledDate) return 0;
          if (a.scheduledDate !== b.scheduledDate) {
            return a.scheduledDate.localeCompare(b.scheduledDate);
          }
          if (!a.scheduledTime || !b.scheduledTime) return 0;
          const timeToMinutes = (timeStr: string) => {
            const clean = timeStr.trim().toUpperCase();
            let hour = 0, min = 0;
            if (clean.endsWith('AM') || clean.endsWith('PM')) {
              const isPm = clean.endsWith('PM');
              const parts = clean.substring(0, clean.length - 2).trim().split(':');
              hour = parseInt(parts[0], 10) || 0;
              min = parseInt(parts[1], 10) || 0;
              if (isPm && hour !== 12) hour += 12;
              if (!isPm && hour === 12) hour = 0;
            } else {
              const parts = clean.split(':');
              hour = parseInt(parts[0], 10) || 0;
              min = parseInt(parts[1], 10) || 0;
            }
            return hour * 60 + min;
          };
          return timeToMinutes(a.scheduledTime) - timeToMinutes(b.scheduledTime);
        });
      case 'published':
        return queue.filter(q => q.status === 'completed');
      case 'failed':
        return queue.filter(q => q.status === 'failed');
      default:
        return queue;
    }
  };
  const filteredJobs = getFilteredJobs();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.2 }}>Publish Queue</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
            {pendingJobs.length} pending · {scheduledJobs.length} scheduled · {completedJobs.length} published · {failedJobs.length} failed
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
        <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: '#fff', margin: 0 }}>Queue Items</h3>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: '3px 0 0' }}>
                {queue.length} jobs in local database · Auto-refresh in {refreshCountdown}s
              </p>
            </div>
            
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.2)', padding: 4, borderRadius: 10, marginTop: 4 }}>
              <button
                onClick={() => setActiveTab('queue')}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: activeTab === 'queue' ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: activeTab === 'queue' ? '#fff' : 'rgba(255,255,255,0.4)',
                  border: 'none', transition: 'all 0.15s ease'
                }}
              >
                Queue ({pendingJobs.length + queue.filter(q => q.status === 'running' || q.status === 'paused').length})
              </button>
              <button
                onClick={() => setActiveTab('scheduled')}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: activeTab === 'scheduled' ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: activeTab === 'scheduled' ? '#fff' : 'rgba(255,255,255,0.4)',
                  border: 'none', transition: 'all 0.15s ease'
                }}
              >
                Scheduled ({scheduledJobs.length})
              </button>
              <button
                onClick={() => setActiveTab('published')}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: activeTab === 'published' ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: activeTab === 'published' ? '#fff' : 'rgba(255,255,255,0.4)',
                  border: 'none', transition: 'all 0.15s ease'
                }}
              >
                Published ({completedJobs.length})
              </button>
              <button
                onClick={() => setActiveTab('failed')}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: activeTab === 'failed' ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: activeTab === 'failed' ? '#fff' : 'rgba(255,255,255,0.4)',
                  border: 'none', transition: 'all 0.15s ease'
                }}
              >
                Failed ({failedJobs.length})
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
            {activeTab === 'queue' && pendingJobs.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 cursor-pointer font-bold select-none">
                  <input
                    type="checkbox"
                    checked={pendingJobs.length > 0 && selectedJobIds.length === pendingJobs.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedJobIds(pendingJobs.map(j => j.id));
                      } else {
                        setSelectedJobIds([]);
                      }
                    }}
                    className="rounded border-slate-800 text-pinterest-red bg-slate-950 focus:ring-0 w-4 h-4 cursor-pointer"
                  />
                  <span>Select All Pending</span>
                </label>
                {selectedJobIds.length > 0 && (
                  <button
                    onClick={() => {
                      setBulkStartDate(getTodayDateString());
                      setBulkEndDate(getTodayDateString());
                      setBulkPostsPerDay(2);
                      setBulkStartTime("09:00");
                      setBulkSpreadWindow(4);
                      setIsPreviewMode(false);
                      setPreviewSlots([]);
                      setShowBulkModal(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs shadow-md transition-colors"
                  >
                    <Clock className="w-3.5 h-3.5" /> Bulk Schedule ({selectedJobIds.length})
                  </button>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
              <span style={{ color: '#60a5fa' }}>● {pendingJobs.length} pending</span>
              <span style={{ color: '#c084fc' }}>● {scheduledJobs.length} scheduled</span>
              <span style={{ color: '#34d399' }}>● {completedJobs.length} done</span>
              {failedJobs.length > 0 && <span style={{ color: '#f87171' }}>● {failedJobs.length} failed</span>}
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 16px' }}>
          {filteredJobs.length === 0 ? (
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
                {activeTab === 'queue' ? 'Go to Create Pin to design pins, assign boards, and add them to the queue.' : `No ${activeTab} jobs found.`}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredJobs.map((job) => (
                <QueueItemRow
                  key={job.id}
                  job={job}
                  accounts={accounts}
                  onDelete={handleDeleteJob}
                  onRetry={handleRetryJob}
                  selected={selectedJobIds.includes(job.id)}
                  onToggleSelect={() => handleToggleSelect(job.id)}
                  isSelectable={job.status === 'pending'}
                  onUpdateSchedule={handleUpdateSchedule}
                  onUnschedule={handleUnschedule}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={showBulkModal}
        title="Bulk Schedule Queue"
        onClose={() => setShowBulkModal(false)}
        size={isPreviewMode ? 'lg' : 'md'}
        footer={
          isPreviewMode ? (
            <>
              <Button variant="ghost" onClick={() => setIsPreviewMode(false)}>
                Back
              </Button>
              <Button variant="success" onClick={handleConfirmBulkSchedule} loading={isConfirming}>
                Confirm & Save
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setShowBulkModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleGenerateBulkSchedule}>
                Generate Preview
              </Button>
            </>
          )
        }
      >
        {isPreviewMode ? (
          <div className="flex flex-col gap-4 text-sm text-slate-350">
            <p className="text-slate-400 text-xs">
              Verify the generated publishing slots before finalizing.
            </p>

            <div className="border border-slate-800 rounded-xl overflow-hidden max-h-[45vh] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-850 text-slate-400 text-xs font-bold uppercase">
                    <th className="p-3">Account</th>
                    <th className="p-3">Pin Title</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {previewSlots.map((slot, index) => (
                    <tr key={index} className="border-b border-slate-850/60 text-xs text-slate-200 hover:bg-slate-850/20">
                      <td className="p-3 font-semibold truncate max-w-[120px]" title={slot.accountNickname}>
                        {slot.accountNickname}
                      </td>
                      <td className="p-3 truncate max-w-[180px]" title={slot.title}>
                        {slot.title}
                      </td>
                      <td className="p-3 text-purple-400 font-bold">
                        {slot.date}
                      </td>
                      <td className="p-3 text-violet-400 font-bold">
                        {slot.time}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 text-sm text-slate-300">
            <p className="text-slate-450 text-xs leading-normal">
              Distribute the <span className="text-slate-250 font-bold">{selectedJobIds.length}</span> selected pending jobs evenly across the chosen date range.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Start Date</label>
                <input
                  type="date"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-700"
                  value={bulkStartDate}
                  onChange={(e) => setBulkStartDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">End Date</label>
                <input
                  type="date"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-700"
                  value={bulkEndDate}
                  onChange={(e) => setBulkEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Posts Per Day (Max 40)</label>
                <input
                  type="number"
                  min={1}
                  max={40}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-700"
                  value={bulkPostsPerDay}
                  onChange={(e) => setBulkPostsPerDay(Math.min(40, Math.max(1, parseInt(e.target.value) || 1)))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Start Time</label>
                <input
                  type="time"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-700"
                  value={bulkStartTime}
                  onChange={(e) => setBulkStartTime(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Spread (Hours)</label>
                <input
                  type="number"
                  min={1}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-700"
                  value={bulkSpreadWindow}
                  onChange={(e) => setBulkSpreadWindow(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
            </div>
          </div>
        )}
      </Modal>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
