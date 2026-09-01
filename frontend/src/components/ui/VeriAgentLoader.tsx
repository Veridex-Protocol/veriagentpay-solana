'use client';

import React from 'react';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import { OfficialLogoMark } from './OfficialBrand';

export type LoaderSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
export type LoaderVariant = 'fullscreen' | 'card' | 'badge' | 'emblem' | 'inline';
export type LoaderSpeed = 'slow' | 'normal' | 'fast';

export interface VeriAgentLoaderProps {
  size?: LoaderSize;
  variant?: LoaderVariant;
  text?: React.ReactNode;
  subtext?: React.ReactNode;
  glow?: boolean;
  speed?: LoaderSpeed;
  showDots?: boolean;
  showProgress?: boolean;
  progress?: number;
  className?: string;
  theme?: 'dark' | 'auto';
}

const SIZE_MAP: Record<string, number> = {
  xs: 24,
  sm: 38,
  md: 60,
  lg: 92,
  xl: 128,
};

export const VeriAgentLogoMark: React.FC<{
  size: number;
  speed?: LoaderSpeed;
  withSquircle?: boolean;
  glow?: boolean;
  className?: string;
}> = ({ size, speed = 'normal', withSquircle = true, glow = true, className }) => {
  const duration = speed === 'fast' ? 0.85 : speed === 'slow' ? 1.8 : 1.25;
  return (
    <span
      className={clsx('relative inline-flex shrink-0 items-center justify-center select-none', className)}
      style={{ width: size, height: size }}
    >
      {glow && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-[#F2D827]/20 blur-xl"
        />
      )}
      <motion.span
        animate={{ opacity: [0.72, 1, 0.72], scale: [0.97, 1, 0.97] }}
        className="relative z-10 inline-flex"
        transition={{ duration, ease: 'easeInOut', repeat: Infinity }}
      >
        <OfficialLogoMark size={size} withSquircle={withSquircle} />
      </motion.span>
    </span>
  );
};

export const LoadingDots: React.FC<{ className?: string }> = ({ className }) => (
  <span className={clsx('inline-flex items-center gap-1 font-mono select-none', className)}>
    <span className="va-dot-1 h-1.5 w-1.5 rounded-full bg-[#CA8A04] dark:bg-[#F2D827]" />
    <span className="va-dot-2 h-1.5 w-1.5 rounded-full bg-[#CA8A04] dark:bg-[#F2D827]" />
    <span className="va-dot-3 h-1.5 w-1.5 rounded-full bg-[#CA8A04] dark:bg-[#F2D827]" />
  </span>
);

export const LoadingProgressBar: React.FC<{
  progress?: number;
  className?: string;
}> = ({ progress, className }) => {
  const isIndeterminate = progress === undefined;
  return (
    <div
      className={clsx(
        'relative h-1.5 w-full overflow-hidden rounded-full bg-slate-200/90 dark:bg-white/10',
        className,
      )}
    >
      {isIndeterminate ? (
        <div
          className="absolute h-full w-1/2 rounded-full bg-gradient-to-r from-transparent via-[#F2D827] to-transparent"
          style={{ animation: 'va-shimmer-pass 1.6s ease-in-out infinite' }}
        />
      ) : (
        <motion.div
          animate={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          className="h-full rounded-full bg-[#F2D827] shadow-[0_0_12px_rgba(242,216,39,0.7)]"
          initial={{ width: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      )}
    </div>
  );
};

export const VeriAgentLoader: React.FC<VeriAgentLoaderProps> = ({
  size = 'md',
  variant = 'badge',
  text,
  subtext,
  glow = true,
  speed = 'normal',
  showDots = true,
  showProgress = false,
  progress,
  className,
}) => {
  const pixelSize = typeof size === 'number' ? size : SIZE_MAP[size] || 60;
  const mark = (
    <VeriAgentLogoMark
      glow={glow}
      size={variant === 'inline' ? Math.min(pixelSize, 24) : pixelSize}
      speed={speed}
      withSquircle={variant !== 'emblem' && variant !== 'inline'}
    />
  );
  const label = text ? (
    <div className="space-y-1 text-center">
      <div className="flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <span>{text}</span>
        {showDots && <LoadingDots />}
      </div>
      {subtext && <p className="font-mono text-xs text-slate-600 dark:text-slate-400">{subtext}</p>}
    </div>
  ) : null;

  if (variant === 'inline') {
    return (
      <div className={clsx('inline-flex items-center gap-2.5 select-none', className)}>
        {mark}
        {text && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-800 dark:text-slate-200">
            {text}
            {showDots && <LoadingDots className="ml-0.5" />}
          </span>
        )}
      </div>
    );
  }

  if (variant === 'fullscreen') {
    return (
      <div
        className={clsx(
          'fixed inset-0 z-50 flex items-center justify-center bg-[#FAFAFB] p-6 text-slate-900 dark:bg-[#070A11] dark:text-slate-100',
          className,
        )}
      >
        <div className="relative w-full max-w-md border border-slate-200 bg-white/95 p-8 text-center shadow-2xl dark:border-white/10 dark:bg-[#0C0C12]/90">
          <div className="flex flex-col items-center gap-6">
            {mark}
            {label}
            <LoadingProgressBar progress={progress} />
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div
        className={clsx(
          'mx-auto w-full max-w-sm border border-slate-200 bg-white/95 p-6 text-center shadow-xl dark:border-white/10 dark:bg-[#0C0C12]/90',
          className,
        )}
      >
        <div className="flex flex-col items-center gap-5">
          {mark}
          {label}
          {showProgress && <LoadingProgressBar progress={progress} />}
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('flex flex-col items-center justify-center gap-4 text-center select-none', className)}>
      {mark}
      {label}
      {showProgress && <LoadingProgressBar progress={progress} />}
    </div>
  );
};

export const VeriAgentLoadingScreen: React.FC<{
  title?: string;
  subtitle?: string;
  progress?: number;
}> = ({ title = 'VeriAgent Pay', subtitle = 'Loading secure session...', progress }) => (
  <VeriAgentLoader
    progress={progress}
    showProgress
    size="lg"
    subtext={subtitle}
    text={title}
    variant="fullscreen"
  />
);

export default VeriAgentLoader;
