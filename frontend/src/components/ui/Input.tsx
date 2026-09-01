'use client';

import React from 'react';
import { clsx } from 'clsx';
import { useTheme } from '../providers/ThemeProvider';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, leftIcon, rightElement, className, ...props }, ref) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label className={`block text-xs font-semibold uppercase tracking-wider ${
            isDark ? 'text-slate-400' : 'text-slate-600'
          }`}>
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className={`absolute left-3.5 pointer-events-none ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}>
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            className={clsx(
              'w-full rounded-xl border px-4 py-3 text-sm font-semibold transition-colors focus:outline-none focus:border-[#F2D827] focus:ring-1 focus:ring-[#F2D827]/40',
              isDark
                ? 'bg-slate-900 border-slate-800 text-white placeholder-slate-500'
                : 'bg-slate-50 border-slate-200 text-slate-950 placeholder-slate-400',
              leftIcon && 'pl-10',
              rightElement && 'pr-12',
              error && 'border-red-500/60 focus:border-red-500 focus:ring-red-500/30',
              className
            )}
            {...props}
          />
          {rightElement && (
            <div className="absolute right-3 flex items-center">
              {rightElement}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
