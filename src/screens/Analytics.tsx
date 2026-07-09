import React, { useState, useEffect } from 'react';
import { Account } from '../types';
import { api } from '../services/api';
import { 
  BarChart2, RefreshCw, Users, Eye, Activity, Target
} from 'lucide-react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';

interface AnalyticsProps {
  accounts: Account[];
  onShowToast: (msg: string, type: 'success' | 'error' | 'warn' | 'info') => void;
}

export const Analytics: React.FC<AnalyticsProps> = ({ accounts, onShowToast }) => {
  const [stats, setStats] = useState<Record<string, any>>({});
  const [loadingAccounts, setLoadingAccounts] = useState<Record<string, boolean>>({});

  const handleRefreshStats = async (accountId: string) => {
    setLoadingAccounts(prev => ({ ...prev, [accountId]: true }));
    try {
      onShowToast(`Scraping analytics for account...`, 'info');
      const data = await api.fetchAnalytics(accountId);
      setStats(prev => ({ ...prev, [accountId]: data }));
      onShowToast(`Analytics updated!`, 'success');
    } catch (err: any) {
      onShowToast(`Failed to fetch analytics: ${err.message}`, 'error');
    } finally {
      setLoadingAccounts(prev => ({ ...prev, [accountId]: false }));
    }
  };

  return (
    <div className="flex flex-col gap-8 animate-fade-in pb-12">
      {/* Header with gradient text */}
      <div className="flex items-center justify-between">
        <div className="relative">
          <div className="absolute -inset-1 bg-gradient-to-r from-pinterest-red to-purple-600 rounded-lg blur opacity-25"></div>
          <div className="relative bg-slate-950/50 backdrop-blur-sm p-4 rounded-xl border border-slate-800/50">
            <h1 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400 tracking-tight">
              PERFORMANCE ANALYTICS
            </h1>
            <p className="text-sm text-slate-400 mt-1 font-medium tracking-wide">
              Track followers, monthly views, and deeper engagement metrics
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {accounts.map(account => {
          const accStats = stats[account.id];
          const isLoading = loadingAccounts[account.id];

          return (
            <div 
              key={account.id} 
              className="relative group rounded-3xl overflow-hidden transition-all duration-500 hover:shadow-[0_0_40px_rgba(239,68,68,0.15)] bg-slate-950 border border-slate-800/60"
            >
              {/* Subtle top gradient line */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-pinterest-red via-rose-500 to-orange-500 opacity-80"></div>
              
              <div className="p-6 relative z-10">
                {/* Card Header */}
                <div className="flex justify-between items-start mb-8">
                  <div className="flex flex-col">
                    <h2 className="text-xl font-bold text-slate-100 tracking-tight drop-shadow-sm">{account.nickname}</h2>
                    <span className="text-sm font-medium text-slate-500 bg-slate-900/50 px-3 py-1 rounded-full mt-2 w-max border border-slate-800/50">
                      {account.email || 'No email provided'}
                    </span>
                  </div>
                  <Button 
                    size="sm" 
                    variant="primary" 
                    icon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
                    onClick={() => handleRefreshStats(account.id)}
                    loading={isLoading}
                    className="shadow-[0_0_15px_rgba(239,68,68,0.3)] hover:shadow-[0_0_25px_rgba(239,68,68,0.5)] transition-all"
                  >
                    {isLoading ? 'Scraping...' : 'Sync Data'}
                  </Button>
                </div>

                {!accStats ? (
                  <div className="flex flex-col items-center justify-center py-12 px-6 bg-slate-900/30 rounded-2xl border border-dashed border-slate-800/80 text-slate-500 transition-all hover:bg-slate-900/50 hover:border-slate-700">
                    <div className="relative mb-4">
                      <div className="absolute inset-0 bg-pinterest-red rounded-full blur-xl opacity-20 animate-pulse"></div>
                      <BarChart2 className="w-12 h-12 relative z-10 text-slate-400" />
                    </div>
                    <span className="text-sm font-medium tracking-wide">Sync this account to reveal analytics.</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {/* Stat Block 1 */}
                    <div className="group/stat relative bg-gradient-to-br from-slate-900 to-slate-950 p-5 rounded-2xl border border-slate-800/60 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-pinterest-red/10 hover:border-pinterest-red/30">
                      <div className="absolute -right-4 -top-4 w-24 h-24 bg-pinterest-red/10 rounded-full blur-2xl group-hover/stat:bg-pinterest-red/20 transition-all"></div>
                      <div className="flex items-center gap-2 text-slate-400 mb-3 relative z-10">
                        <Users className="w-4 h-4 text-pinterest-red drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                        <span className="text-[11px] uppercase font-bold tracking-widest text-slate-300">Followers</span>
                      </div>
                      <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-300 relative z-10">
                        {accStats.followers || '0'}
                      </span>
                    </div>

                    {/* Stat Block 2 */}
                    <div className="group/stat relative bg-gradient-to-br from-slate-900 to-slate-950 p-5 rounded-2xl border border-slate-800/60 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-blue-500/10 hover:border-blue-500/30">
                      <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover/stat:bg-blue-500/20 transition-all"></div>
                      <div className="flex items-center gap-2 text-slate-400 mb-3 relative z-10">
                        <Eye className="w-4 h-4 text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
                        <span className="text-[11px] uppercase font-bold tracking-widest text-slate-300">Monthly Views</span>
                      </div>
                      <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-300 relative z-10">
                        {accStats.monthlyViews || '0'}
                      </span>
                    </div>

                    {/* Stat Block 3 */}
                    <div className="group/stat relative bg-gradient-to-br from-slate-900 to-slate-950 p-5 rounded-2xl border border-slate-800/60 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-500/10 hover:border-emerald-500/30">
                      <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover/stat:bg-emerald-500/20 transition-all"></div>
                      <div className="flex items-center gap-2 text-slate-400 mb-3 relative z-10">
                        <Activity className="w-4 h-4 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                        <span className="text-[11px] uppercase font-bold tracking-widest text-slate-300">Impressions (30d)</span>
                      </div>
                      <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-300 relative z-10">
                        {accStats.impressions || 'N/A'}
                      </span>
                    </div>

                    {/* Stat Block 4 */}
                    <div className="group/stat relative bg-gradient-to-br from-slate-900 to-slate-950 p-5 rounded-2xl border border-slate-800/60 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-purple-500/10 hover:border-purple-500/30">
                      <div className="absolute -right-4 -top-4 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl group-hover/stat:bg-purple-500/20 transition-all"></div>
                      <div className="flex items-center gap-2 text-slate-400 mb-3 relative z-10">
                        <Target className="w-4 h-4 text-purple-400 drop-shadow-[0_0_8px_rgba(192,132,252,0.8)]" />
                        <span className="text-[11px] uppercase font-bold tracking-widest text-slate-300">Engagements</span>
                      </div>
                      <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-300 relative z-10">
                        {accStats.engagements || 'N/A'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {accounts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-32 text-slate-400 bg-gradient-to-b from-slate-900/40 to-slate-900/10 rounded-3xl border border-slate-800/50 backdrop-blur-md">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-slate-700 rounded-full blur-2xl opacity-20"></div>
            <Users className="w-16 h-16 text-slate-600 relative z-10" />
          </div>
          <h3 className="text-xl font-bold text-slate-300 mb-2 tracking-tight">No Accounts Found</h3>
          <p className="text-sm font-medium">Please add an account in the Accounts tab to view analytics.</p>
        </div>
      )}
    </div>
  );
};
