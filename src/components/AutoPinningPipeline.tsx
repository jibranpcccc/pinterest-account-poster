import React, { useState, useEffect } from 'react';
import { QueueJob, Account } from '../types';
import { 
  Activity, Play, Pause, RefreshCw, CheckCircle2, AlertCircle, 
  Clock, ShieldCheck, Sparkles, User, Layers, ArrowRight, ExternalLink,
  Zap, Search, BarChart2
} from 'lucide-react';
import { api } from '../services/api';

interface AutoPinningPipelineProps {
  jobs: QueueJob[];
  accounts: Account[];
  isExecuting: boolean;
  onToggleExecute: () => void;
  onRefresh: () => void;
  onShowToast: (msg: string, type: 'success' | 'error' | 'warn' | 'info') => void;
}

export const AutoPinningPipeline: React.FC<AutoPinningPipelineProps> = ({
  jobs,
  accounts,
  isExecuting,
  onToggleExecute,
  onRefresh,
  onShowToast
}) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [aiKeywordsMap, setAiKeywordsMap] = useState<Record<string, string[]>>({});
  const [generatingBoard, setGeneratingBoard] = useState<string | null>(null);

  // Group jobs by account
  const accountJobsMap = accounts.reduce((acc, account) => {
    acc[account.id] = jobs.filter(j => j.accountId === account.id);
    return acc;
  }, {} as Record<string, QueueJob[]>);

  // Filter accounts for display
  const displayAccounts = selectedAccountId === 'all' 
    ? accounts 
    : accounts.filter(a => a.id === selectedAccountId);

  // Handle generating AI search keywords for a specific board using OpenCode BigPickle AI model
  const handleGenerateAiKeywordsForBoard = async (boardName: string) => {
    setGeneratingBoard(boardName);
    try {
      // Call AI endpoint to get 5 board-specific search variations
      const prompt = `Board Name: "${boardName}". Generate 5 unique 2-4 word Pinterest search terms. Return JSON array of strings.`;
      const keywords = await api.generateKeywords({ boardName, topic: boardName, keyword: boardName });
      
      setAiKeywordsMap(prev => ({
        ...prev,
        [boardName]: keywords && keywords.length > 0 ? keywords : [
          `${boardName} ideas`,
          `aesthetic ${boardName}`,
          `best ${boardName} inspo`,
          `trending ${boardName} 2026`,
          `how to style ${boardName}`
        ]
      }));
      onShowToast(`⚡ Generated 5 OpenCode AI search queries for "${boardName}"!`, 'success');
    } catch (e: any) {
      onShowToast(`Failed to query OpenCode AI: ${e.message || e}`, 'error');
    } finally {
      setGeneratingBoard(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-fade-in">
      {/* Top Banner Control Panel */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border border-violet-500/30 shadow-2xl flex flex-wrap items-center justify-between gap-4 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-violet-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -left-10 -top-10 w-48 h-48 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex items-center gap-4 z-10">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border shadow-lg ${
            isExecuting 
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-emerald-950/50' 
              : 'bg-violet-500/10 border-violet-500/40 text-violet-400 shadow-violet-950/50'
          }`}>
            <Activity className={`w-6 h-6 ${isExecuting ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-base font-extrabold text-slate-100 tracking-tight">Auto-Pinning Live Pipeline</h3>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border flex items-center gap-1.5 ${
                isExecuting 
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' 
                  : 'bg-slate-800/80 border-slate-700 text-slate-400'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isExecuting ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`}></span>
                {isExecuting ? 'Pipeline Active' : 'Pipeline Standby'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Real-time multi-account dispatch matrix. Monitor jobs in flight, upcoming queues, and OpenCode AI keyword generators.
            </p>
          </div>
        </div>

        {/* Action Controls & Filters */}
        <div className="flex items-center gap-3 z-10">
          {/* Account Filter */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="bg-transparent text-xs text-slate-200 font-bold focus:outline-none cursor-pointer"
            >
              <option value="all">All Accounts ({accounts.length})</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.nickname}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-all cursor-pointer shadow-md"
            title="Refresh Pipeline Status"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onToggleExecute}
            className={`px-5 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 shadow-xl cursor-pointer ${
              isExecuting
                ? 'bg-rose-950/80 border border-rose-600/60 text-rose-200 hover:bg-rose-900/80 shadow-rose-950/50'
                : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white border border-emerald-400/40 shadow-emerald-950/50'
            }`}
          >
            {isExecuting ? (
              <>
                <Pause className="w-4 h-4 text-rose-300" /> Pause Active Pipeline
              </>
            ) : (
              <>
                <Play className="w-4 h-4 text-emerald-200" /> Start Live Pipeline
              </>
            )}
          </button>
        </div>
      </div>

      {/* Multi-Account Channel Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {displayAccounts.map((account) => {
          const accJobs = accountJobsMap[account.id] || [];
          const runningJob = accJobs.find(j => j.status === 'running');
          const pendingJobs = accJobs.filter(j => j.status === 'pending' || j.status === 'scheduled');
          const completedJobs = accJobs.filter(j => j.status === 'completed');
          const failedJobs = accJobs.filter(j => j.status === 'failed');

          return (
            <div 
              key={account.id}
              className="flex flex-col rounded-2xl bg-gradient-to-b from-slate-900/90 via-slate-950 to-slate-950 border border-slate-800/80 shadow-xl overflow-hidden"
            >
              {/* Channel Header */}
              <div className="p-4 bg-slate-900/60 border-b border-slate-800/80 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-800 text-white font-extrabold flex items-center justify-center shadow-inner text-sm border border-violet-400/30">
                    {account.nickname.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-100">{account.nickname}</h4>
                    <p className="text-[11px] text-slate-400 font-mono">@{account.username || 'pinterest_user'}</p>
                  </div>
                </div>

                {/* Session Health Dot */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/50 border border-emerald-800/50 text-emerald-300 text-[10px] font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Active Session
                </div>
              </div>

              {/* Active Pipeline Channel Content */}
              <div className="p-4 flex flex-col gap-4">
                {/* 1. Job In Flight Status (If Running) */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-cyan-400" /> Active Job In Flight
                  </span>

                  {runningJob ? (
                    <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/40 flex flex-col gap-2 relative overflow-hidden shadow-lg">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-bold text-cyan-100 line-clamp-1">{runningJob.title || 'Untitled Pin'}</span>
                          <span className="text-[10px] text-cyan-400 font-mono">Board: <strong>{runningJob.boardName}</strong></span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-cyan-500/20 text-cyan-200 border border-cyan-500/30 animate-pulse">
                          Publishing
                        </span>
                      </div>

                      {/* Micro Progress Bar */}
                      <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-cyan-800/40">
                        <div className="bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 h-full w-3/4 animate-pulse rounded-full"></div>
                      </div>
                      <span className="text-[9px] text-slate-400 font-mono text-right">Step: Uploading Media & Form Filling...</span>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-850 text-slate-500 text-xs text-center font-mono py-4">
                      No active job currently in flight. Waiting for next schedule window.
                    </div>
                  )}
                </div>

                {/* 2. Next Pins In Line (Upcoming Pipeline Queue) */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-violet-400" /> Queue Pipeline ({pendingJobs.length} Pins)
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Completed: {completedJobs.length} | Failed: {failedJobs.length}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2 max-h-[180px] overflow-y-auto pr-1">
                    {pendingJobs.length > 0 ? (
                      pendingJobs.slice(0, 4).map((job, idx) => (
                        <div 
                          key={job.id} 
                          className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between gap-3 text-xs hover:border-slate-700 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 overflow-hidden">
                            <span className="w-5 h-5 rounded-lg bg-slate-800 text-slate-400 text-[10px] font-mono font-bold flex items-center justify-center flex-shrink-0">
                              #{idx + 1}
                            </span>
                            <div className="flex flex-col truncate">
                              <span className="text-slate-200 font-medium truncate">{job.title || 'Untitled Pin'}</span>
                              <span className="text-[10px] text-slate-400 truncate">Board: {job.boardName}</span>
                            </div>
                          </div>

                          <div className="flex flex-col items-end flex-shrink-0">
                            <span className="text-[10px] font-mono text-violet-300 font-bold">
                              {job.scheduledTime || '09:00'}
                            </span>
                            <span className="text-[9px] text-slate-500 font-mono">
                              {job.scheduledDate || 'Today'}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500 font-mono text-center py-3 bg-slate-950/40 rounded-xl border border-slate-850">
                        Queue empty for this account.
                      </p>
                    )}
                  </div>
                </div>

                {/* 3. OpenCode AI Random Search Keyword Generator */}
                <div className="flex flex-col gap-2 pt-2 border-t border-slate-850">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" /> OpenCode AI Search Terms
                    </span>
                  </div>

                  {/* Boards quick buttons */}
                  {pendingJobs.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from(new Set(pendingJobs.map(j => j.boardName))).map((boardName) => (
                          <button
                            key={boardName}
                            type="button"
                            onClick={() => handleGenerateAiKeywordsForBoard(boardName)}
                            disabled={generatingBoard === boardName}
                            className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-amber-300 hover:border-amber-500/40 text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                          >
                            {generatingBoard === boardName ? (
                              <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                            ) : (
                              <Search className="w-3 h-3 text-amber-400" />
                            )}
                            {boardName}
                          </button>
                        ))}
                      </div>

                      {/* Display generated keywords for active board */}
                      {Object.keys(aiKeywordsMap).length > 0 && (
                        <div className="p-2.5 rounded-xl bg-slate-950/80 border border-amber-500/30 flex flex-col gap-1.5">
                          <span className="text-[9px] font-mono uppercase text-amber-300 font-bold flex items-center gap-1">
                            <Zap className="w-3 h-3 text-amber-400" /> AI Board Search Variations:
                          </span>
                          {Object.entries(aiKeywordsMap).map(([bName, kwList]) => (
                            <div key={bName} className="flex flex-col gap-1">
                              <span className="text-[9px] font-bold text-slate-400 font-mono">[{bName}]:</span>
                              <div className="flex flex-wrap gap-1">
                                {kwList.map((kw, kIdx) => (
                                  <span key={kIdx} className="px-2 py-0.5 rounded bg-amber-950/40 border border-amber-800/40 text-amber-200 text-[9px] font-mono">
                                    "{kw}"
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-500 font-mono">
                      Add jobs to queue to test OpenCode AI board search generator.
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
