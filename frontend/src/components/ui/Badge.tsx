import React from 'react';
import { clsx } from 'clsx';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'yellow' | 'emerald' | 'purple' | 'blue' | 'amber' | 'slate' | 'red';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'yellow',
  size = 'md',
  icon,
}) => {
  const variantStyles = {
    yellow: 'bg-[#F2D827]/15 text-[#D4A106] dark:text-[#F2D827] border-[#F2D827]/30',
    emerald: 'bg-[#F2D827]/15 text-[#D4A106] dark:text-[#F2D827] border-[#F2D827]/30',
    purple: 'bg-white/10 text-white border-white/20',
    blue: 'bg-white/10 text-white border-white/20',
    amber: 'bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30',
    slate: 'bg-slate-800 text-slate-300 border-slate-700 light:bg-slate-100 light:text-slate-700 light:border-slate-300',
    red: 'bg-brand-danger/15 text-red-400 border-brand-danger/30',
  };

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-[10px] gap-1 rounded-md font-semibold',
    md: 'px-2.5 py-1 text-xs gap-1.5 rounded-lg font-semibold',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center border border-solid tracking-wide uppercase',
        variantStyles[variant],
        sizeStyles[size]
      )}
    >
      {icon}
      <span>{children}</span>
    </span>
  );
};
