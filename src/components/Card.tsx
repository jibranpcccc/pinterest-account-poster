import React from 'react';

interface CardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  headerAction?: React.ReactNode;
  className?: string;
  accent?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  headerAction,
  className = '',
  accent = false
}) => {
  return (
    <div className={`${accent ? 'glass-panel-accent' : 'glass-panel'} rounded-2xl p-6 shadow-lg card-hover ${className}`}>
      {(title || subtitle || headerAction) && (
        <div className="flex items-center justify-between gap-4 mb-5 border-b border-slate-800/40 pb-4">
          <div className="flex items-center gap-3">
            {title && (
              <div className="w-1 h-5 rounded-full bg-gradient-to-b from-violet-500 to-pink-500 flex-shrink-0" />
            )}
            <div>
              {title && <h2 className="text-lg font-bold text-slate-100 tracking-tight">{title}</h2>}
              {subtitle && <p className="text-[11px] text-slate-500 mt-0.5 font-medium">{subtitle}</p>}
            </div>
          </div>
          {headerAction && <div className="flex-shrink-0">{headerAction}</div>}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
};
