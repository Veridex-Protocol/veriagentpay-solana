'use client';

import React, { useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  PiggyBank,
  ArrowDownCircle,
  Gift,
  Users,
  Repeat,
  Share2,
  Award,
  BookUser,
  Settings,
  Grid,
  X,
  WalletCards,
} from 'lucide-react';
import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';

export interface FeatureItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  glowBg: string;
  glowBorder: string;
  badge?: string;
  description?: string;
  onClick?: () => void;
}

export interface FeaturesModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  features?: FeatureItem[];
  onSelectFeature?: (feature: FeatureItem) => void;
  className?: string;
}

export const defaultFeaturesList: FeatureItem[] = [
  {
    id: 'sent-payments',
    label: 'Sent Payments',
    href: '/send#sent-payments',
    icon: WalletCards,
    color: 'text-[#F2D827]',
    glowBg: 'bg-[#F2D827]/10 dark:bg-[#F2D827]/10 light:bg-amber-50',
    glowBorder: 'border-[#F2D827]/20 dark:border-[#F2D827]/20 light:border-[#F2D827]/30',
    description: 'Track direct and claim-link payments',
  },
  {
    id: 'pools',
    label: 'Group Pools',
    href: '/pools',
    icon: PiggyBank,
    color: 'text-[#F2D827]',
    glowBg: 'bg-[#F2D827]/10 dark:bg-[#F2D827]/10 light:bg-amber-50',
    glowBorder: 'border-[#F2D827]/20 dark:border-[#F2D827]/20 light:border-[#F2D827]/30',
  },
  {
    id: 'requests',
    label: 'Payment Requests',
    href: '/requests',
    icon: ArrowDownCircle,
    color: 'text-[#F2D827]',
    glowBg: 'bg-[#F2D827]/10 dark:bg-[#F2D827]/10 light:bg-amber-50',
    glowBorder: 'border-[#F2D827]/20 dark:border-[#F2D827]/20 light:border-[#F2D827]/30',
    description: 'Create & manage payment requests',
  },
  {
    id: 'envelopes',
    label: 'Red Envelopes',
    href: '/envelopes',
    icon: Gift,
    color: 'text-[#F2D827]',
    glowBg: 'bg-[#F2D827]/10 dark:bg-[#F2D827]/10 light:bg-amber-50',
    glowBorder: 'border-[#F2D827]/20 dark:border-[#F2D827]/20 light:border-[#F2D827]/30',
  },
  {
    id: 'splits',
    label: 'Group Splits',
    href: '/splits',
    icon: Users,
    color: 'text-[#F2D827]',
    glowBg: 'bg-[#F2D827]/10 dark:bg-[#F2D827]/10 light:bg-amber-50',
    glowBorder: 'border-[#F2D827]/20 dark:border-[#F2D827]/20 light:border-[#F2D827]/30',
  },
  {
    id: 'subscriptions',
    label: 'Recurring Pay',
    href: '/subscriptions',
    icon: Repeat,
    color: 'text-[#F2D827]',
    glowBg: 'bg-[#F2D827]/10 dark:bg-[#F2D827]/10 light:bg-amber-50',
    glowBorder: 'border-[#F2D827]/20 dark:border-[#F2D827]/20 light:border-[#F2D827]/30',
  },
  {
    id: 'referral',
    label: 'Referrals',
    href: '/referral',
    icon: Share2,
    color: 'text-[#F2D827]',
    glowBg: 'bg-[#F2D827]/10 dark:bg-[#F2D827]/10 light:bg-amber-50',
    glowBorder: 'border-[#F2D827]/20 dark:border-[#F2D827]/20 light:border-[#F2D827]/30',
  },
  {
    id: 'badges',
    label: 'Badges',
    href: '/badges',
    icon: Award,
    color: 'text-[#F2D827]',
    glowBg: 'bg-[#F2D827]/10 dark:bg-[#F2D827]/10 light:bg-amber-50',
    glowBorder: 'border-[#F2D827]/20 dark:border-[#F2D827]/20 light:border-[#F2D827]/30',
  },
  {
    id: 'contacts',
    label: 'Contacts',
    href: '/contacts',
    icon: BookUser,
    color: 'text-[#F2D827]',
    glowBg: 'bg-[#F2D827]/10 dark:bg-[#F2D827]/10 light:bg-amber-50',
    glowBorder: 'border-[#F2D827]/20 dark:border-[#F2D827]/20 light:border-[#F2D827]/30',
  },
  {
    id: 'settings',
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    color: 'text-slate-400',
    glowBg: 'bg-slate-500/10 dark:bg-slate-500/10 light:bg-slate-100',
    glowBorder: 'border-slate-500/20 dark:border-slate-500/20 light:border-slate-300',
  },
];

export const FeaturesModal: React.FC<FeaturesModalProps> = ({
  isOpen,
  onClose,
  title = 'Features',
  features = defaultFeaturesList,
  onSelectFeature,
  className,
}) => {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-md"
          />

          {/* Seamless Integrated Panel */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={clsx(
              'relative z-10 w-full max-w-md bg-[#070A11]/90 dark:bg-[#070A11]/90 light:bg-white/90 backdrop-blur-xl border border-white/[0.06] dark:border-white/[0.06] light:border-slate-200/60 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl',
              className
            )}
          >
            {/* Header Bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.025] dark:border-white/[0.025] light:border-slate-200/30">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#F2D827]/10 border border-[#F2D827]/20 text-[#F2D827] shadow-inner">
                  <Grid className="w-4 h-4" />
                </div>
                <h2 className="text-base font-semibold text-slate-100 dark:text-slate-100 light:text-slate-900 tracking-tight">
                  {title}
                </h2>
              </div>
              <button
                onClick={onClose}
                aria-label="Close features menu"
                className="p-2 text-slate-400 hover:text-white dark:hover:text-white light:hover:text-slate-900 hover:bg-white/[0.04] dark:hover:bg-white/[0.04] light:hover:bg-slate-200/50 rounded-full transition-colors"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            {/* Integrated Seamless 3x3 Grid with Whisper-Thin Faint Hairline Dividers */}
            <div className="grid grid-cols-3 divide-x divide-y divide-white/[0.015] dark:divide-white/[0.015] light:divide-slate-200/25">
              {features.map((feature, idx) => {
                const Icon = feature.icon;
                const isThirdInRow = (idx + 1) % 3 === 0;

                return (
                  <Link
                    key={feature.id}
                    href={feature.href}
                    onClick={() => {
                      if (feature.onClick) feature.onClick();
                      if (onSelectFeature) onSelectFeature(feature);
                      onClose();
                    }}
                    className={clsx(
                      'group relative bg-transparent p-5 flex flex-col items-center justify-center gap-3 transition-all duration-200 hover:bg-white/[0.04] dark:hover:bg-white/[0.04] light:hover:bg-slate-100/80 active:scale-[0.97]',
                      // Whisper-thin, barely-there hairline dividers for grid cells
                      'border-b border-r border-white/[0.015] dark:border-white/[0.015] light:border-slate-200/25',
                      isThirdInRow && 'border-r-0',
                      idx >= features.length - 3 && 'border-b-0'
                    )}
                  >
                    {/* Icon Glow/Tint Wrapper */}
                    <div
                      className={clsx(
                        'flex h-11 w-11 items-center justify-center rounded-2xl border transition-all duration-200 group-hover:scale-105 group-hover:shadow-md',
                        feature.glowBg,
                        feature.glowBorder,
                        feature.color
                      )}
                    >
                      <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>

                    {/* Clean Display Typography */}
                    <span className="text-sm font-medium text-slate-200 dark:text-slate-200 light:text-slate-800 tracking-tight text-center leading-tight">
                      {feature.label}
                    </span>

                    {/* Optional Badge */}
                    {feature.badge && (
                      <span className="absolute top-2 right-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/10 dark:bg-white/10 light:bg-slate-200 text-slate-300 dark:text-slate-300 light:text-slate-700 border border-white/10">
                        {feature.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default FeaturesModal;
