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
    <div className="flex flex-col gap-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">ANALYTICS</h1>
          <p className="text-sm text-slate-400">Track followers, monthly views, and engagement</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {accounts.map(account => {
          const accStats = stats[account.id];
          const isLoading = loadingAccounts[account.id];

          return (
            <Card key={account.id} title={account.nickname} subtitle={account.email || 'No email provided'} className="border-slate-800 flex flex-col h-full">
              <div className="flex justify-end -mt-12 mb-6">
                <Button 
                  size="sm" 
                  variant="secondary" 
                  icon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}
                  onClick={() => handleRefreshStats(account.id)}
                  loading={isLoading}
                >
                  {isLoading ? 'Scraping...' : 'Refresh Stats'}
                </Button>
              </div>

              {!accStats ? (
                <div className="flex flex-col items-center justify-center p-8 bg-slate-900/50 rounded-xl border border-dashed border-slate-800 text-slate-500">
                  <BarChart2 className="w-10 h-10 mb-2 opacity-50" />
                  <span className="text-sm">Click refresh to scrape stats.</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 flex flex-col">
                    <div className="flex items-center gap-2 text-slate-400 mb-2">
                      <Users className="w-4 h-4 text-pinterest-red" />
                      <span className="text-xs uppercase font-black tracking-wider">Followers</span>
                    </div>
                    <span className="text-2xl font-black text-slate-100">{accStats.followers || '0'}</span>
                  </div>

                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 flex flex-col">
                    <div className="flex items-center gap-2 text-slate-400 mb-2">
                      <Eye className="w-4 h-4 text-blue-400" />
                      <span className="text-xs uppercase font-black tracking-wider">Monthly Views</span>
                    </div>
                    <span className="text-2xl font-black text-slate-100">{accStats.monthlyViews || '0'}</span>
                  </div>

                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 flex flex-col">
                    <div className="flex items-center gap-2 text-slate-400 mb-2">
                      <Activity className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs uppercase font-black tracking-wider">Impressions (30d)</span>
                    </div>
                    <span className="text-2xl font-black text-slate-100">{accStats.impressions || 'N/A'}</span>
                  </div>

                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 flex flex-col">
                    <div className="flex items-center gap-2 text-slate-400 mb-2">
                      <Target className="w-4 h-4 text-purple-400" />
                      <span className="text-xs uppercase font-black tracking-wider">Engagements</span>
                    </div>
                    <span className="text-2xl font-black text-slate-100">{accStats.engagements || 'N/A'}</span>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {accounts.length === 0 && (
        <div className="flex items-center justify-center py-24 text-slate-500 bg-slate-900/30 rounded-2xl border border-slate-800">
          No accounts found. Please add an account in the Accounts tab first.
        </div>
      )}
    </div>
  );
};
