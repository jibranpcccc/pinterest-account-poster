import React, { useState } from 'react';
import { QueueJob } from '../types';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, CheckCircle2, AlertCircle, PlayCircle, Filter } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';

interface ContentCalendarProps {
  queue: QueueJob[];
  onSelectDate?: (dateStr: string) => void;
  onItemClick?: (job: QueueJob) => void;
  onRescheduleItem?: (jobId: string, newDate: string) => void;
}

export const ContentCalendar: React.FC<ContentCalendarProps> = ({
  queue,
  onSelectDate,
  onItemClick,
  onRescheduleItem
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [activeDayDate, setActiveDayDate] = useState<string | null>(null);

  // Month navigation
  const prevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const goToday = () => {
    setCurrentDate(new Date());
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString('default', { month: 'long' });

  // Grid calculation for month view
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Map queue jobs by date YYYY-MM-DD
  const jobsByDate: Record<string, QueueJob[]> = {};
  queue.forEach(job => {
    if (selectedStatusFilter !== 'all' && job.status !== selectedStatusFilter) return;
    const dateKey = job.scheduledDate || (job.createdAt ? job.createdAt.split('T')[0] : '');
    if (dateKey) {
      if (!jobsByDate[dateKey]) jobsByDate[dateKey] = [];
      jobsByDate[dateKey].push(job);
    }
  });

  const calendarDays = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const formattedDay = String(d).padStart(2, '0');
    const formattedMonth = String(month + 1).padStart(2, '0');
    const dateStr = `${year}-${formattedMonth}-${formattedDay}`;
    calendarDays.push({ dayNumber: d, dateStr });
  }

  const todayStr = new Date().toISOString().split('T')[0];

  const getStatusBadgeColor = (status: QueueJob['status']) => {
    switch (status) {
      case 'completed': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'running': return 'bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse';
      case 'scheduled': return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'failed': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-slate-700/50 text-slate-300 border-slate-600';
    }
  };

  return (
    <Card className="p-6 bg-slate-900/90 border-slate-800 backdrop-blur-md">
      {/* Calendar Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-gradient-to-br from-red-500/20 to-pink-500/20 rounded-xl border border-red-500/30">
            <CalendarIcon className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <span>{monthName} {year}</span>
            </h2>
            <p className="text-xs text-slate-400">Content Schedule & Queue Overview</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Status Filter */}
          <div className="flex items-center space-x-1.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700">
            <Filter className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-300 focus:outline-none pr-2 py-0.5"
            >
              <option value="all">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {/* View Toggle */}
          <div className="flex items-center bg-slate-800/80 p-1 rounded-lg border border-slate-700 text-xs">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1 rounded-md transition-all ${viewMode === 'month' ? 'bg-red-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 rounded-md transition-all ${viewMode === 'week' ? 'bg-red-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Week
            </button>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center space-x-1">
            <Button variant="secondary" size="sm" onClick={prevMonth} aria-label="Previous Month">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="secondary" size="sm" onClick={goToday}>
              Today
            </Button>
            <Button variant="secondary" size="sm" onClick={nextMonth} aria-label="Next Month">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400 mb-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="py-2 bg-slate-950/40 rounded-t-lg">{d}</div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1.5">
        {calendarDays.map((cell, index) => {
          if (!cell) {
            return <div key={`empty-${index}`} className="min-h-[100px] bg-slate-950/20 rounded-lg border border-slate-900/50" />;
          }

          const dayJobs = jobsByDate[cell.dateStr] || [];
          const isToday = cell.dateStr === todayStr;
          const isSelected = cell.dateStr === activeDayDate;

          return (
            <div
              key={cell.dateStr}
              onClick={() => {
                setActiveDayDate(cell.dateStr);
                if (onSelectDate) onSelectDate(cell.dateStr);
              }}
              className={`min-h-[110px] p-2 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                isToday
                  ? 'bg-red-950/20 border-red-500/40 shadow-lg shadow-red-950/30'
                  : isSelected
                  ? 'bg-slate-800/90 border-slate-500'
                  : 'bg-slate-950/50 border-slate-850 hover:bg-slate-800/50 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${
                  isToday ? 'bg-red-600 text-white' : 'text-slate-300'
                }`}>
                  {cell.dayNumber}
                </span>
                {dayJobs.length > 0 && (
                  <span className="text-[10px] font-semibold text-red-400 bg-red-950/50 px-1.5 py-0.5 rounded-full border border-red-900/50">
                    {dayJobs.length} {dayJobs.length === 1 ? 'pin' : 'pins'}
                  </span>
                )}
              </div>

              {/* Scheduled Pin Badges */}
              <div className="space-y-1 overflow-y-auto max-h-[70px] pr-0.5 custom-scrollbar">
                {dayJobs.slice(0, 3).map(job => (
                  <div
                    key={job.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onItemClick) onItemClick(job);
                    }}
                    className={`text-[11px] p-1 rounded border truncate flex items-center justify-between gap-1 transition-all hover:scale-[1.02] ${getStatusBadgeColor(job.status)}`}
                    title={`${job.title} (${job.scheduledTime || 'No time'})`}
                  >
                    <span className="truncate">{job.title || 'Untitled Pin'}</span>
                    <span className="text-[9px] opacity-75 shrink-0">{job.scheduledTime ? job.scheduledTime.split(' ')[0] : ''}</span>
                  </div>
                ))}
                {dayJobs.length > 3 && (
                  <div className="text-[10px] text-center text-slate-400 font-medium pt-0.5">
                    +{dayJobs.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
