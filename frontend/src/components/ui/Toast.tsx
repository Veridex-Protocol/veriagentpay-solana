'use client';

import React, { useEffect, useState } from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  AlertTriangle, 
  X, 
  Loader2,
  ExternalLink
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from '../providers/ThemeProvider';

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'loading';

export interface ToastItem {
  id: string;
  title?: string;
  message: string;
  type?: ToastType;
  duration?: number; // ms, default 4000 (0 for sticky)
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface ToastProps {
  toast: ToastItem;
  onClose: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const duration = toast.duration ?? (toast.type === 'loading' ? 0 : 4500);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (duration <= 0 || isPaused) return;

    const timer = setTimeout(() => {
      onClose(toast.id);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, isPaused, onClose, toast.id]);

  const type = toast.type || 'info';

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-[#F2D827] shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
    info: <Info className="w-5 h-5 text-[#F2D827] shrink-0" />,
    loading: <Loader2 className="w-5 h-5 text-[#F2D827] animate-spin shrink-0" />,
  };

  const borders = {
    success: isDark ? 'border-[#F2D827]/30 bg-[#F2D827]/10' : 'border-[#F2D827]/40 bg-amber-50/80',
    error: isDark ? 'border-rose-500/30 bg-rose-950/20' : 'border-rose-200 bg-rose-50/80',
    warning: isDark ? 'border-amber-500/30 bg-amber-950/20' : 'border-amber-200 bg-amber-50/80',
    info: isDark ? 'border-white/20 bg-white/5' : 'border-slate-200 bg-slate-50/80',
    loading: isDark ? 'border-[#F2D827]/30 bg-[#F2D827]/10' : 'border-[#F2D827]/40 bg-amber-50/80',
  };

  const progressColors = {
    success: 'bg-[#F2D827]',
    error: 'bg-rose-500',
    warning: 'bg-amber-500',
    info: 'bg-[#F2D827]',
    loading: 'bg-[#F2D827]',
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.15 } }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={`relative overflow-hidden w-full max-w-sm sm:max-w-md rounded-2xl border shadow-2xl backdrop-blur-xl p-4 transition-colors ${
        borders[type]
      } ${
        isDark
          ? 'bg-[#0B0F19]/95 text-white shadow-[0_10px_30px_rgba(0,0,0,0.5)]'
          : 'bg-white/95 text-slate-900 shadow-slate-300/50'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="pt-0.5">{icons[type]}</div>

        <div className="flex-1 min-w-0 pr-2">
          {toast.title && (
            <h4 className={`text-xs font-bold font-mono uppercase tracking-wider mb-0.5 ${
              isDark ? 'text-white' : 'text-slate-950'
            }`}>
              {toast.title}
            </h4>
          )}
          <p className={`text-xs sm:text-sm font-medium leading-snug break-words ${
            isDark ? 'text-slate-300' : 'text-slate-700'
          }`}>
            {toast.message}
          </p>

          {toast.action && (
            <button
              onClick={() => {
                toast.action?.onClick();
                onClose(toast.id);
              }}
              className="mt-2 text-xs font-bold text-[#F2D827] hover:text-[#E5A900] underline flex items-center gap-1"
            >
              <span>{toast.action.label}</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>

        <button
          onClick={() => onClose(toast.id)}
          className={`shrink-0 p-1 rounded-lg transition-colors ${
            isDark
              ? 'text-slate-400 hover:text-white hover:bg-white/10'
              : 'text-slate-400 hover:text-slate-950 hover:bg-slate-200'
          }`}
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Auto-dismiss animated progress bar */}
      {duration > 0 && (
        <motion.div
          initial={{ width: '100%' }}
          animate={{ width: isPaused ? undefined : '0%' }}
          transition={{ duration: duration / 1000, ease: 'linear' }}
          className={`absolute bottom-0 left-0 h-0.5 ${progressColors[type]} opacity-60`}
        />
      )}
    </motion.div>
  );
};
