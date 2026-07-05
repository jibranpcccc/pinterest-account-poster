import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warn' | 'info';

export interface ToastProps {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  onClose: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({
  id,
  message,
  type,
  duration = 5000,
  onClose
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, duration);
    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  const config = {
    success: {
      bg: 'bg-emerald-950/90 border-emerald-800/80 text-emerald-200',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />
    },
    error: {
      bg: 'bg-rose-950/90 border-rose-800/80 text-rose-200',
      icon: <AlertCircle className="w-5 h-5 text-rose-400" />
    },
    warn: {
      bg: 'bg-amber-950/90 border-amber-800/80 text-amber-200',
      icon: <AlertTriangle className="w-5 h-5 text-amber-400" />
    },
    info: {
      bg: 'bg-blue-950/90 border-blue-800/80 text-blue-200',
      icon: <Info className="w-5 h-5 text-blue-400" />
    }
  };

  return (
    <div className={`flex items-center gap-3 p-4 rounded-xl border backdrop-blur-md shadow-2xl animate-fade-in ${config[type].bg} max-w-sm w-full`}>
      <div className="flex-shrink-0">{config[type].icon}</div>
      <div className="flex-grow text-sm font-medium pr-2">{message}</div>
      <button
        onClick={() => onClose(id)}
        className="flex-shrink-0 text-slate-400 hover:text-slate-200 transition-colors p-0.5 rounded-lg hover:bg-slate-800/50"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
