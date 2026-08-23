import React, { useState } from 'react';
import { QueueJob } from '../types';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  PlayCircle, 
  Filter, 
  X, 
  MoveRight,
  ExternalLink,
  Layers
} from 'lucide-react';
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
  const [activeDayModalDate, setActiveDayModalDate] = useState<string | null>(null);

  // Month / Week navigation
  const prevPeriod = () => {
    if (viewMode === 'month') {
      setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    } else {
      setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 7));
    }
  };

  const nextPeriod = () => {
    if (viewMode === 'month') {
      setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    } else {
      setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7));
    }
  };

  const goToday = () => {
    setCurrentDate(new Date());
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString('default', { month: 'long' });

  const getLocalTodayString = (): string => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const todayStr = getLocalTodayString();

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

  // Calculate days for Month View
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarMonthDays = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarMonthDays.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const formattedDay = String(d).padStart(2, '0');
    const formattedMonth = String(month + 1).padStart(2, '0');
    const dateStr = `${year}-${formattedMonth}-${formattedDay}`;
    calendarMonthDays.push({ dayNumber: d, dateStr });
  }

  // Calculate days for Week View (current week Sun -> Sat)
  const currentDayOfWeek = currentDate.getDay();
  const startOfWeek = new Date(currentDate);
  startOfWeek.setDate(currentDate.getDate() - currentDayOfWeek);

  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const formattedDay = String(d.getDate()).padStart(2, '0');
    const formattedMonth = String(d.getMonth() + 1).padStart(2, '0');
    const dateStr = `${d.getFullYear()}-${formattedMonth}-${formattedDay}`;
    weekDays.push({
      dayNumber: d.getDate(),
      dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i],
      dateStr
    });
  }

  const getStatusBadgeColor = (status: QueueJob['status']) => {
    switch (status) {
      case 'completed': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'running': return 'bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse';
      case 'scheduled': return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'failed': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-slate-700/50 text-slate-300 border-slate-600';
    }
  };

  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    e.stopPropagation();
    e.dataTransfer.setData('text/plain', jobId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetDateStr: string) => {
    e.preventDefault();
    const jobId = e.dataTransfer.getData('text/plain');
    if (jobId && onRescheduleItem) {
      onRescheduleItem(jobId, targetDateStr);
    }
  };

  const activeModalJobs = activeDayModalDate ? (jobsByDate[activeDayModalDate] || []) : [];

  return (
    <Card className="p-6 bg-slate-900/90 border-slate-800 backdrop-blur-md relative">
      {/* Calendar Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-gradient-to-br from-red-500/20 to-pink-500/20 rounded-xl border border-red-500/30">
            <CalendarIcon className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <span>{monthName} {year}</span>
              {viewMode === 'week' && (
                <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  Week View
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400">Content Schedule & Drag-and-Drop Rescheduling</p>
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
              <option value="all" className="bg-slate-900 text-slate-200">All Statuses</option>
              <option value="scheduled" className="bg-slate-900 text-purple-300">Scheduled</option>
              <option value="pending" className="bg-slate-900 text-slate-300">Pending</option>
              <option value="completed" className="bg-slate-900 text-emerald-300">Completed</option>
              <option value="failed" className="bg-slate-900 text-red-300">Failed</option>
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
            <Button variant="secondary" size="sm" onClick={prevPeriod} aria-label="Previous Period">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="secondary" size="sm" onClick={goToday}>
              Today
            </Button>
            <Button variant="secondary" size="sm" onClick={nextPeriod} aria-label="Next Period">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* MONTH VIEW */}
      {viewMode === 'month' && (
        <>
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="py-2 bg-slate-950/40 rounded-t-lg">{d}</div>
            ))}
          </div>

          {/* Calendar Month Grid */}
          <div className="grid grid-cols-7 gap-1.5">
            {calendarMonthDays.map((cell, index) => {
              if (!cell) {
                return <div key={`empty-${index}`} className="min-h-[110px] bg-slate-950/20 rounded-lg border border-slate-900/50" />;
              }

              const dayJobs = jobsByDate[cell.dateStr] || [];
              const isToday = cell.dateStr === todayStr;

              return (
                <div
                  key={cell.dateStr}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, cell.dateStr)}
                  onClick={() => {
                    setActiveDayModalDate(cell.dateStr);
                    if (onSelectDate) onSelectDate(cell.dateStr);
                  }}
                  className={`min-h-[115px] p-2 rounded-xl border transition-all cursor-pointer flex flex-col justify-between group ${
                    isToday
                      ? 'bg-red-950/25 border-red-500/50 shadow-lg shadow-red-950/30'
                      : 'bg-slate-950/50 border-slate-850 hover:bg-slate-800/60 hover:border-slate-700'
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

                  {/* Scheduled Pin Badges (Draggable) */}
                  <div className="space-y-1 overflow-y-auto max-h-[75px] pr-0.5 custom-scrollbar">
                    {dayJobs.slice(0, 3).map(job => (
                      <div
                        key={job.id}
                        draggable={true}
                        onDragStart={(e) => handleDragStart(e, job.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onItemClick) onItemClick(job);
                        }}
                        className={`text-[11px] p-1 rounded border truncate flex items-center justify-between gap-1 transition-all hover:scale-[1.02] cursor-grab active:cursor-grabbing ${getStatusBadgeColor(job.status)}`}
                        title={`Drag to reschedule or click to inspect: ${job.title}`}
                      >
                        <span className="truncate">{job.title || 'Untitled Pin'}</span>
                        <span className="text-[9px] opacity-75 shrink-0">{job.scheduledTime ? job.scheduledTime.split(' ')[0] : ''}</span>
                      </div>
                    ))}
                    {dayJobs.length > 3 && (
                      <div className="text-[10px] text-center text-red-400 hover:underline font-medium pt-0.5">
                        +{dayJobs.length - 3} more (click to view)
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* WEEK VIEW */}
      {viewMode === 'week' && (
        <div className="grid grid-cols-7 gap-3 min-h-[350px]">
          {weekDays.map((day) => {
            const dayJobs = jobsByDate[day.dateStr] || [];
            const isToday = day.dateStr === todayStr;

            return (
              <div
                key={day.dateStr}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, day.dateStr)}
                className={`p-3 rounded-xl border flex flex-col justify-between transition-all ${
                  isToday 
                    ? 'bg-red-950/20 border-red-500/50 shadow-md' 
                    : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="pb-2 border-b border-slate-800/80 mb-2">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{day.dayName}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className={`text-base font-bold px-2 py-0.5 rounded-lg ${isToday ? 'bg-red-600 text-white' : 'text-slate-200'}`}>
                      {day.dayNumber}
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">{dayJobs.length} pins</span>
                  </div>
                </div>

                <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[300px] pr-1 custom-scrollbar">
                  {dayJobs.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center p-3 text-[11px] text-slate-500 border border-dashed border-slate-800/60 rounded-lg">
                      Drop pins here
                    </div>
                  ) : (
                    dayJobs.map(job => (
                      <div
                        key={job.id}
                        draggable={true}
                        onDragStart={(e) => handleDragStart(e, job.id)}
                        onClick={() => onItemClick && onItemClick(job)}
                        className={`p-2 rounded-lg border text-xs cursor-grab active:cursor-grabbing hover:scale-[1.01] transition-all space-y-1 ${getStatusBadgeColor(job.status)}`}
                      >
                        <div className="font-medium truncate">{job.title || 'Untitled Pin'}</div>
                        <div className="flex items-center justify-between text-[10px] opacity-80">
                          <span>{job.boardName || 'Target Board'}</span>
                          <span>{job.scheduledTime || 'Queued'}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DAY DETAIL MODAL */}
      {activeDayModalDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-750 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-red-500/20 text-red-400 rounded-lg border border-red-500/30">
                  <CalendarIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Pins for {activeDayModalDate}</h3>
                  <p className="text-xs text-slate-400">{activeModalJobs.length} pins scheduled or recorded on this date</p>
                </div>
              </div>
              <button
                onClick={() => setActiveDayModalDate(null)}
                className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[350px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {activeModalJobs.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  No pins scheduled for this date.
                </div>
              ) : (
                activeModalJobs.map(job => (
                  <div
                    key={job.id}
                    className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between gap-3 hover:border-slate-700 transition-all"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-slate-200 truncate">{job.title || 'Untitled Pin'}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span className="truncate">📁 {job.boardName || 'Target Board'}</span>
                        <span>•</span>
                        <span>⏰ {job.scheduledTime || 'No specific time'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider font-semibold ${getStatusBadgeColor(job.status)}`}>
                        {job.status}
                      </span>
                      {onItemClick && (
                        <Button 
                          variant="secondary" 
                          size="sm"
                          onClick={() => {
                            setActiveDayModalDate(null);
                            onItemClick(job);
                          }}
                        >
                          View
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <Button variant="secondary" onClick={() => setActiveDayModalDate(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};
