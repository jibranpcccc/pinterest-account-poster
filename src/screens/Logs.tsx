import React, { useState, useEffect } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Log, LogFilters } from '../types';
import { 
  FileText, Search, Trash2, Copy, FolderOpen, 
  Terminal, AlertTriangle, AlertCircle, Info, RefreshCw 
} from 'lucide-react';
import { api } from '../services/api';

interface LogsProps {
  logs: Log[];
  onRefreshLogs: () => Promise<void>;
  onShowToast: (msg: string, type: 'success' | 'error' | 'warn' | 'info') => void;
}

export const Logs: React.FC<LogsProps> = ({
  logs,
  onRefreshLogs,
  onShowToast
}) => {
  const [levelFilter, setLevelFilter] = useState<'' | 'info' | 'warn' | 'error'>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [localLogs, setLocalLogs] = useState<Log[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchLogsFiltered = async () => {
    setIsLoading(true);
    try {
      const filters: LogFilters = {};
      if (levelFilter) filters.level = levelFilter;
      if (searchQuery.trim()) filters.search = searchQuery.trim();
      
      const data = await api.getLogs(filters);
      setLocalLogs(data);
    } catch (e) {
      console.error('Failed to fetch filtered logs:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogsFiltered();
  }, [levelFilter, searchQuery, logs]); // Sync with parent logs refresh

  const handleCopyLogs = () => {
    if (localLogs.length === 0) {
      onShowToast('No logs to copy.', 'warn');
      return;
    }

    try {
      const text = localLogs
        .map((l) => `[${new Date(l.createdAt).toLocaleString()}] [${l.level.toUpperCase()}] ${l.message} ${l.context ? `| Context: ${l.context}` : ''}`)
        .join('\n');
      
      navigator.clipboard.writeText(text);
      onShowToast('Logs copied to clipboard!', 'success');
    } catch (e: any) {
      onShowToast(`Copy failed: ${e.message}`, 'error');
    }
  };

  const handleExportCSV = () => {
    if (localLogs.length === 0) {
      onShowToast('No logs to export.', 'warn');
      return;
    }
    try {
      const header = ['Timestamp', 'Level', 'Message', 'Context'];
      const rows = localLogs.map((l) => [
        new Date(l.createdAt).toLocaleString(),
        l.level.toUpperCase(),
        `"${(l.message || '').replace(/"/g, '""')}"`,
        `"${(l.context || '').replace(/"/g, '""')}"`
      ]);
      const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pinterest-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      onShowToast(`Exported ${localLogs.length} log entries to CSV!`, 'success');
    } catch (e: any) {
      onShowToast(`Export failed: ${e.message}`, 'error');
    }
  };

  const handleOpenFolder = async () => {
    try {
      await api.openLogFolder();
    } catch (e: any) {
      onShowToast(`Failed to open log folder: ${e.message}`, 'error');
    }
  };

  const handleClearLogs = async () => {
    if (confirm('Clear all log records from database? (Log files on disk will remain).')) {
      try {
        await api.clearLogs();
        onShowToast('Logs database cleared.', 'success');
        await onRefreshLogs();
      } catch (e: any) {
        onShowToast(`Clear failed: ${e.message}`, 'error');
      }
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">SYSTEM LOGS</h1>
          <p className="text-sm text-slate-400">View diagnostic events, error reports, and automation milestones.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<FolderOpen className="w-4 h-4" />}
            onClick={handleOpenFolder}
          >
            Open Data Folder
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="w-4 h-4" />}
            onClick={handleClearLogs}
            title="Clear Logs Database"
          />
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-col md:flex-row gap-4 bg-slate-950/20 p-4 border border-slate-800 rounded-2xl items-end md:items-center">
        <div className="flex flex-col gap-1.5 w-full md:w-1/4">
          <label className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Level Filter</label>
          <select
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-slate-650"
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value as any)}
          >
            <option value="">All Levels</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5 w-full md:flex-grow">
          <label className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Search Messages</label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-600 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search keyword in logs..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-slate-650"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 w-full md:w-auto">
          <Button
            variant="secondary"
            icon={<Copy className="w-4 h-4" />}
            onClick={handleCopyLogs}
            className="py-2.5 flex-grow md:flex-grow-0"
          >
            Copy Logs
          </Button>
          <Button
            variant="secondary"
            icon={<FileText className="w-4 h-4" />}
            onClick={handleExportCSV}
            className="py-2.5 flex-grow md:flex-grow-0"
            title="Export filtered logs as CSV file"
          >
            Export CSV
          </Button>
          <Button
            variant="ghost"
            icon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
            onClick={fetchLogsFiltered}
            title="Refresh logs view"
            className="py-2.5"
          />
        </div>
      </div>

      {/* Logs View Console */}
      <Card title="Diagnostic Console" subtitle={`Displaying ${localLogs.length} events matching current filters`}>
        <div className="bg-slate-950/80 border border-slate-850 rounded-2xl p-4 font-mono text-xs flex flex-col gap-2 max-h-[500px] overflow-y-auto shadow-inner">
          {localLogs.length === 0 ? (
            <div className="text-center py-12 text-slate-600">No log entries match your search criteria.</div>
          ) : (
            localLogs.map((log) => {
              const icons = {
                info: <Info className="w-3.5 h-3.5 text-slate-400" />,
                warn: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
                error: <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
              };

              const classes = {
                info: 'text-slate-400',
                warn: 'text-amber-300 bg-amber-950/15 p-1 rounded-lg border border-amber-950/30',
                error: 'text-rose-350 bg-rose-950/15 p-1.5 rounded-lg border border-rose-950/30'
              };

              return (
                <div key={log.id} className={`flex flex-col gap-1 py-1.5 border-b border-slate-900/50 ${classes[log.level]}`}>
                  <div className="flex gap-2 items-center flex-wrap">
                    <span className="text-slate-600 select-none">
                      [{new Date(log.createdAt).toLocaleString()}]
                    </span>
                    <span className="flex items-center gap-1">
                      {icons[log.level]}
                      <span className="uppercase text-[9px] font-black tracking-wider">{log.level}</span>
                    </span>
                    <span className="font-semibold leading-relaxed break-words">{log.message}</span>
                  </div>
                  {log.context && (
                    <div className="mt-1 pl-6 text-[10px] text-slate-500 font-sans max-w-full overflow-x-auto break-all">
                      Context: {log.context}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
};
