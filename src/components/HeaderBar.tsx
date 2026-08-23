import React from 'react';
import { 
  Sparkles, 
  RefreshCw, 
  ShieldCheck, 
  AlertTriangle, 
  Plus, 
  Zap, 
  Users, 
  Layers, 
  CheckCircle2,
  Calendar,
  Activity,
  FolderOpen
} from 'lucide-react';
import { Button } from './Button';

interface HeaderBarProps {
  activeScreen: string;
  isMockMode: boolean;
  onToggleMockMode: () => void;
  connectedCount: number;
  totalAccountsCount: number;
  activeQueueCount: number;
  isProcessingQueue: boolean;
  onNavigate: (screen: string) => void;
  onRefresh: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  activeScreen,
  isMockMode,
  onToggleMockMode,
  connectedCount,
  totalAccountsCount,
  activeQueueCount,
  isProcessingQueue,
  onNavigate,
  onRefresh
}) => {
  const getScreenDetails = () => {
    switch (activeScreen) {
      case 'dashboard':
        return { title: 'Dashboard', desc: 'Real-time overview & performance metrics', icon: Activity };
      case 'create-pin':
        return { title: 'Create Pin Studio', desc: 'AI-assisted Pin Composer & Bulk Importer', icon: Sparkles };
      case 'queue':
        return { title: 'Publishing Queue & Pipeline', desc: 'Live multi-account scheduler and queue matrix', icon: Layers };
      case 'accounts':
        return { title: 'Pinterest Accounts', desc: 'Browser session vault & account manager', icon: Users };
      case 'boards':
        return { title: 'Boards & Topics', desc: 'Target boards sync & topic taxonomy', icon: FolderOpen };
      case 'analytics':
        return { title: 'Growth Analytics', desc: 'Historical follower & impressions insights', icon: Activity };
      case 'drafts':
        return { title: 'Drafts Studio', desc: 'Stored pin drafts & reusable templates', icon: Layers };
      case 'settings':
        return { title: 'App Settings', desc: 'Pacing, AI models, and system preferences', icon: ShieldCheck };
      case 'logs':
        return { title: 'Event Logs', desc: 'Live diagnostics and execution console', icon: Activity };
      default:
        return { title: 'Pinterest Account Poster', desc: 'Automated publishing engine', icon: Sparkles };
    }
  };

  const { title, desc, icon: ScreenIcon } = getScreenDetails();

  return (
    <header className="h-16 px-6 bg-slate-950/80 backdrop-blur-xl border-b border-slate-850 flex items-center justify-between gap-4 z-20 shrink-0 select-none">
      {/* Left: Screen Title & Breadcrumb */}
      <div className="flex items-center space-x-3 min-w-0">
        <div className="p-2 rounded-xl bg-gradient-to-br from-red-500/15 to-violet-500/15 border border-red-500/20 text-red-400 shrink-0">
          <ScreenIcon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-slate-100 truncate flex items-center gap-2">
            <span>{title}</span>
            {isProcessingQueue && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                Publishing Live
              </span>
            )}
          </h1>
          <p className="text-[11px] text-slate-400 truncate hidden sm:block">{desc}</p>
        </div>
      </div>

      {/* Right: Mode Badge, System Health, Refresh & Quick Actions */}
      <div className="flex items-center space-x-3 shrink-0">
        {/* Mode Switcher Badge */}
        <button
          onClick={onToggleMockMode}
          title="Click to toggle between Production Live Automation and Sandbox Mock Mode"
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black transition-all cursor-pointer border ${
            isMockMode
              ? 'bg-amber-950/60 border-amber-600/50 text-amber-300 hover:bg-amber-900/60 shadow-lg shadow-amber-950/30'
              : 'bg-emerald-950/60 border-emerald-600/50 text-emerald-300 hover:bg-emerald-900/60 shadow-lg shadow-emerald-950/30'
          }`}
        >
          {isMockMode ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span>SANDBOX MOCK</span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>PRODUCTION LIVE</span>
            </>
          )}
        </button>

        {/* Connected Accounts Status */}
        <div 
          onClick={() => onNavigate('accounts')}
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300 text-xs font-semibold hover:border-slate-700 cursor-pointer transition-all"
          title={`${connectedCount} of ${totalAccountsCount} accounts connected`}
        >
          <span className={`w-2 h-2 rounded-full ${connectedCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}></span>
          <span>{connectedCount}/{totalAccountsCount} Accounts</span>
        </div>

        {/* Active Queue Counter */}
        {activeQueueCount > 0 && (
          <div 
            onClick={() => onNavigate('queue')}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-950/40 border border-purple-800/40 text-purple-300 text-xs font-bold hover:border-purple-600 cursor-pointer transition-all"
            title={`${activeQueueCount} active jobs in queue`}
          >
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            <span>{activeQueueCount} Queued</span>
          </div>
        )}

        {/* Refresh All */}
        <button
          onClick={onRefresh}
          title="Refresh All App State & Telemetry"
          className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        {/* Create Pin Quick Button */}
        {activeScreen !== 'create-pin' && (
          <button
            onClick={() => onNavigate('create-pin')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 text-white shadow-lg shadow-red-950/40 border border-red-400/30 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Create Pin</span>
          </button>
        )}
      </div>
    </header>
  );
};
