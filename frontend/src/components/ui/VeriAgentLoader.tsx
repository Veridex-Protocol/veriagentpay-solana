'use client';

import React, { useId } from 'react';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';

export type LoaderSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
export type LoaderVariant = 'fullscreen' | 'card' | 'badge' | 'emblem' | 'inline';
export type LoaderSpeed = 'slow' | 'normal' | 'fast';

export interface VeriAgentLoaderProps {
  /** Size preset or custom pixel number */
  size?: LoaderSize;
  /** Visual presentation mode */
  variant?: LoaderVariant;
  /** Main loading status or brand title */
  text?: React.ReactNode;
  /** Secondary explanatory subtext or step progress */
  subtext?: React.ReactNode;
  /** Whether to show the glowing ambient backdrop aura */
  glow?: boolean;
  /** Animation speed modifier */
  speed?: LoaderSpeed;
  /** Show animated loading ellipsis dots in the text */
  showDots?: boolean;
  /** Optional animated progress bar */
  showProgress?: boolean;
  /** Optional progress value (0 to 100). If omitted, an indeterminate scanning bar is shown */
  progress?: number;
  /** Custom extra CSS classes */
  className?: string;
  /** Dark/Light mode adaptation or force dark */
  theme?: 'dark' | 'auto';
}

const SIZE_MAP: Record<string, number> = {
  xs: 24,
  sm: 38,
  md: 60,
  lg: 92,
  xl: 128,
};

const LOGO_PATH =
  'M183.48 126.69L122.643 232.061C115.027 245.252 115.027 261.503 122.643 274.692C130.258 287.882 144.332 296.008 159.562 296.008H262.061L201.224 401.38C193.608 414.57 179.535 422.695 164.304 422.695C149.074 422.695 135 414.57 127.385 401.38L5.71142 190.636C-1.9038 177.445 -1.9038 161.195 5.71142 148.005C13.3266 134.815 27.4004 126.69 42.6309 126.69H183.48ZM183.48 126.69L244.316 21.3173C251.931 8.12702 266.005 0.00192412 281.235 0.00192412C296.466 0.00192412 310.54 8.12702 318.155 21.3173L439.828 232.061C447.443 245.252 447.443 261.503 439.828 274.692C432.213 287.882 418.139 296.008 402.909 296.008H262.061L322.897 190.636C330.512 177.445 330.512 161.195 322.897 148.005C315.282 134.815 301.208 126.69 285.978 126.69H183.48Z';

/**
 * Pure SVG Logo Mark with Laser Stroke Tracer, Neon Bloom & Ambient Depth
 */
export const VeriAgentLogoMark: React.FC<{
  size: number;
  speed?: LoaderSpeed;
  withSquircle?: boolean;
  glow?: boolean;
  className?: string;
}> = ({ size, speed = 'normal', withSquircle = true, glow = true, className }) => {
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, '');

  const tracerClass =
    speed === 'fast'
      ? 'va-logo-tracer-fast'
      : speed === 'slow'
        ? 'va-logo-tracer-slow'
        : 'va-logo-tracer';

  if (!withSquircle) {
    // Pure Emblem SVG (ViewBox 0 0 446 423)
    return (
      <div
        className={clsx('relative inline-flex items-center justify-center select-none', className)}
        style={{ width: size, height: size }}
      >
        {glow && (
          <div
            className="absolute inset-0 rounded-full bg-[#F2D827]/25 va-loader-halo pointer-events-none"
            style={{ transform: 'scale(0.85)', filter: 'blur(16px)' }}
          />
        )}
        <svg
          width={size}
          height={size}
          viewBox="0 0 446 423"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative z-10 overflow-visible"
        >
          <defs>
            <linearGradient id={`grad-emblem-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFF275" />
              <stop offset="45%" stopColor="#F2D827" />
              <stop offset="100%" stopColor="#E5A900" />
            </linearGradient>
            <linearGradient id={`laser-emblem-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="30%" stopColor="#FFF48F" />
              <stop offset="70%" stopColor="#F2D827" />
              <stop offset="100%" stopColor="#FF9E00" />
            </linearGradient>
            <filter id={`bloom-emblem-${id}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur1" />
              <feGaussianBlur stdDeviation="14" result="blur2" />
              <feMerge>
                <feMergeNode in="blur2" />
                <feMergeNode in="blur1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Semi-transparent pulsing base fill */}
          <path
            d={LOGO_PATH}
            fill={`url(#grad-emblem-${id})`}
            className="va-logo-fill-pulse"
          />

          {/* Ambient outer glow stroke */}
          <path
            d={LOGO_PATH}
            fill="none"
            stroke="#F2D827"
            strokeWidth="10"
            strokeOpacity="0.4"
            filter={`url(#bloom-emblem-${id})`}
          />

          {/* High-intensity traveling laser stroke tracer */}
          <path
            d={LOGO_PATH}
            fill="none"
            stroke={`url(#laser-emblem-${id})`}
            strokeWidth="12"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={tracerClass}
          />
        </svg>
      </div>
    );
  }

  // Full Squircle Version (ViewBox 0 0 512 512)
  return (
    <div
      className={clsx('relative inline-flex items-center justify-center select-none', className)}
      style={{ width: size, height: size }}
    >
      {/* Dynamic Golden Halo Backlight */}
      {glow && (
        <div
          className="absolute -inset-2 rounded-3xl bg-[#F2D827]/20 va-loader-halo pointer-events-none"
          style={{ filter: 'blur(24px)' }}
        />
      )}

      {/* Main Squircle SVG with Multi-Layer Animation */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 overflow-visible drop-shadow-2xl"
      >
        <defs>
          {/* Squircle Dark Obsidian Gradient */}
          <radialGradient id={`bg-radial-${id}`} cx="50%" cy="20%" r="90%">
            <stop offset="0%" stopColor="#181822" />
            <stop offset="50%" stopColor="#0E0E15" />
            <stop offset="100%" stopColor="#07070A" />
          </radialGradient>

          {/* Yellow Emblem Gradient */}
          <linearGradient id={`grad-logo-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFF59D" />
            <stop offset="35%" stopColor="#F2D827" />
            <stop offset="100%" stopColor="#D89E00" />
          </linearGradient>

          {/* High-Energy Laser Tracer Gradient */}
          <linearGradient id={`laser-grad-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="25%" stopColor="#FFF9A6" />
            <stop offset="70%" stopColor="#F2D827" />
            <stop offset="100%" stopColor="#FF8C00" />
          </linearGradient>

          {/* Squircle Border Glow Gradient */}
          <linearGradient id={`border-grad-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F2D827" stopOpacity="0.45" />
            <stop offset="50%" stopColor="#F2D827" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#F2D827" stopOpacity="0.30" />
          </linearGradient>

          {/* Neon Bloom Filter */}
          <filter id={`neon-glow-${id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" result="blur1" />
            <feGaussianBlur stdDeviation="16" result="blur2" />
            <feMerge>
              <feMergeNode in="blur2" />
              <feMergeNode in="blur1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Squircle Background Body */}
        <rect width="512" height="512" rx="112" fill={`url(#bg-radial-${id})`} />

        {/* Subtle Inner Glass Vignette */}
        <rect
          x="1.5"
          y="1.5"
          width="509"
          height="509"
          rx="110.5"
          fill="none"
          stroke={`url(#border-grad-${id})`}
          strokeWidth="3"
        />

        {/* Emblem Group */}
        <g transform="translate(33, 44.5)">
          {/* Base Breathing Fill */}
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d={LOGO_PATH}
            fill={`url(#grad-logo-${id})`}
            className="va-logo-fill-pulse"
          />

          {/* Subtle Base Stroke Guideline */}
          <path
            d={LOGO_PATH}
            fill="none"
            stroke="#F2D827"
            strokeWidth="5"
            strokeOpacity="0.22"
          />

          {/* Bloom Stroke Layer */}
          <path
            d={LOGO_PATH}
            fill="none"
            stroke="#F2D827"
            strokeWidth="10"
            strokeOpacity="0.5"
            filter={`url(#neon-glow-${id})`}
          />

          {/* Dynamic Laser Stroke Tracer */}
          <path
            d={LOGO_PATH}
            fill="none"
            stroke={`url(#laser-grad-${id})`}
            strokeWidth="12"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={tracerClass}
          />
        </g>
      </svg>
    </div>
  );
};

/**
 * Animated Loading Dots Component
 */
export const LoadingDots: React.FC<{ className?: string }> = ({ className }) => (
  <span className={clsx('inline-flex items-center gap-1 font-mono select-none', className)}>
    <span className="va-dot-1 w-1.5 h-1.5 rounded-full bg-[#CA8A04] dark:bg-[#F2D827]" />
    <span className="va-dot-2 w-1.5 h-1.5 rounded-full bg-[#CA8A04] dark:bg-[#F2D827]" />
    <span className="va-dot-3 w-1.5 h-1.5 rounded-full bg-[#CA8A04] dark:bg-[#F2D827]" />
  </span>
);

/**
 * Animated Progress Bar Component
 */
export const LoadingProgressBar: React.FC<{
  progress?: number;
  className?: string;
}> = ({ progress, className }) => {
  const isIndeterminate = progress === undefined;

  return (
    <div
      className={clsx(
        'w-full h-1.5 bg-slate-200/90 dark:bg-white/10 rounded-full overflow-hidden relative backdrop-blur-sm',
        className
      )}
    >
      {isIndeterminate ? (
        <div
          className="h-full rounded-full bg-gradient-to-r from-transparent via-[#CA8A04] dark:via-[#F2D827] to-transparent w-1/2 absolute"
          style={{
            animation: 'va-shimmer-pass 1.6s ease-in-out infinite',
          }}
        />
      ) : (
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[#F2D827] to-[#EAB308] dark:from-[#F2D827] dark:to-[#FFAA00] shadow-[0_0_10px_rgba(234,179,8,0.4)] dark:shadow-[0_0_12px_rgba(242,216,39,0.8)]"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      )}
    </div>
  );
};

/**
 * The Master VeriAgent Loader Component
 */
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

  // 1. INLINE VARIANT
  if (variant === 'inline') {
    const inlineSize = typeof size === 'number' ? size : size === 'xs' ? 18 : 24;
    return (
      <div className={clsx('inline-flex items-center gap-2.5 select-none', className)}>
        <VeriAgentLogoMark
          size={inlineSize}
          speed={speed}
          withSquircle={false}
          glow={false}
        />
        {text && (
          <span className="text-sm font-medium text-slate-800 dark:text-slate-200 inline-flex items-center gap-1">
            {text}
            {showDots && <LoadingDots className="ml-0.5" />}
          </span>
        )}
      </div>
    );
  }

  // 2. EMBLEM VARIANT (NO SQUIRCLE)
  if (variant === 'emblem') {
    return (
      <div className={clsx('flex flex-col items-center justify-center text-center select-none', className)}>
        <div className="va-loader-levitate">
          <VeriAgentLogoMark
            size={pixelSize}
            speed={speed}
            withSquircle={false}
            glow={glow}
          />
        </div>
        {text && (
          <div className="mt-3 space-y-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center justify-center gap-1.5">
              {text}
              {showDots && <LoadingDots />}
            </p>
            {subtext && <p className="text-xs text-slate-600 dark:text-slate-400 font-mono">{subtext}</p>}
          </div>
        )}
      </div>
    );
  }

  // 3. BADGE VARIANT (SQUIRCLE ICON ONLY)
  if (variant === 'badge') {
    return (
      <div className={clsx('flex flex-col items-center justify-center text-center select-none', className)}>
        <div className="va-loader-levitate">
          <VeriAgentLogoMark
            size={pixelSize}
            speed={speed}
            withSquircle={true}
            glow={glow}
          />
        </div>
        {text && (
          <div className="mt-4 space-y-1">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 flex items-center justify-center gap-1.5">
              <span>{text}</span>
              {showDots && <LoadingDots />}
            </p>
            {subtext && <p className="text-xs text-slate-600 dark:text-slate-400 font-mono">{subtext}</p>}
          </div>
        )}
      </div>
    );
  }

  // 4. CARD VARIANT (EMBEDDED GLASS CONTAINER)
  if (variant === 'card') {
    const cardLogoSize = typeof size === 'number' ? size : size === 'lg' || size === 'xl' ? pixelSize : 64;
    return (
      <div
        className={clsx(
          'relative w-full max-w-sm mx-auto p-6 md:p-8 rounded-3xl bg-white/95 dark:bg-[#0C0C12]/90 border border-slate-200/90 dark:border-white/10 backdrop-blur-xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-2xl text-center select-none overflow-hidden',
          className
        )}
      >
        {/* Subtle Ambient Card Gradient */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#F2D827]/12 dark:bg-[#F2D827]/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center space-y-5">
          <div className="va-loader-levitate">
            <VeriAgentLogoMark
              size={cardLogoSize}
              speed={speed}
              withSquircle={true}
              glow={glow}
            />
          </div>

          <div className="space-y-1.5 w-full">
            <h4 className="text-base font-semibold tracking-wide flex items-center justify-center gap-1.5">
              <span className="va-text-gradient-shimmer">{text || 'VeriAgent Pay'}</span>
              {showDots && <LoadingDots />}
            </h4>
            {subtext && (
              <p className="text-xs font-mono text-slate-600 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
                {subtext}
              </p>
            )}
          </div>

          {showProgress && (
            <div className="w-full pt-1">
              <LoadingProgressBar progress={progress} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // 5. FULLSCREEN VARIANT (PAGE SPLASH / OVERLAY)
  const fullSize = typeof size === 'number' ? size : size === 'xl' ? 120 : 88;
  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-[#FAFAFB] dark:bg-[#070A11] text-slate-900 dark:text-slate-100 overflow-hidden select-none',
        className
      )}
    >
      {/* Background Atmosphere Gradients */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] bg-[#F2D827]/15 dark:bg-[#F2D827]/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-96 h-40 bg-slate-200/50 dark:bg-white/[0.02] rounded-full blur-3xl" />
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.035] dark:opacity-[0.03]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      {/* Main Glassmorphic Splash Card */}
      <div className="relative z-10 w-full max-w-md p-8 md:p-10 rounded-3xl bg-white/95 dark:bg-[#0C0C12]/85 border border-slate-200/90 dark:border-white/10 backdrop-blur-2xl shadow-[0_25px_70px_-15px_rgba(0,0,0,0.1),0_0_1px_rgba(0,0,0,0.05)] dark:shadow-[0_25px_80px_rgba(0,0,0,0.85)] text-center">
        {/* Ambient Top Glow in Card */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-[#F2D827]/15 dark:bg-[#F2D827]/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center space-y-6">
          {/* Logo with levitation & glow */}
          <div className="va-loader-levitate">
            <VeriAgentLogoMark
              size={fullSize}
              speed={speed}
              withSquircle={true}
              glow={glow}
            />
          </div>

          {/* Typography */}
          <div className="space-y-2 w-full">
            <h3 className="text-xl font-bold tracking-tight flex items-center justify-center gap-2">
              <span className="va-text-gradient-shimmer">
                {text || 'VeriAgent Pay'}
              </span>
              {showDots && <LoadingDots />}
            </h3>
            <p className="text-sm font-mono text-slate-600 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
              {subtext || 'Connecting to decentralized agent settlement network...'}
            </p>
          </div>

          {/* Animated Progress / Scanner */}
          <div className="w-full max-w-xs pt-1">
            <LoadingProgressBar progress={progress} />
          </div>

          {/* Brand Tag Footer */}
          <div className="pt-2 flex items-center justify-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400/70 uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-[#CA8A04] dark:bg-[#F2D827]/80 animate-ping" />
            <span>Autonomous Settlement</span>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Layout & Route level screen component
 */
export const VeriAgentLoadingScreen: React.FC<{
  title?: string;
  subtitle?: string;
  progress?: number;
}> = ({ title = 'VeriAgent Pay', subtitle = 'Loading secure session...', progress }) => (
  <VeriAgentLoader
    variant="fullscreen"
    size="lg"
    text={title}
    subtext={subtitle}
    showProgress={true}
    progress={progress}
  />
);

export default VeriAgentLoader;

