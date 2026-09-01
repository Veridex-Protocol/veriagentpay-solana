'use client';

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  X,
  Coins
} from 'lucide-react';
import { useTheme } from '../providers/ThemeProvider';

export type DialogVariant = 'danger' | 'warning' | 'info' | 'success';

export interface DialogOptions {
  title: string;
  message: string;
  description?: string;
  badge?: string;
  variant?: DialogVariant;
  confirmText?: string;
  cancelText?: string;
  isAlertOnly?: boolean; // If true, only shows 1 confirm/dismiss button (alert style)
  icon?: React.ReactNode;
}

export interface ConfirmDialogProps {
  isOpen: boolean;
  options: DialogOptions | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  options,
  onConfirm,
  onCancel,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Enter' && !options?.isAlertOnly) {
        onConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onCancel, onConfirm, options?.isAlertOnly]);

  if (!options) return null;

  const variant = options.variant || 'danger';

  // Variant styling configurations
  const config = {
    danger: {
      icon: <AlertTriangle className="w-7 h-7 text-rose-500" />,
      iconBg: isDark ? 'bg-rose-500/15 border-rose-500/30' : 'bg-rose-50 border-rose-200',
      glow: 'shadow-[0_0_35px_rgba(244,63,94,0.18)]',
      borderGlow: isDark ? 'border-rose-500/30' : 'border-rose-300',
      confirmBtn: 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white shadow-lg shadow-rose-950/50 focus:ring-rose-500',
      badgeBg: isDark ? 'bg-rose-950/50 text-rose-300 border-rose-500/30' : 'bg-rose-50 text-rose-700 border-rose-200',
    },
    warning: {
      icon: <AlertTriangle className="w-7 h-7 text-amber-500" />,
      iconBg: isDark ? 'bg-amber-500/15 border-amber-500/30' : 'bg-amber-50 border-amber-200',
      glow: 'shadow-[0_0_35px_rgba(245,158,11,0.18)]',
      borderGlow: isDark ? 'border-amber-500/30' : 'border-amber-300',
      confirmBtn: 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold shadow-lg shadow-amber-950/40 focus:ring-amber-500',
      badgeBg: isDark ? 'bg-amber-950/50 text-amber-300 border-amber-500/30' : 'bg-amber-50 text-amber-700 border-amber-200',
    },
    success: {
      icon: <CheckCircle2 className="w-7 h-7 text-[#F2D827]" />,
      iconBg: isDark ? 'bg-[#F2D827]/15 border-[#F2D827]/30' : 'bg-amber-50 border-[#F2D827]/40',
      glow: 'shadow-[0_0_35px_rgba(242,216,39,0.18)]',
      borderGlow: isDark ? 'border-[#F2D827]/30' : 'border-[#F2D827]/50',
      confirmBtn: 'bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 font-bold shadow-lg shadow-amber-950/40 focus:ring-[#F2D827]',
      badgeBg: isDark ? 'bg-[#F2D827]/10 text-[#F2D827] border-[#F2D827]/30' : 'bg-amber-50 text-amber-900 border-[#F2D827]/40',
    },
    info: {
      icon: <Info className="w-7 h-7 text-cyan-400" />,
      iconBg: isDark ? 'bg-cyan-500/15 border-cyan-500/30' : 'bg-cyan-50 border-cyan-200',
      glow: 'shadow-[0_0_35px_rgba(6,182,212,0.18)]',
      borderGlow: isDark ? 'border-cyan-500/30' : 'border-cyan-300',
      confirmBtn: 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold shadow-lg shadow-cyan-950/50 focus:ring-cyan-500',
      badgeBg: isDark ? 'bg-cyan-950/50 text-cyan-300 border-cyan-500/30' : 'bg-cyan-50 text-cyan-700 border-cyan-200',
    },
  }[variant];

  const renderedIcon = options.icon || config.icon;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          {/* Backdrop Blur Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onCancel}
            className={`fixed inset-0 backdrop-blur-md ${
              isDark ? 'bg-black/80' : 'bg-slate-900/50'
            }`}
          />

          {/* Modal Dialog Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300, mass: 0.7 }}
            className={`relative z-10 w-full max-w-md rounded-3xl p-6 sm:p-7 shadow-2xl border backdrop-blur-2xl transition-colors ${
              config.glow
            } ${
              isDark
                ? `bg-[#0B0F19]/95 text-white ${config.borderGlow}`
                : `bg-white text-slate-900 border-slate-200 shadow-2xl`
            }`}
          >
            {/* Close Button in Top Right */}
            <button
              onClick={onCancel}
              className={`absolute top-4 right-4 p-2 rounded-xl transition-colors ${
                isDark
                  ? 'text-slate-400 hover:text-white hover:bg-white/10'
                  : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100'
              }`}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Icon & Title Header */}
            <div className="flex items-start gap-4 mb-4">
              <div
                className={`shrink-0 w-12 h-12 rounded-2xl border flex items-center justify-center ${config.iconBg}`}
              >
                {renderedIcon}
              </div>

              <div className="space-y-1 pr-6 flex-1">
                <h3 className={`text-lg sm:text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
                  {options.title}
                </h3>
                <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  {options.message}
                </p>
              </div>
            </div>

            {/* Optional Badge / Highlight Info */}
            {options.badge && (
              <div className={`mt-3 mb-4 p-3 rounded-2xl border font-mono text-xs flex items-center justify-between ${config.badgeBg}`}>
                <div className="flex items-center gap-2 font-semibold">
                  <Coins className="w-4 h-4 shrink-0" />
                  <span>Amount / Target:</span>
                </div>
                <span className="font-bold tracking-wider">{options.badge}</span>
              </div>
            )}

            {/* Optional Description / Help Text */}
            {options.description && (
              <div
                className={`mb-5 p-3 rounded-xl border text-[11px] leading-relaxed font-mono ${
                  isDark
                    ? 'bg-slate-950/60 border-white/[0.08] text-slate-400'
                    : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}
              >
                {options.description}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-3 mt-6">
              {!options.isAlertOnly && (
                <button
                  type="button"
                  onClick={onCancel}
                  className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold transition border ${
                    isDark
                      ? 'border-white/10 bg-slate-900/60 hover:bg-white/10 text-slate-300 hover:text-white'
                      : 'border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-950'
                  }`}
                >
                  {options.cancelText || 'Cancel'}
                </button>
              )}

              <button
                type="button"
                onClick={onConfirm}
                autoFocus
                className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  isDark ? 'focus:ring-offset-slate-950' : 'focus:ring-offset-white'
                } ${config.confirmBtn}`}
              >
                {options.confirmText || (options.isAlertOnly ? 'Got It' : 'Confirm')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
