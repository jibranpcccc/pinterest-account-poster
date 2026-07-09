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
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [selectedBoardNames, setSelectedBoardNames] = useState<string[]>([]);
  const [manualBoards, setManualBoards] = useState<string>('');
  const [keywords, setKeywords] = useState<string>('');
  const [useAIKeywords, setUseAIKeywords] = useState<boolean>(false);
  const [count, setCount] = useState<number>(5);

  const [autoPilotEnabled, setAutoPilotEnabled] = useState(false);
  const [fleetLogs, setFleetLogs] = useState<string[]>([]);

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
    // Listen to Fleet Engine updates
    if (window.electron) {
      window.electron.getFleetStatus().then(setAutoPilotEnabled);
      const unsubUpdate = window.electron.onFleetJobUpdate(() => fetchJobs());
      const unsubLog = window.electron.onFleetLog((msg) => {
        setFleetLogs(prev => [msg, ...prev].slice(0, 5));
      });
      return () => {
        unsubUpdate();
        unsubLog();
      };
    }
  }, []);

  useEffect(() => {
    if (selectedAccountIds.length > 0) {
      // Just fetch boards for the first selected account for now to pick from
      api.getBoards(selectedAccountIds[0]).then(setBoards).catch(console.error);
    } else {
      setBoards([]);
    }
  }, [selectedAccountIds]);

  const handleToggleAutoPilot = async () => {
    const newState = !autoPilotEnabled;
    setAutoPilotEnabled(newState);
    if (window.electron) {
      await window.electron.toggleFleet(newState);
      onShowToast(newState ? 'Auto-Pilot Engine Enabled! It will now process jobs automatically.' : 'Auto-Pilot Engine Disabled.', 'success');
    }
  };

  const handleCreateJob = async () => {
    // Parse manual boards
    const manualBoardList = manualBoards.split(/[\n,]+/).map(b => b.trim()).filter(b => b.length > 0);
    const allBoards = Array.from(new Set([...selectedBoardNames, ...manualBoardList]));
    
    // Parse keywords
    const keywordList = keywords.split(/[\n,]+/).map(k => k.trim()).filter(k => k.length > 0);

    if (selectedAccountIds.length === 0 || allBoards.length === 0 || (!useAIKeywords && keywordList.length === 0) || count < 1) {
      onShowToast('Please select at least one account, one board, and provide keywords', 'warn');
      return;
    }

    try {
      let created = 0;
      for (const accountId of selectedAccountIds) {
        for (const boardName of allBoards) {
          
          if (useAIKeywords) {
            const id = `repin_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            await api.saveRepinJob({
              id,
              accountId: accountId,
              boardName: boardName,
              keywords: `[AI_AUTO_GENERATE] ${boardName}`,
              count,
              status: 'pending'
            });
            created++;
          } else {
            for (const kw of keywordList) {
              const id = `repin_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
              await api.saveRepinJob({
                id,
                accountId: accountId,
                boardName: boardName,
                keywords: kw,
                count,
                status: 'pending'
              });
              created++;
            }
          }
        }
      }
      onShowToast(`Created ${created} Auto-Repin jobs across ${selectedAccountIds.length} accounts!`, 'success');
      setSelectedBoardNames([]);
      setManualBoards('');
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
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase font-black text-slate-400">Target Accounts</label>
                  <button 
                    className="text-[10px] text-blue-400 hover:text-blue-300"
                    onClick={() => setSelectedAccountIds(selectedAccountIds.length === accounts.length ? [] : accounts.map(a => a.id))}
                  >
                    Select All
                  </button>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl max-h-32 overflow-y-auto p-2 flex flex-col gap-1">
                  {accounts.map(a => (
                    <label key={a.id} className="flex items-center gap-2 text-sm text-slate-300 hover:bg-slate-900 p-2 rounded cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="accent-pinterest-red w-4 h-4"
                        checked={selectedAccountIds.includes(a.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedAccountIds(prev => [...prev, a.id]);
                          else setSelectedAccountIds(prev => prev.filter(id => id !== a.id));
                        }}
                      />
                      <span className="truncate">{a.nickname}</span>
                    </label>
                  ))}
                </div>
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
                <textarea 
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 outline-none text-xs mt-2 placeholder-slate-600"
                  placeholder="Or enter manual boards (comma separated)"
                  rows={2}
                  value={manualBoards}
                  onChange={e => setManualBoards(e.target.value)}
                />
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
                  <textarea 
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 outline-none text-xs placeholder-slate-600"
                    placeholder="e.g. interior design, home decor, modern furniture (comma or newline separated)"
                    value={keywords}
                    rows={4}
                    onChange={e => setKeywords(e.target.value)}
                  />
                ) : (
                  <div className="bg-emerald-950 border border-emerald-800/50 rounded-xl px-3 py-2 text-emerald-400 text-xs flex items-center gap-2">
                    <Wand2 className="w-4 h-4" /> AI will auto-generate optimal keywords based on the target board name.
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
        <div className="lg:col-span-8 flex flex-col gap-6">
          <Card title="Auto-Pilot Fleet Engine" className="border-slate-800 bg-gradient-to-r from-slate-900 to-slate-950">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-lg flex items-center gap-2">
                  <Repeat className="w-5 h-5 text-blue-400" />
                  Fleet Auto-Pilot
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">When enabled, the system will automatically process all pending jobs invisibly in the background, pausing between jobs to protect your accounts from rate limits.</p>
              </div>
              <button
                onClick={handleToggleAutoPilot}
                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-300 focus:outline-none ${autoPilotEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}
              >
                <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-300 ${autoPilotEnabled ? 'translate-x-7' : 'translate-x-1'}`} />
              </button>
            </div>
            {autoPilotEnabled && fleetLogs.length > 0 && (
              <div className="mt-4 bg-slate-950 rounded-lg p-3 border border-slate-800">
                <p className="text-[10px] uppercase font-bold text-slate-500 mb-2">Engine Logs</p>
                {fleetLogs.map((log, i) => (
                  <div key={i} className={`text-xs ${i === 0 ? 'text-emerald-400' : 'text-slate-500'} truncate`}>{log}</div>
                ))}
              </div>
            )}
          </Card>

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
                      
                      {job.liveLinks && job.liveLinks.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {job.liveLinks.map((link: string, i: number) => (
                            <a 
                              key={i} 
                              href={link} 
                              target="_blank" 
                              rel="noreferrer"
                              className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded hover:bg-emerald-500/20"
                            >
                              View Pin {i + 1} ↗
                            </a>
                          ))}
                        </div>
                      )}
                      
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
