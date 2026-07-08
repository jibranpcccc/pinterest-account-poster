import React, { useState, useEffect } from 'react';
import { Account, Board } from '../types';
import { api } from '../services/api';
import { 
  Repeat, Play, Trash2, PlusCircle, CheckCircle, XCircle, RefreshCw
} from 'lucide-react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';

interface AutoRepinProps {
  accounts: Account[];
  onShowToast: (msg: string, type: 'success' | 'error' | 'warn' | 'info') => void;
}

export const AutoRepin: React.FC<AutoRepinProps> = ({ accounts, onShowToast }) => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [boards, setBoards] = useState<Board[]>([]);

  // Form State
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedBoardNames, setSelectedBoardNames] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string>('');
  const [useAIKeywords, setUseAIKeywords] = useState<boolean>(false);
  const [count, setCount] = useState<number>(5);

  const fetchJobs = async () => {
    try {
      const data = await api.getRepinJobs();
      setJobs(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    if (selectedAccountId) {
      api.getBoards(selectedAccountId).then(setBoards).catch(console.error);
    } else {
      setBoards([]);
    }
  }, [selectedAccountId]);

  const handleCreateJob = async () => {
    if (!selectedAccountId || selectedBoardNames.length === 0 || (!keywords && !useAIKeywords) || count < 1) {
      onShowToast('Please select at least one board, and provide keywords (or enable AI)', 'warn');
      return;
    }

    try {
      for (const boardName of selectedBoardNames) {
        const id = `repin_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        // If AI is used, we set a special marker in keywords to be processed by the backend
        const finalKeywords = useAIKeywords ? `[AI_AUTO_GENERATE] ${boardName}` : keywords;
        
        await api.saveRepinJob({
          id,
          accountId: selectedAccountId,
          boardName: boardName,
          keywords: finalKeywords,
          count,
          status: 'pending'
        });
      }
      onShowToast(`Created ${selectedBoardNames.length} Auto-Repin jobs!`, 'success');
      setSelectedBoardNames([]);
      setKeywords('');
      setCount(5);
      fetchJobs();
    } catch (e: any) {
      onShowToast(`Failed to create job: ${e.message}`, 'error');
    }
  };

  const handleStartJob = async (id: string) => {
    try {
      onShowToast('Starting repin job. Playwright browser will open soon.', 'info');
      
      // Update UI immediately
      setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'running' } : j));
      
      api.startRepinJob(id).then(() => {
        fetchJobs();
      }).catch(e => {
        onShowToast(`Repin job failed: ${e.message}`, 'error');
        fetchJobs();
      });
    } catch (e: any) {
      onShowToast(`Failed to start job: ${e.message}`, 'error');
    }
  };

  const handleDeleteJob = async (id: string) => {
    try {
      await api.deleteRepinJob(id);
      fetchJobs();
      onShowToast('Job deleted', 'success');
    } catch (e: any) {
      onShowToast(`Failed to delete job: ${e.message}`, 'error');
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">AUTO REPIN</h1>
          <p className="text-sm text-slate-400">Automatically find and save relevant pins to warm up your boards</p>
        </div>
        <Button variant="secondary" icon={<RefreshCw className="w-4 h-4" />} onClick={fetchJobs}>Refresh</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Create Job */}
        <div className="lg:col-span-4">
          <Card title="New Repin Task" subtitle="Setup search keywords">
            <div className="flex flex-col gap-4 text-sm mt-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-black text-slate-400">Account</label>
                <select 
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 outline-none"
                  value={selectedAccountId}
                  onChange={e => setSelectedAccountId(e.target.value)}
                >
                  <option value="">-- Select Account --</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.nickname}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase font-black text-slate-400">Target Boards</label>
                  <button 
                    className="text-[10px] text-blue-400 hover:text-blue-300"
                    onClick={() => {
                      if (selectedBoardNames.length === boards.length && boards.length > 0) {
                        setSelectedBoardNames([]);
                      } else {
                        setSelectedBoardNames(boards.map(b => b.name));
                      }
                    }}
                  >
                    Select All
                  </button>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl max-h-48 overflow-y-auto p-2 flex flex-col gap-1">
                  {boards.length === 0 && <div className="text-xs text-slate-500 p-2">No boards found or select an account first.</div>}
                  {boards.map(b => (
                    <label key={b.id} className="flex items-center gap-2 text-sm text-slate-300 hover:bg-slate-900 p-2 rounded cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="accent-pinterest-red w-4 h-4"
                        checked={selectedBoardNames.includes(b.name)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedBoardNames(prev => [...prev, b.name]);
                          } else {
                            setSelectedBoardNames(prev => prev.filter(n => n !== b.name));
                          }
                        }}
                      />
                      <span className="truncate">{b.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase font-black text-slate-400">Search Keywords</label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="accent-blue-500"
                      checked={useAIKeywords}
                      onChange={e => setUseAIKeywords(e.target.checked)}
                    />
                    <span className="text-[10px] uppercase font-black text-blue-400">Use AI (Auto-Generate)</span>
                  </label>
                </div>
                {!useAIKeywords ? (
                  <input 
                    type="text" 
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 outline-none placeholder-slate-700"
                    placeholder="e.g. Modern Home Decor"
                    value={keywords}
                    onChange={e => setKeywords(e.target.value)}
                  />
                ) : (
                  <div className="bg-blue-900/20 border border-blue-900/50 rounded-xl px-3 py-2 text-blue-400 text-xs">
                    AI will automatically analyze your selected board names and generate highly optimized Pinterest search queries.
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-black text-slate-400">Number of Pins to Save</label>
                <input 
                  type="number" 
                  min="1" 
                  max="20"
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 outline-none"
                  value={count}
                  onChange={e => setCount(parseInt(e.target.value))}
                />
              </div>

              <Button 
                variant="primary" 
                icon={<PlusCircle className="w-4 h-4" />} 
                onClick={handleCreateJob}
                className="mt-2"
              >
                Create Repin Job
              </Button>
            </div>
          </Card>
        </div>

        {/* Right Column: Job List */}
        <div className="lg:col-span-8">
          <Card title="Repin Queue" subtitle="Manage and track automation tasks">
            <div className="flex flex-col gap-3">
              {jobs.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500 bg-slate-900/30 rounded-xl border border-slate-800/50">
                  <Repeat className="w-8 h-8 mb-2 opacity-50" />
                  <span className="text-sm">No repin jobs found. Create one to get started.</span>
                </div>
              )}

              {jobs.map(job => {
                const account = accounts.find(a => a.id === job.accountId);
                return (
                  <div key={job.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between group">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-200">{job.keywords}</span>
                        <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">{job.count} pins</span>
                      </div>
                      <span className="text-xs text-slate-500">
                        {account?.nickname || 'Unknown'} → {job.boardName}
                      </span>
                      
                      {job.errorMessage && (
                        <span className="text-[10px] text-red-400 mt-1">{job.errorMessage}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Status */}
                      {job.status === 'pending' && <span className="text-xs text-amber-500 font-bold uppercase">Pending</span>}
                      {job.status === 'running' && <span className="text-xs text-blue-400 font-bold uppercase flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin"/> Running</span>}
                      {job.status === 'completed' && <span className="text-xs text-green-500 font-bold uppercase flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Completed</span>}
                      {job.status === 'failed' && <span className="text-xs text-red-500 font-bold uppercase flex items-center gap-1"><XCircle className="w-3 h-3"/> Failed</span>}

                      {/* Actions */}
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {job.status !== 'running' && (
                          <button 
                            onClick={() => handleStartJob(job.id)}
                            className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20"
                            title="Run Now"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        <button 
                          onClick={() => handleDeleteJob(job.id)}
                          className="p-1.5 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20"
                          title="Delete Job"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
