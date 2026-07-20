import React from 'react';
import { QueueJob, Account } from '../types';
import { Trash2, RotateCcw, Image, ExternalLink, FileText } from 'lucide-react';
import { Button } from './Button';
import { api } from '../services/api';

interface QueueItemRowProps {
  job: QueueJob;
  accounts: Account[];
  onDelete: (id: string) => void;
  onRetry?: (job: QueueJob) => void;
  selected?: boolean;
  onToggleSelect?: () => void;
  isSelectable?: boolean;
  onUpdateSchedule?: (id: string, date: string, time: string) => void;
  onUnschedule?: (id: string) => void;
}

const convert12hTo24h = (time12: string): string => {
  if (!time12) return '';
  const clean = time12.trim().toUpperCase();
  if (!clean.endsWith('AM') && !clean.endsWith('PM')) {
    return clean;
  }
  const isPm = clean.endsWith('PM');
  const parts = clean.substring(0, clean.length - 2).trim().split(':');
  let hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);
  if (isNaN(hour) || isNaN(minute)) return '';
  if (isPm && hour !== 12) hour += 12;
  if (!isPm && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const getCountdownText = (dateStr: string, timeStr: string) => {
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

  const scheduledDate = !isNaN(year) && !isNaN(month) && !isNaN(day)
    ? new Date(year, month - 1, day, hour, min)
    : new Date(`${dateStr} ${timeStr}`);

  const now = new Date();
  const diffMs = scheduledDate.getTime() - now.getTime();
  if (diffMs <= 0) {
    return "Overdue — posting soon";
  }
  const diffSecs = Math.floor(diffMs / 1000);
  const days = Math.floor(diffSecs / 86400);
  const hours = Math.floor((diffSecs % 86400) / 3600);
  const minutes = Math.floor((diffSecs % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);

  return `Posts in ${parts.join(' ')}`;
};

export const QueueItemRow: React.FC<QueueItemRowProps> = ({
  job,
  accounts,
  onDelete,
  onRetry,
  selected = false,
  onToggleSelect,
  isSelectable = false,
  onUpdateSchedule,
  onUnschedule
}) => {
  const account = accounts.find((a) => a.id === job.accountId);
  const localImageSrc = job.imagePath ? `media:///${job.imagePath.replace(/\\/g, '/')}` : '';
  const [expanded, setExpanded] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const [localDate, setLocalDate] = React.useState(job.scheduledDate || '');
  const [localTime, setLocalTime] = React.useState(job.scheduledTime ? convert12hTo24h(job.scheduledTime) : '');
  const [, setTick] = React.useState(0);

  React.useEffect(() => {
    setLocalDate(job.scheduledDate || '');
    setLocalTime(job.scheduledTime ? convert12hTo24h(job.scheduledTime) : '');
  }, [job.scheduledDate, job.scheduledTime]);

  React.useEffect(() => {
    if (job.status !== 'scheduled') return;
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 10000);
    return () => clearInterval(interval);
  }, [job.status]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setLocalDate(newDate);
    if (onUpdateSchedule && newDate && localTime) {
      onUpdateSchedule(job.id, newDate, localTime);
    }
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value;
    setLocalTime(newTime);
    if (onUpdateSchedule && localDate && newTime) {
      onUpdateSchedule(job.id, localDate, newTime);
    }
  };

  const getDomain = (url: string) => {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      return parsed.hostname.replace('www.', '');
    } catch (e) {
      return url || '';
    }
  };

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (job.livePinUrl) {
      try {
        await api.writeToClipboard(job.livePinUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy to clipboard', err);
      }
    }
  };

  const statusColors = {
    pending: 'bg-blue-950/40 border-blue-900/60 text-blue-400',
    running: 'bg-yellow-950/40 border-yellow-800/60 text-yellow-400 animate-pulse',
    completed: 'bg-emerald-950/40 border-emerald-900/60 text-emerald-400',
    failed: 'bg-rose-950/40 border-rose-900/60 text-rose-400',
    paused: 'bg-slate-800 border-slate-700 text-slate-350',
    scheduled: 'bg-purple-950/40 border-purple-900/60 text-purple-400'
  };

  const statusLabels = {
    pending: 'Pending',
    running: 'Running',
    completed: 'Published',
    failed: 'Failed',
    paused: 'Paused',
    scheduled: 'Scheduled'
  };

  return (
    <div className="flex flex-col gap-3 p-4 bg-slate-900/40 border border-slate-880/80 rounded-xl hover:bg-slate-900/85 transition-colors">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0 flex-grow">
          {isSelectable && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="rounded border-slate-800 text-pinterest-red bg-slate-950 focus:ring-0 w-4 h-4 cursor-pointer flex-shrink-0"
            />
          )}
          {/* Thumbnail Preview */}
          <div className="w-14 h-20 rounded-lg bg-slate-950 flex-shrink-0 border border-slate-850 overflow-hidden flex items-center justify-center">
            {localImageSrc ? (
              <img
                src={localImageSrc}
                alt="Pin thumbnail"
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Remove broken source to show fallback icon
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <Image className="w-5 h-5 text-slate-700" />
            )}
          </div>

          {/* Text Info */}
          <div className="min-w-0 flex-grow">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-slate-200 truncate max-w-[280px]" title={job.title || 'Untitled Pin'}>
                {job.title || <span className="italic text-slate-500">Untitled Pin</span>}
              </h4>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColors[job.status]}`}>
                {statusLabels[job.status]}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 mt-2 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md overflow-hidden flex items-center justify-center bg-slate-900 border border-slate-800 text-[10px] font-bold text-slate-350 flex-shrink-0">
                  {account?.avatarUrl ? (
                    <img src={account.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (account?.nickname || 'U').charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <span className="text-slate-550 block text-[9px] uppercase font-semibold leading-none">Account:</span>
                  <span className="text-slate-350 font-medium truncate block max-w-[120px] mt-0.5 leading-tight" title={account?.nickname ? `${account.nickname}${account.username ? ` (@${account.username})` : ''}` : 'Unknown Account'}>
                    {account?.nickname || 'Unknown Account'}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-slate-550 mr-1 block text-[10px] uppercase font-semibold">Board:</span>
                <span className="text-slate-300 font-medium truncate block max-w-[120px]" title={job.boardName || 'Not Set'}>
                  {job.boardName || <span className="italic text-slate-550">Not Set</span>}
                </span>
              </div>
              {job.livePinUrl ? (
                <div>
                  <span className="text-emerald-500 mr-1 block text-[10px] uppercase font-bold">Live Pin:</span>
                  <div className="flex items-center gap-2">
                    <a
                      href={job.livePinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-400 font-bold hover:underline flex items-center gap-1 max-w-[100px] truncate"
                      title={job.livePinUrl}
                    >
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      <span>View Pin</span>
                    </a>
                    <button
                      onClick={handleCopyLink}
                      className="text-[9px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-black transition-colors flex-shrink-0"
                    >
                      {copied ? 'Copied! ✅' : 'Copy'}
                    </button>
                  </div>
                </div>
              ) : job.destinationUrl ? (
                <div>
                  <span className="text-slate-550 mr-1 block text-[10px] uppercase font-semibold">Link:</span>
                  <span className="text-slate-300 font-medium truncate flex items-center gap-1 max-w-[150px]" title={job.destinationUrl}>
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{getDomain(job.destinationUrl)}</span>
                  </span>
                </div>
              ) : null}
              <div>
                <span className="text-slate-550 mr-1 block text-[10px] uppercase font-semibold">Queue ID:</span>
                <span className="text-slate-550 font-mono text-[10px] block">
                  #{job.id.substring(0, 8)}
                </span>
              </div>
            </div>

            {job.status === 'scheduled' && (
              <div className="mt-3 p-3 bg-purple-950/20 border border-purple-900/30 rounded-lg flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-purple-400">
                    {job.scheduledDate && job.scheduledTime ? getCountdownText(job.scheduledDate, job.scheduledTime) : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Date</label>
                  <input
                    type="date"
                    value={localDate}
                    onChange={handleDateChange}
                    className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-slate-700"
                  />
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Time</label>
                  <input
                    type="time"
                    value={localTime}
                    onChange={handleTimeChange}
                    className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-slate-700"
                  />
                </div>
              </div>
            )}

            {job.errorMessage && (
              <div className="mt-2 text-xs text-rose-400 bg-rose-955/20 border border-rose-900/30 rounded-lg p-2 max-w-full">
                <span className="font-semibold mr-1">Error:</span> {job.errorMessage}
                {job.screenshotPath && (
                  <div className="mt-1 text-[10px] text-rose-500 italic">
                    Screenshot saved. Click log folder in logs screen to view.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Row Actions */}
        <div className="flex items-center gap-2 border-t border-slate-850 pt-3 md:border-t-0 md:pt-0 justify-end">
          <Button
            size="sm"
            variant="ghost"
            icon={<FileText className="w-3.5 h-3.5" />}
            onClick={() => setExpanded(!expanded)}
            title="Toggle Details & Metadata"
            className={`text-slate-400 hover:text-slate-200 ${expanded ? 'bg-slate-800 text-slate-200' : ''}`}
          >
            {expanded ? 'Hide Logs' : 'View Logs'}
          </Button>

          {job.status === 'scheduled' && onUnschedule && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onUnschedule(job.id)}
              title="Unschedule job"
              className="bg-amber-600 hover:bg-amber-500 text-white font-bold"
            >
              Unschedule
            </Button>
          )}

          {job.status === 'failed' && onRetry && (
            <Button
              size="sm"
              variant="secondary"
              icon={<RotateCcw className="w-3.5 h-3.5" />}
              onClick={() => onRetry(job)}
              title="Retry Publishing"
            >
              Retry
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 className="w-3.5 h-3.5" />}
            onClick={() => onDelete(job.id)}
            disabled={job.status === 'running'}
            title="Delete from Queue"
            className="text-slate-500 hover:text-rose-400 hover:bg-rose-950/20"
          />
        </div>
      </div>

      {/* Expanded Metadata Log Details */}
      {expanded && (
        <div className="mt-2 border-t border-slate-800 pt-3 flex flex-col gap-2.5 text-xs text-slate-400 bg-slate-950/20 p-3 rounded-lg border border-slate-850/40">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <span className="font-bold text-slate-500 block text-[9px] uppercase tracking-wide mb-1">Full Title</span>
              <p className="bg-slate-950 border border-slate-850 p-2 rounded-lg text-slate-200 font-mono text-[11px] leading-relaxed">
                {job.title || <span className="italic text-slate-600">None</span>}
              </p>
            </div>
            <div>
              <span className="font-bold text-slate-500 block text-[9px] uppercase tracking-wide mb-1">Destination URL</span>
              <p className="bg-slate-950 border border-slate-850 p-2 rounded-lg text-blue-400 font-mono text-[11px] select-all truncate">
                {job.destinationUrl || <span className="italic text-slate-650 font-normal">None</span>}
              </p>
            </div>
          </div>
          <div>
            <span className="font-bold text-slate-500 block text-[9px] uppercase tracking-wide mb-1">Full Description</span>
            <p className="bg-slate-950 border border-slate-850 p-2.5 rounded-lg text-slate-200 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
              {job.description || <span className="italic text-slate-650 font-normal">None</span>}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <span className="font-bold text-slate-500 block text-[9px] uppercase tracking-wide mb-1">Local Media Path</span>
              <p className="bg-slate-950 border border-slate-850 p-2 rounded-lg text-slate-400 font-mono text-[10px] select-all truncate">
                {job.imagePath}
              </p>
            </div>
            <div>
              <span className="font-bold text-slate-500 block text-[9px] uppercase tracking-wide mb-1">Alt Text</span>
              <p className="bg-slate-950 border border-slate-850 p-2 rounded-lg text-slate-300 text-[11px] leading-relaxed">
                {job.altText || <span className="italic text-slate-650 font-normal">None</span>}
              </p>
            </div>
          </div>
          {job.notes && (
            <div>
              <span className="font-bold text-slate-500 block text-[9px] uppercase tracking-wide mb-1">Campaign/Notes</span>
              <p className="bg-slate-950 border border-slate-850 p-2 rounded-lg text-slate-450 text-[11px]">
                {job.notes}
              </p>
            </div>
          )}
          {job.errorMessage && (
            <div className="bg-rose-955/10 border border-rose-900/30 rounded-lg p-2.5 mt-1">
              <span className="font-bold text-rose-500 block text-[9px] uppercase tracking-wide mb-1">Trace Error Log</span>
              <p className="text-rose-450 font-mono text-[10px] leading-relaxed break-words whitespace-pre-wrap">
                {job.errorMessage}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
