import React from 'react';
import { QueueJob, Account } from '../types';
import { Play, Trash2, RotateCcw, Image, ExternalLink, HelpCircle, FileText } from 'lucide-react';
import { Button } from './Button';

interface QueueItemRowProps {
  job: QueueJob;
  accounts: Account[];
  onDelete: (id: string) => void;
  onRetry?: (job: QueueJob) => void;
}

export const QueueItemRow: React.FC<QueueItemRowProps> = ({
  job,
  accounts,
  onDelete,
  onRetry
}) => {
  const account = accounts.find((a) => a.id === job.accountId);
  const localImageSrc = job.imagePath ? `media:///${job.imagePath.replace(/\\/g, '/')}` : '';
  const [expanded, setExpanded] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

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
        await window.electronAPI.writeToClipboard(job.livePinUrl);
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
    paused: 'bg-slate-800 border-slate-700 text-slate-350'
  };

  const statusLabels = {
    pending: 'Pending',
    running: 'Running',
    completed: 'Published',
    failed: 'Failed',
    paused: 'Paused'
  };

  return (
    <div className="flex flex-col gap-3 p-4 bg-slate-900/40 border border-slate-880/80 rounded-xl hover:bg-slate-900/85 transition-colors">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0 flex-grow">
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
