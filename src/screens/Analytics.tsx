import React, { useState, useEffect, useMemo } from 'react';
import { Account, AnalyticsSnapshot } from '../types';
import { api } from '../services/api';
import { 
  RefreshCw, Users, Eye, Activity, Target, Download, 
  FileText, TrendingUp, Filter, Calendar, Layers, Check,
  BarChart3, LayoutGrid, Table2, ArrowUpRight
} from 'lucide-react';
import { Button } from '../components/Button';

interface AnalyticsProps {
  accounts: Account[];
  onShowToast: (msg: string, type: 'success' | 'error' | 'warn' | 'info') => void;
}

const ACCOUNT_COLORS = [
  { stroke: '#ef4444', fill: 'rgba(239, 68, 68, 0.15)', name: 'Red' },
  { stroke: '#3b82f6', fill: 'rgba(59, 130, 246, 0.15)', name: 'Blue' },
  { stroke: '#10b981', fill: 'rgba(16, 185, 129, 0.15)', name: 'Emerald' },
  { stroke: '#a855f7', fill: 'rgba(168, 85, 247, 0.15)', name: 'Purple' },
  { stroke: '#f59e0b', fill: 'rgba(245, 158, 11, 0.15)', name: 'Amber' },
  { stroke: '#ec4899', fill: 'rgba(236, 72, 153, 0.15)', name: 'Pink' }
];

export const Analytics: React.FC<AnalyticsProps> = ({ accounts, onShowToast }) => {
  const [stats, setStats] = useState<Record<string, any>>({});
  const [historyData, setHistoryData] = useState<Record<string, AnalyticsSnapshot[]>>({});
  const [loadingAccounts, setLoadingAccounts] = useState<Record<string, boolean>>({});
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);
  
  // Tab view state: 'overview' | 'accounts' | 'table'
  const [activeTab, setActiveTab] = useState<'overview' | 'accounts' | 'table'>('overview');
  // Selected metric chart in overview: 'followers' | 'views' | 'impressions'
  const [activeChartMetric, setActiveChartMetric] = useState<'followers' | 'monthlyViews' | 'impressions'>('followers');

  // Selection and filter state
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [timeRange, setTimeRange] = useState<7 | 14 | 30>(30);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  // Initialize selected accounts
  useEffect(() => {
    if (accounts.length > 0 && selectedAccountIds.length === 0) {
      setSelectedAccountIds(accounts.map(a => a.id));
    }
  }, [accounts]);

  // Load history data concurrently with Promise.all for speed
  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const allHistory: Record<string, AnalyticsSnapshot[]> = {};
      const promises = accounts.map(async (account) => {
        try {
          let records: AnalyticsSnapshot[] = await api.getAnalyticsHistory(account.id);
          if (!records || records.length === 0) {
            records = await api.seedAnalyticsHistory(account.id);
          }
          return { id: account.id, records: records || [] };
        } catch {
          return { id: account.id, records: [] };
        }
      });

      const results = await Promise.all(promises);
      results.forEach(res => {
        allHistory[res.id] = res.records;
      });

      setHistoryData(allHistory);
    } catch (err: any) {
      console.error('Failed to load analytics history:', err);
      onShowToast('Could not load historical analytics data', 'error');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (accounts.length > 0) {
      loadHistory();
    } else {
      setLoadingHistory(false);
    }
  }, [accounts]);

  const handleRefreshStats = async (accountId: string, skipReloadHistory = false) => {
    setLoadingAccounts(prev => ({ ...prev, [accountId]: true }));
    try {
      onShowToast(`Syncing latest analytics for account...`, 'info');
      const data = await api.fetchAnalytics(accountId);
      setStats(prev => ({ ...prev, [accountId]: data }));
      if (!skipReloadHistory) {
        await loadHistory();
      }
      onShowToast(`Analytics updated and recorded!`, 'success');
    } catch (err: any) {
      onShowToast(`Failed to fetch analytics: ${err.message}`, 'error');
    } finally {
      setLoadingAccounts(prev => ({ ...prev, [accountId]: false }));
    }
  };

  const handleSyncAll = async () => {
    for (const account of accounts) {
      await handleRefreshStats(account.id, true);
    }
    await loadHistory();
    onShowToast('Synced latest analytics for all accounts!', 'success');
  };

  const toggleAccountSelection = (accountId: string) => {
    if (selectedAccountIds.includes(accountId)) {
      if (selectedAccountIds.length === 1) {
        onShowToast('At least one account must be selected', 'warn');
        return;
      }
      setSelectedAccountIds(prev => prev.filter(id => id !== accountId));
    } else {
      setSelectedAccountIds(prev => [...prev, accountId]);
    }
  };

  // Filter snapshot dates based on timeRange
  const dates = useMemo(() => {
    const allDatesSet = new Set<string>();
    Object.values(historyData).forEach(list => {
      list.forEach(s => {
        if (s.snapshotDate) allDatesSet.add(s.snapshotDate);
      });
    });

    const sortedDates = Array.from(allDatesSet).sort();
    return sortedDates.slice(-timeRange);
  }, [historyData, timeRange]);

  // Aggregate KPI metrics based on filtered date window
  const kpiTotals = useMemo(() => {
    let totalFollowers = 0;
    let totalViews = 0;
    let totalImpressions = 0;
    let totalEngagements = 0;
    let followerGainWindow = 0;

    selectedAccountIds.forEach(accId => {
      const history = historyData[accId] || [];
      if (history.length > 0) {
        const latestDate = dates[dates.length - 1];
        const oldestDate = dates[0];
        const latest = history.find(h => h.snapshotDate === latestDate) || history[history.length - 1];
        const oldest = history.find(h => h.snapshotDate === oldestDate) || history[0];

        totalFollowers += latest.followers || 0;
        totalViews += latest.monthlyViews || 0;
        totalImpressions += latest.impressions || 0;
        totalEngagements += latest.engagements || 0;
        followerGainWindow += ((latest.followers || 0) - (oldest.followers || 0));
      }
    });

    const avgDailyFollowerGain = dates.length > 0 ? (followerGainWindow / dates.length).toFixed(1) : '0';
    const engagementRate = totalImpressions > 0 ? ((totalEngagements / totalImpressions) * 100).toFixed(2) : '0.00';

    return {
      totalFollowers,
      totalViews,
      totalImpressions,
      totalEngagements,
      followerGain30d: followerGainWindow,
      avgDailyFollowerGain,
      engagementRate
    };
  }, [selectedAccountIds, historyData, dates]);

  // CSV Export Logic
  const handleExportCSV = () => {
    if (dates.length === 0) {
      onShowToast('No data available to export', 'warn');
      return;
    }

    const headers = ['Date', 'Account ID', 'Account Name', 'Followers', 'Monthly Views', 'Impressions', 'Engagements', 'Outbound Clicks', 'Saves'];
    const rows: string[][] = [headers];

    dates.forEach(date => {
      selectedAccountIds.forEach(accId => {
        const account = accounts.find(a => a.id === accId);
        const history = historyData[accId] || [];
        const snapshot = history.find(h => h.snapshotDate === date);
        if (snapshot) {
          rows.push([
            date,
            accId,
            `"${account?.nickname || 'Account'}"`,
            String(snapshot.followers),
            String(snapshot.monthlyViews),
            String(snapshot.impressions),
            String(snapshot.engagements),
            String(snapshot.outboundClicks),
            String(snapshot.saves)
          ]);
        }
      });
    });

    const csvContent = rows.map(e => e.join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', blobUrl);
    link.setAttribute('download', `pinterest_analytics_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);

    onShowToast('Analytics CSV exported successfully!', 'success');
  };

  // PDF Export Logic
  const handleExportPDF = () => {
    const reportWindow = window.open('', '_blank', 'width=1100,height=850');
    if (!reportWindow) {
      onShowToast('Please allow popups to generate the PDF report', 'error');
      return;
    }

    const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    let tableRowsHtml = '';
    selectedAccountIds.forEach(accId => {
      const account = accounts.find(a => a.id === accId);
      const history = historyData[accId] || [];
      const latest = history[history.length - 1] || {} as any;
      const oldest = history[0] || {} as any;
      const fGain = (latest.followers || 0) - (oldest.followers || 0);

      tableRowsHtml += `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #0f172a;">${account?.nickname || accId}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #475569;">${account?.email || 'N/A'}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600;">${(latest.followers || 0).toLocaleString()}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right; color: ${fGain >= 0 ? '#10b981' : '#ef4444'};">+${fGain}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600;">${(latest.monthlyViews || 0).toLocaleString()}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right;">${(latest.impressions || 0).toLocaleString()}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right;">${(latest.engagements || 0).toLocaleString()}</td>
        </tr>
      `;
    });

    reportWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Pinterest Analytics Executive Report - ${reportDate}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; padding: 40px; background: #ffffff; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #ef4444; padding-bottom: 20px; margin-bottom: 30px; }
          .logo { font-size: 24px; font-weight: 900; color: #ef4444; letter-spacing: -0.5px; }
          .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
          .meta { text-align: right; font-size: 13px; color: #64748b; }
          .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
          .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; }
          .kpi-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 700; margin-bottom: 6px; }
          .kpi-value { font-size: 26px; font-weight: 800; color: #0f172a; }
          .kpi-sub { font-size: 12px; color: #10b981; margin-top: 4px; font-weight: 600; }
          .section-title { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 16px; margin-top: 28px; }
          table { width: 100%; border-collapse: collapse; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; }
          th { background: #f1f5f9; padding: 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; border-bottom: 2px solid #cbd5e1; }
          .footer { margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; font-size: 11px; color: #94a3b8; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo">📌 PINTEREST PIN PUBLISHER</div>
            <div class="subtitle">Official Executive Analytics & Growth Report</div>
          </div>
          <div class="meta">
            <div><strong>Generated:</strong> ${reportDate}</div>
            <div><strong>Time Window:</strong> Last ${timeRange} Days</div>
            <div><strong>Accounts Analyzed:</strong> ${selectedAccountIds.length}</div>
          </div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-title">Total Audience</div>
            <div class="kpi-value">${kpiTotals.totalFollowers.toLocaleString()}</div>
            <div class="kpi-sub">+${kpiTotals.followerGain30d.toLocaleString()} (${kpiTotals.avgDailyFollowerGain}/day)</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Monthly Views</div>
            <div class="kpi-value">${kpiTotals.totalViews.toLocaleString()}</div>
            <div class="kpi-sub">Active Reach</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Impressions</div>
            <div class="kpi-value">${kpiTotals.totalImpressions.toLocaleString()}</div>
            <div class="kpi-sub">Content Views</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-title">Engagement Rate</div>
            <div class="kpi-value">${kpiTotals.engagementRate}%</div>
            <div class="kpi-sub">${kpiTotals.totalEngagements.toLocaleString()} Interactions</div>
          </div>
        </div>

        <div class="section-title">Account Performance Breakdown</div>
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Email</th>
              <th style="text-align: right;">Followers</th>
              <th style="text-align: right;">${timeRange}d Gain</th>
              <th style="text-align: right;">Monthly Views</th>
              <th style="text-align: right;">Impressions</th>
              <th style="text-align: right;">Engagements</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>

        <div class="footer">
          Generated automatically by Pinterest Pin Publisher Desktop Application. Confidential report.
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          };
        </script>
      </body>
      </html>
    `);
    reportWindow.document.close();
    onShowToast('Preparing printable PDF report...', 'info');
  };

  // Render vector SVG graph for active metric
  const renderSvgGraph = () => {
    if (dates.length === 0) return null;

    const width = 850;
    const height = 280;
    const paddingX = 50;
    const paddingY = 32;

    const metricTitles = {
      followers: 'Follower Growth & Velocity',
      monthlyViews: 'Monthly View Trends (Reach)',
      impressions: 'Impression & Exposure Volume'
    };

    // Collect all data series
    const seriesList = selectedAccountIds.map((accId, accIdx) => {
      const account = accounts.find(a => a.id === accId);
      const history = historyData[accId] || [];
      const color = ACCOUNT_COLORS[accIdx % ACCOUNT_COLORS.length];

      const points = dates.map((date, idx) => {
        const snapshot = history.find(h => h.snapshotDate === date);
        const val = snapshot ? (snapshot[activeChartMetric] || 0) : 0;
        return { date, val, idx };
      });

      return { accountId: accId, accountName: account?.nickname || 'Account', points, color };
    });

    // Find min and max for scaling
    let allValues: number[] = [];
    seriesList.forEach(s => s.points.forEach(p => allValues.push(p.val)));
    if (allValues.length === 0) allValues = [0];

    const maxVal = Math.max(...allValues, 10);
    const minVal = Math.min(...allValues);
    const range = maxVal - minVal || 1;

    const getX = (index: number) => {
      if (dates.length === 1) return width / 2;
      return paddingX + (index / (dates.length - 1)) * (width - paddingX * 2);
    };

    const getY = (value: number) => {
      return height - paddingY - ((value - minVal) / range) * (height - paddingY * 2);
    };

    // Calculate Y-axis grid ticks
    const yTicks = [0, 0.33, 0.66, 1].map(ratio => {
      const val = Math.round(minVal + ratio * range);
      const y = getY(val);
      const label = val >= 1000000 ? `${(val / 1000000).toFixed(1)}M` : val >= 1000 ? `${(val / 1000).toFixed(1)}k` : String(val);
      return { val, y, label };
    });

    return (
      <div 
        className="relative bg-slate-950/80 rounded-3xl p-6 border border-slate-800/80 shadow-2xl overflow-hidden backdrop-blur-md"
        onMouseLeave={() => setHoveredPointIndex(null)}
      >
        {/* Header bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-pinterest-red/10 border border-pinterest-red/20 text-pinterest-red">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 tracking-tight">{metricTitles[activeChartMetric]}</h3>
              <p className="text-xs text-slate-400 font-medium">Trajectory across {dates.length} daily snapshots</p>
            </div>
          </div>

          {/* Metric Selector Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 self-start sm:self-auto">
            <button
              onClick={() => setActiveChartMetric('followers')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeChartMetric === 'followers'
                  ? 'bg-pinterest-red text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Followers
            </button>
            <button
              onClick={() => setActiveChartMetric('monthlyViews')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeChartMetric === 'monthlyViews'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Monthly Views
            </button>
            <button
              onClick={() => setActiveChartMetric('impressions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeChartMetric === 'impressions'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Impressions
            </button>
          </div>
        </div>

        {/* SVG Container */}
        <div className="relative w-full overflow-x-auto">
          <svg 
            viewBox={`0 0 ${width} ${height}`} 
            className="w-full h-auto min-w-[650px] overflow-visible"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const mouseX = e.clientX - rect.left;
              const normalizedX = (mouseX / rect.width) * width;
              
              let closestIdx = 0;
              let minDiff = Infinity;
              dates.forEach((_, idx) => {
                const px = getX(idx);
                const diff = Math.abs(px - normalizedX);
                if (diff < minDiff) {
                  minDiff = diff;
                  closestIdx = idx;
                }
              });
              setHoveredPointIndex(closestIdx);
            }}
          >
            <defs>
              {seriesList.map(s => (
                <linearGradient key={`grad-${s.accountId}`} id={`grad-${activeChartMetric}-${s.accountId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color.stroke} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={s.color.stroke} stopOpacity="0.0" />
                </linearGradient>
              ))}
            </defs>

            {/* Horizontal Gridlines */}
            {yTicks.map((tick, i) => (
              <g key={i}>
                <line x1={paddingX} y1={tick.y} x2={width - paddingX} y2={tick.y} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
                <text x={paddingX - 10} y={tick.y + 4} textAnchor="end" fill="rgba(255,255,255,0.4)" fontSize="10" fontWeight="600">
                  {tick.label}
                </text>
              </g>
            ))}

            {/* X-Axis Date Labels */}
            {dates.map((date, idx) => {
              const step = Math.max(1, Math.floor(dates.length / 7));
              if (idx % step !== 0 && idx !== dates.length - 1) return null;
              const x = getX(idx);
              const label = date.slice(5); // MM-DD
              return (
                <text key={idx} x={x} y={height - 8} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="10" fontWeight="600">
                  {label}
                </text>
              );
            })}

            {/* Area Fills & Trend Lines */}
            {seriesList.map(s => {
              const pathPoints = s.points.map(p => `${getX(p.idx)},${getY(p.val)}`);
              const linePath = `M ${pathPoints.join(' L ')}`;
              const areaPath = `M ${getX(0)},${height - paddingY} L ${pathPoints.join(' L ')} L ${getX(s.points.length - 1)},${height - paddingY} Z`;

              return (
                <g key={s.accountId}>
                  <path d={areaPath} fill={`url(#grad-${activeChartMetric}-${s.accountId})`} />
                  <path d={linePath} fill="none" stroke={s.color.stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  
                  {s.points.map(p => (
                    <circle 
                      key={p.idx} 
                      cx={getX(p.idx)} 
                      cy={getY(p.val)} 
                      r={hoveredPointIndex === p.idx ? 5 : 3} 
                      fill="#0f172a" 
                      stroke={s.color.stroke} 
                      strokeWidth={hoveredPointIndex === p.idx ? 2.5 : 1.5} 
                      className="transition-all"
                    />
                  ))}
                </g>
              );
            })}

            {/* Hover Line */}
            {hoveredPointIndex !== null && (
              <g>
                <line 
                  x1={getX(hoveredPointIndex)} 
                  y1={paddingY} 
                  x2={getX(hoveredPointIndex)} 
                  y2={height - paddingY} 
                  stroke="rgba(255,255,255,0.25)" 
                  strokeDasharray="3 3" 
                />
              </g>
            )}
          </svg>
        </div>

        {/* Hover Tooltip Popup */}
        {hoveredPointIndex !== null && (
          <div 
            className="absolute top-16 z-30 p-3 rounded-2xl bg-slate-900/95 border border-slate-700 shadow-2xl backdrop-blur-md pointer-events-none transition-all duration-150"
            style={{
              left: `${Math.min(80, Math.max(10, (hoveredPointIndex / Math.max(1, dates.length - 1)) * 100))}%`
            }}
          >
            <div className="text-[11px] font-bold text-slate-400 mb-1.5 border-b border-slate-800 pb-1">
              📅 {dates[hoveredPointIndex]}
            </div>
            <div className="flex flex-col gap-1">
              {seriesList.map(s => {
                const pt = s.points[hoveredPointIndex];
                const prevPt = hoveredPointIndex > 0 ? s.points[hoveredPointIndex - 1] : null;
                const diff = prevPt ? pt.val - prevPt.val : 0;
                return (
                  <div key={s.accountId} className="flex items-center justify-between gap-4 text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-slate-200">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color.stroke }} />
                      {s.accountName}:
                    </span>
                    <div className="flex items-center gap-1 font-bold text-white">
                      <span>{pt.val.toLocaleString()}</span>
                      {diff !== 0 && (
                        <span className={`text-[10px] ${diff > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          ({diff > 0 ? `+${diff}` : diff})
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in pb-16">
      {/* Top Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <BarChart3 className="w-6 h-6 text-pinterest-red" />
            PERFORMANCE ANALYTICS
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-medium tracking-wide">
            Real-time trajectory tracking, follower velocity & branded report export
          </p>
        </div>

        {/* Global Action Bar */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            size="sm"
            variant="secondary"
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={handleSyncAll}
          >
            Sync All
          </Button>

          <Button
            size="sm"
            variant="secondary"
            icon={<Download className="w-3.5 h-3.5 text-blue-400" />}
            onClick={handleExportCSV}
          >
            CSV
          </Button>

          <Button
            size="sm"
            variant="primary"
            icon={<FileText className="w-3.5 h-3.5" />}
            onClick={handleExportPDF}
          >
            Export PDF
          </Button>
        </div>
      </div>

      {/* Navigation View Tabs (Overview vs Account Cards vs Table) */}
      <div className="flex items-center justify-between bg-slate-950/80 p-2 rounded-2xl border border-slate-850 shadow-lg">
        <div className="flex items-center gap-1.5 font-mono text-xs font-extrabold">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'overview'
                ? 'bg-slate-900 text-pinterest-red border border-slate-700 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Growth & Overview</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('accounts')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'accounts'
                ? 'bg-slate-900 text-blue-400 border border-slate-700 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            <span>Account Cards ({accounts.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('table')}
            className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'table'
                ? 'bg-slate-900 text-emerald-400 border border-slate-700 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
            }`}
          >
            <Table2 className="w-4 h-4" />
            <span>Comparison Matrix</span>
          </button>
        </div>

        {/* Time Range Filter Selector */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
          {[7, 14, 30].map((days) => (
            <button
              key={days}
              onClick={() => setTimeRange(days as any)}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                timeRange === days 
                  ? 'bg-pinterest-red text-white shadow' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {days}D
            </button>
          ))}
        </div>
      </div>

      {/* Account Comparison Filter Badges */}
      <div className="flex items-center gap-2 flex-wrap text-xs bg-slate-950/60 p-3 rounded-2xl border border-slate-850/60">
        <div className="flex items-center gap-1.5 font-bold text-slate-400 uppercase tracking-wider mr-2 text-[10px]">
          <Filter className="w-3.5 h-3.5 text-pinterest-red" />
          <span>Filter Profiles:</span>
        </div>
        {accounts.map((account, idx) => {
          const isSelected = selectedAccountIds.includes(account.id);
          const color = ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length];
          return (
            <button
              key={account.id}
              onClick={() => toggleAccountSelection(account.id)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold transition-all border text-xs ${
                isSelected 
                  ? 'bg-slate-900 border-slate-700 text-white shadow-sm' 
                  : 'bg-slate-950/40 border-slate-800/60 text-slate-500 hover:text-slate-300'
              }`}
            >
              <span 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: isSelected ? color.stroke : '#475569' }} 
              />
              <span>{account.nickname}</span>
              {isSelected && <Check className="w-3 h-3 text-emerald-400 ml-0.5" />}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW & GROWTH */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-6 animate-fade-in">
          {/* KPI Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1 */}
            <div className="bg-slate-950/90 p-5 rounded-2xl border border-slate-850 shadow-md">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-[11px] uppercase font-bold tracking-widest text-slate-400">Total Followers</span>
                <Users className="w-4 h-4 text-pinterest-red" />
              </div>
              <div className="text-2xl font-black text-white tracking-tight">
                {kpiTotals.totalFollowers.toLocaleString()}
              </div>
              <div className="flex items-center gap-1 mt-1 text-xs font-semibold text-emerald-400">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>+{kpiTotals.followerGain30d.toLocaleString()} ({kpiTotals.avgDailyFollowerGain}/d)</span>
              </div>
            </div>

            {/* KPI 2 */}
            <div className="bg-slate-950/90 p-5 rounded-2xl border border-slate-850 shadow-md">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-[11px] uppercase font-bold tracking-widest text-slate-400">Monthly Views</span>
                <Eye className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-2xl font-black text-white tracking-tight">
                {kpiTotals.totalViews.toLocaleString()}
              </div>
              <div className="text-xs font-semibold text-slate-400 mt-1">
                Active audience reach
              </div>
            </div>

            {/* KPI 3 */}
            <div className="bg-slate-950/90 p-5 rounded-2xl border border-slate-850 shadow-md">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-[11px] uppercase font-bold tracking-widest text-slate-400">Total Impressions</span>
                <Activity className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-black text-white tracking-tight">
                {kpiTotals.totalImpressions.toLocaleString()}
              </div>
              <div className="text-xs font-semibold text-emerald-400 mt-1">
                High-intent Pin views
              </div>
            </div>

            {/* KPI 4 */}
            <div className="bg-slate-950/90 p-5 rounded-2xl border border-slate-850 shadow-md">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-[11px] uppercase font-bold tracking-widest text-slate-400">Engagement Rate</span>
                <Target className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl font-black text-white tracking-tight">
                {kpiTotals.engagementRate}%
              </div>
              <div className="text-xs font-semibold text-purple-300 mt-1">
                {kpiTotals.totalEngagements.toLocaleString()} total interactions
              </div>
            </div>
          </div>

          {/* Interactive SVG Chart */}
          {loadingHistory ? (
            <div className="flex flex-col items-center justify-center py-16 bg-slate-950/60 rounded-3xl border border-slate-850">
              <RefreshCw className="w-8 h-8 text-pinterest-red animate-spin mb-3" />
              <span className="text-xs font-semibold text-slate-300">Loading historical trend data...</span>
            </div>
          ) : (
            renderSvgGraph()
          )}
        </div>
      )}

      {/* TAB 2: INDIVIDUAL ACCOUNT CARDS */}
      {activeTab === 'accounts' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 animate-fade-in">
          {accounts.map((account, idx) => {
            const accStats = stats[account.id];
            const history = historyData[account.id] || [];
            const latestHistory = history[history.length - 1];
            const isLoading = loadingAccounts[account.id];
            const color = ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length];

            const followerVal = accStats?.followers || (latestHistory ? latestHistory.followersRaw || latestHistory.followers : '0');
            const viewsVal = accStats?.monthlyViews || (latestHistory ? latestHistory.monthlyViewsRaw || latestHistory.monthlyViews : '0');

            return (
              <div 
                key={account.id} 
                className="relative rounded-3xl overflow-hidden bg-slate-950 border border-slate-850 shadow-lg hover:border-slate-750 transition-all p-5"
              >
                <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: color.stroke }}></div>
                
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight">{account.nickname}</h3>
                    <span className="text-[11px] text-slate-400 font-medium bg-slate-900 px-2.5 py-0.5 rounded-full border border-slate-800 mt-1 inline-block">
                      {account.email || 'No email provided'}
                    </span>
                  </div>

                  <Button 
                    size="sm" 
                    variant="secondary" 
                    icon={<RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
                    onClick={() => handleRefreshStats(account.id)}
                    loading={isLoading}
                  >
                    Sync
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800/60">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Followers</span>
                    <div className="text-lg font-black text-white mt-0.5">{followerVal}</div>
                  </div>

                  <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800/60">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Monthly Views</span>
                    <div className="text-lg font-black text-white mt-0.5">{viewsVal}</div>
                  </div>

                  <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800/60">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Impressions</span>
                    <div className="text-lg font-black text-white mt-0.5">
                      {accStats?.impressions || (latestHistory ? latestHistory.impressions.toLocaleString() : 'N/A')}
                    </div>
                  </div>

                  <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800/60">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Engagements</span>
                    <div className="text-lg font-black text-white mt-0.5">
                      {accStats?.engagements || (latestHistory ? latestHistory.engagements.toLocaleString() : 'N/A')}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 3: COMPARISON MATRIX */}
      {activeTab === 'table' && (
        <div className="bg-slate-950 rounded-3xl border border-slate-850 overflow-hidden shadow-xl animate-fade-in">
          <div className="p-4 border-b border-slate-850 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-200">Account Comparison Matrix ({selectedAccountIds.length} Profiles)</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={handleExportCSV} icon={<Download className="w-3.5 h-3.5" />}>
                Export CSV
              </Button>
              <Button size="sm" variant="secondary" onClick={handleExportPDF} icon={<FileText className="w-3.5 h-3.5" />}>
                PDF Report
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900/80 border-b border-slate-850 text-slate-400 uppercase font-black tracking-wider text-[10px]">
                  <th className="p-3.5">Account</th>
                  <th className="p-3.5">Email</th>
                  <th className="p-3.5 text-right">Followers</th>
                  <th className="p-3.5 text-right">{timeRange}d Gain</th>
                  <th className="p-3.5 text-right">Monthly Views</th>
                  <th className="p-3.5 text-right">Impressions</th>
                  <th className="p-3.5 text-right">Engagements</th>
                </tr>
              </thead>
              <tbody>
                {selectedAccountIds.map(accId => {
                  const account = accounts.find(a => a.id === accId);
                  const history = historyData[accId] || [];
                  const latest = history[history.length - 1] || {} as any;
                  const oldest = history[0] || {} as any;
                  const fGain = (latest.followers || 0) - (oldest.followers || 0);

                  return (
                    <tr key={accId} className="border-b border-slate-850/60 hover:bg-slate-900/40 text-slate-200">
                      <td className="p-3.5 font-bold text-white">{account?.nickname || accId}</td>
                      <td className="p-3.5 text-slate-400">{account?.email || 'N/A'}</td>
                      <td className="p-3.5 text-right font-bold">{(latest.followers || 0).toLocaleString()}</td>
                      <td className={`p-3.5 text-right font-bold ${fGain >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        +{fGain}
                      </td>
                      <td className="p-3.5 text-right font-bold text-blue-400">{(latest.monthlyViews || 0).toLocaleString()}</td>
                      <td className="p-3.5 text-right font-bold text-emerald-400">{(latest.impressions || 0).toLocaleString()}</td>
                      <td className="p-3.5 text-right font-bold text-purple-400">{(latest.engagements || 0).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
