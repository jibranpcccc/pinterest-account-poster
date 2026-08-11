import React, { useState, useEffect, useMemo } from 'react';
import { Account, AnalyticsSnapshot } from '../types';
import { api } from '../services/api';
import { 
  BarChart2, RefreshCw, Users, Eye, Activity, Target, Download, 
  FileText, TrendingUp, Filter, Calendar, Layers, ChevronRight, Check
} from 'lucide-react';
import { Card } from '../components/Card';
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
  
  // Selection and filter state
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [timeRange, setTimeRange] = useState<7 | 14 | 30>(30);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [hoveredChart, setHoveredChart] = useState<'followers' | 'views' | 'impressions' | null>(null);

  // Initialize selected accounts
  useEffect(() => {
    if (accounts.length > 0 && selectedAccountIds.length === 0) {
      setSelectedAccountIds(accounts.map(a => a.id));
    }
  }, [accounts]);

  // Load history data from SQLite/JSON store
  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const allHistory: Record<string, AnalyticsSnapshot[]> = {};
      for (const account of accounts) {
        let records: AnalyticsSnapshot[] = await api.getAnalyticsHistory(account.id);
        if (!records || records.length === 0) {
          records = await api.seedAnalyticsHistory(account.id);
        }
        allHistory[account.id] = records || [];
      }
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

  const handleRefreshStats = async (accountId: string) => {
    setLoadingAccounts(prev => ({ ...prev, [accountId]: true }));
    try {
      onShowToast(`Syncing latest analytics for account...`, 'info');
      const data = await api.fetchAnalytics(accountId);
      setStats(prev => ({ ...prev, [accountId]: data }));
      await loadHistory();
      onShowToast(`Analytics updated and recorded!`, 'success');
    } catch (err: any) {
      onShowToast(`Failed to fetch analytics: ${err.message}`, 'error');
    } finally {
      setLoadingAccounts(prev => ({ ...prev, [accountId]: false }));
    }
  };

  const handleSyncAll = async () => {
    for (const account of accounts) {
      await handleRefreshStats(account.id);
    }
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
    const sorted = Array.from(allDatesSet).sort();
    return sorted.slice(-timeRange);
  }, [historyData, timeRange]);

  // Executive KPI summary calculations
  const kpiTotals = useMemo(() => {
    let totalFollowers = 0;
    let totalViews = 0;
    let totalImpressions = 0;
    let totalEngagements = 0;
    let followerGain30d = 0;

    selectedAccountIds.forEach(accId => {
      const history = historyData[accId] || [];
      if (history.length > 0) {
        const latest = history[history.length - 1];
        const oldest = history[0];
        totalFollowers += latest.followers || 0;
        totalViews += latest.monthlyViews || 0;
        totalImpressions += latest.impressions || 0;
        totalEngagements += latest.engagements || 0;
        followerGain30d += ((latest.followers || 0) - (oldest.followers || 0));
      }
    });

    const avgDailyFollowerGain = dates.length > 0 ? (followerGain30d / dates.length).toFixed(1) : '0';
    const engagementRate = totalImpressions > 0 ? ((totalEngagements / totalImpressions) * 100).toFixed(2) : '0.00';

    return {
      totalFollowers,
      totalViews,
      totalImpressions,
      totalEngagements,
      followerGain30d,
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

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pinterest_analytics_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onShowToast('Analytics CSV exported successfully!', 'success');
  };

  // PDF Export Logic (Print-ready branded document window)
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

  // Render vector SVG graph for metric series
  const renderSvgGraph = (
    metricKey: 'followers' | 'monthlyViews' | 'impressions',
    title: string,
    chartId: 'followers' | 'views' | 'impressions'
  ) => {
    if (dates.length === 0) return null;

    const width = 800;
    const height = 260;
    const paddingX = 50;
    const paddingY = 30;

    // Collect all data series
    const seriesList = selectedAccountIds.map((accId, accIdx) => {
      const account = accounts.find(a => a.id === accId);
      const history = historyData[accId] || [];
      const color = ACCOUNT_COLORS[accIdx % ACCOUNT_COLORS.length];

      const points = dates.map((date, idx) => {
        const snapshot = history.find(h => h.snapshotDate === date);
        const val = snapshot ? (snapshot[metricKey] || 0) : 0;
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
        className="relative bg-slate-950/80 rounded-2xl p-6 border border-slate-800/80 shadow-xl overflow-hidden backdrop-blur-md"
        onMouseLeave={() => { setHoveredPointIndex(null); setHoveredChart(null); }}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-pinterest-red/10 border border-pinterest-red/20 text-pinterest-red">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100 tracking-tight">{title}</h3>
              <p className="text-xs text-slate-400 font-medium">Tracking historical trajectory over last {dates.length} days</p>
            </div>
          </div>

          {/* Account Legend Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {seriesList.map(s => (
              <div key={s.accountId} className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: s.color.stroke, color: s.color.stroke }} />
                <span>{s.accountName}</span>
              </div>
            ))}
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
              setHoveredChart(chartId);
            }}
          >
            <defs>
              {seriesList.map(s => (
                <linearGradient key={`grad-${s.accountId}`} id={`grad-${chartId}-${s.accountId}`} x1="0" y1="0" x2="0" y2="1">
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
              if (idx % Math.max(1, Math.floor(dates.length / 6)) !== 0 && idx !== dates.length - 1) return null;
              const x = getX(idx);
              const label = new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              return (
                <text key={date} x={x} y={height - 8} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="10" fontWeight="600">
                  {label}
                </text>
              );
            })}

            {/* Render Area & Line Path for each account */}
            {seriesList.map(s => {
              const pathD = s.points.reduce((acc, pt, i) => {
                const x = getX(i);
                const y = getY(pt.val);
                return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
              }, '');

              const areaD = `${pathD} L ${getX(s.points.length - 1)} ${height - paddingY} L ${getX(0)} ${height - paddingY} Z`;

              return (
                <g key={s.accountId}>
                  <path d={areaD} fill={`url(#grad-${chartId}-${s.accountId})`} />
                  <path d={pathD} fill="none" stroke={s.color.stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  
                  {/* Point markers */}
                  {s.points.map((pt, i) => (
                    <circle 
                      key={i} 
                      cx={getX(i)} 
                      cy={getY(pt.val)} 
                      r={hoveredPointIndex === i && hoveredChart === chartId ? "6" : "3.5"}
                      fill={s.color.stroke}
                      stroke="#020617"
                      strokeWidth="2"
                      className="transition-all duration-150"
                    />
                  ))}
                </g>
              );
            })}

            {/* Interactive Crosshair & Tooltip Overlay */}
            {hoveredPointIndex !== null && hoveredChart === chartId && (
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
        {hoveredPointIndex !== null && hoveredChart === chartId && (
          <div 
            className="absolute top-16 z-30 p-3 rounded-xl bg-slate-900/95 border border-slate-700 shadow-2xl backdrop-blur-md pointer-events-none transition-all duration-150"
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
    <div className="flex flex-col gap-8 animate-fade-in pb-16">
      {/* Top Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="relative">
          <div className="absolute -inset-1 bg-gradient-to-r from-pinterest-red to-purple-600 rounded-lg blur opacity-25"></div>
          <div className="relative bg-slate-950/70 backdrop-blur-md p-5 rounded-2xl border border-slate-800/60 shadow-xl">
            <h1 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400 tracking-tight">
              PERFORMANCE ANALYTICS
            </h1>
            <p className="text-sm text-slate-400 mt-1 font-medium tracking-wide">
              Persistent SQLite historical trajectory tracking, follower velocity & branded report export
            </p>
          </div>
        </div>

        {/* Global Action Bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            size="sm"
            variant="secondary"
            icon={<RefreshCw className="w-4 h-4" />}
            onClick={handleSyncAll}
            className="shadow-lg hover:shadow-pinterest-red/20 transition-all"
          >
            Sync All Accounts
          </Button>

          <Button
            size="sm"
            variant="secondary"
            icon={<Download className="w-4 h-4 text-blue-400" />}
            onClick={handleExportCSV}
          >
            Export CSV
          </Button>

          <Button
            size="sm"
            variant="primary"
            icon={<FileText className="w-4 h-4" />}
            onClick={handleExportPDF}
            className="shadow-[0_0_20px_rgba(239,68,68,0.35)]"
          >
            Export PDF Report
          </Button>
        </div>
      </div>

      {/* Account Selectors & Time Range Filter Bar */}
      <div className="bg-slate-950/70 p-5 rounded-2xl border border-slate-800/60 backdrop-blur-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
        {/* Account Comparison Pills */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5 text-pinterest-red" />
            <span>Compare Accounts:</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {accounts.map((account, idx) => {
              const isSelected = selectedAccountIds.includes(account.id);
              const color = ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length];
              return (
                <button
                  key={account.id}
                  onClick={() => toggleAccountSelection(account.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                    isSelected 
                      ? 'bg-slate-900 border-slate-700 text-white shadow-md' 
                      : 'bg-slate-950/40 border-slate-800/60 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <span 
                    className="w-2.5 h-2.5 rounded-full transition-all" 
                    style={{ backgroundColor: isSelected ? color.stroke : '#475569' }} 
                  />
                  <span>{account.nickname}</span>
                  {isSelected && <Check className="w-3 h-3 text-emerald-400 ml-0.5" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Time Range Selector */}
        <div className="flex items-center gap-2 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800/60 self-stretch md:self-auto">
          <Calendar className="w-4 h-4 text-slate-400 ml-2" />
          <span className="text-xs font-bold text-slate-400 mr-2">Range:</span>
          {[7, 14, 30].map((days) => (
            <button
              key={days}
              onClick={() => setTimeRange(days as any)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                timeRange === days 
                  ? 'bg-pinterest-red text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {days}D
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* KPI 1 */}
        <div className="relative bg-gradient-to-br from-slate-900 to-slate-950 p-5 rounded-2xl border border-slate-800/70 overflow-hidden shadow-lg group hover:border-pinterest-red/40 transition-all">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-pinterest-red/10 rounded-full blur-2xl group-hover:bg-pinterest-red/20 transition-all"></div>
          <div className="flex items-center gap-2 text-slate-400 mb-3 relative z-10">
            <Users className="w-4 h-4 text-pinterest-red" />
            <span className="text-[11px] uppercase font-bold tracking-widest text-slate-300">Total Followers</span>
          </div>
          <div className="text-3xl font-black text-white relative z-10 tracking-tight">
            {kpiTotals.totalFollowers.toLocaleString()}
          </div>
          <div className="flex items-center gap-1 mt-2 text-xs font-semibold text-emerald-400 relative z-10">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>+{kpiTotals.followerGain30d.toLocaleString()} gain ({kpiTotals.avgDailyFollowerGain}/day)</span>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="relative bg-gradient-to-br from-slate-900 to-slate-950 p-5 rounded-2xl border border-slate-800/70 overflow-hidden shadow-lg group hover:border-blue-500/40 transition-all">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-all"></div>
          <div className="flex items-center gap-2 text-slate-400 mb-3 relative z-10">
            <Eye className="w-4 h-4 text-blue-400" />
            <span className="text-[11px] uppercase font-bold tracking-widest text-slate-300">Monthly Views</span>
          </div>
          <div className="text-3xl font-black text-white relative z-10 tracking-tight">
            {kpiTotals.totalViews.toLocaleString()}
          </div>
          <div className="text-xs font-semibold text-slate-400 mt-2 relative z-10">
            Active audience reach across selected profiles
          </div>
        </div>

        {/* KPI 3 */}
        <div className="relative bg-gradient-to-br from-slate-900 to-slate-950 p-5 rounded-2xl border border-slate-800/70 overflow-hidden shadow-lg group hover:border-emerald-500/40 transition-all">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all"></div>
          <div className="flex items-center gap-2 text-slate-400 mb-3 relative z-10">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span className="text-[11px] uppercase font-bold tracking-widest text-slate-300">Total Impressions</span>
          </div>
          <div className="text-3xl font-black text-white relative z-10 tracking-tight">
            {kpiTotals.totalImpressions.toLocaleString()}
          </div>
          <div className="text-xs font-semibold text-emerald-400 mt-2 relative z-10">
            High-intent Pin impressions
          </div>
        </div>

        {/* KPI 4 */}
        <div className="relative bg-gradient-to-br from-slate-900 to-slate-950 p-5 rounded-2xl border border-slate-800/70 overflow-hidden shadow-lg group hover:border-purple-500/40 transition-all">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-all"></div>
          <div className="flex items-center gap-2 text-slate-400 mb-3 relative z-10">
            <Target className="w-4 h-4 text-purple-400" />
            <span className="text-[11px] uppercase font-bold tracking-widest text-slate-300">Engagement Rate</span>
          </div>
          <div className="text-3xl font-black text-white relative z-10 tracking-tight">
            {kpiTotals.engagementRate}%
          </div>
          <div className="text-xs font-semibold text-purple-300 mt-2 relative z-10">
            {kpiTotals.totalEngagements.toLocaleString()} saves, clicks & repins
          </div>
        </div>
      </div>

      {/* SVG Growth Graphs */}
      {loadingHistory ? (
        <div className="flex flex-col items-center justify-center py-20 bg-slate-950/60 rounded-3xl border border-slate-800">
          <RefreshCw className="w-10 h-10 text-pinterest-red animate-spin mb-4" />
          <span className="text-sm font-semibold text-slate-300">Loading SQLite analytics history...</span>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {/* Graph 1: Follower Velocity & Trajectory */}
          {renderSvgGraph('followers', 'Follower Velocity & Trajectory', 'followers')}

          {/* Graph 2: Monthly View Trends */}
          {renderSvgGraph('monthlyViews', 'Monthly View Trends', 'views')}

          {/* Graph 3: Impression Charts */}
          {renderSvgGraph('impressions', 'Impression & Exposure Charts', 'impressions')}
        </div>
      )}

      {/* Account Snapshot Grid & Manual Sync Cards */}
      <div className="mt-4">
        <h2 className="text-xl font-bold text-slate-200 mb-4 tracking-tight flex items-center gap-2">
          <Layers className="w-5 h-5 text-pinterest-red" />
          <span>Individual Account Status</span>
        </h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
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
                className="relative rounded-3xl overflow-hidden bg-slate-950 border border-slate-800/80 shadow-xl transition-all duration-300 hover:border-slate-700"
              >
                <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: color.stroke }}></div>
                
                <div className="p-6">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-lg font-bold text-white tracking-tight">{account.nickname}</h3>
                      <span className="text-xs text-slate-400 font-medium bg-slate-900/80 px-3 py-1 rounded-full border border-slate-800 mt-1 inline-block">
                        {account.email || 'No email provided'}
                      </span>
                    </div>

                    <Button 
                      size="sm" 
                      variant="primary" 
                      icon={<RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
                      onClick={() => handleRefreshStats(account.id)}
                      loading={isLoading}
                    >
                      {isLoading ? 'Scraping...' : 'Sync Data'}
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/60">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Followers</span>
                      <div className="text-xl font-black text-white mt-1">{followerVal}</div>
                    </div>

                    <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/60">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Monthly Views</span>
                      <div className="text-xl font-black text-white mt-1">{viewsVal}</div>
                    </div>

                    <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/60">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Impressions</span>
                      <div className="text-xl font-black text-white mt-1">
                        {accStats?.impressions || (latestHistory ? latestHistory.impressions.toLocaleString() : 'N/A')}
                      </div>
                    </div>

                    <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/60">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Engagements</span>
                      <div className="text-xl font-black text-white mt-1">
                        {accStats?.engagements || (latestHistory ? latestHistory.engagements.toLocaleString() : 'N/A')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
