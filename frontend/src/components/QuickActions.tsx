'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Send,
  ArrowDownCircle,
  PiggyBank,
  Trophy,
  Award,
  BookUser,
  TrendingUp,
  Gift,
  Users,
  Repeat,
  ChevronRight,
  Grid,
} from 'lucide-react';
import { FeaturesModal } from './FeaturesModal';
import { motion } from 'framer-motion';

export interface QuickActionItem {
  id: string;
  label: string;
  shortLabel: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  borderColor: string;
  badge?: string;
}

export const quickActionsList: QuickActionItem[] = [
  {
    id: 'send',
    label: 'Send Money',
    shortLabel: 'Send',
    href: '/send',
    icon: Send,
    color: 'text-[#F2D827]',
    bgColor: 'bg-[#F2D827]/10',
    borderColor: 'border-white/10 hover:border-[#F2D827]/40',
  },
  {
    id: 'request',
    label: 'Request Money',
    shortLabel: 'Request',
    href: '/request',
    icon: ArrowDownCircle,
    color: 'text-[#F2D827]',
    bgColor: 'bg-[#F2D827]/10',
    borderColor: 'border-white/10 hover:border-[#F2D827]/40',
  },
  {
    id: 'leaderboard',
    label: 'Yield Leaderboard',
    shortLabel: 'Leaderboard',
    href: '/leaderboard',
    icon: Trophy,
    color: 'text-[#F2D827]',
    bgColor: 'bg-[#F2D827]/10',
    borderColor: 'border-white/10 hover:border-[#F2D827]/40',
    badge: '$10k',
  },
  {
    id: 'badges',
    label: 'Badges & Card',
    shortLabel: 'Badges',
    href: '/badges',
    icon: Award,
    color: 'text-[#F2D827]',
    bgColor: 'bg-[#F2D827]/10',
    borderColor: 'border-white/10 hover:border-[#F2D827]/40',
    badge: 'Card',
  },
  {
    id: 'pools',
    label: 'Group Pools',
    shortLabel: 'Pools',
    href: '/pools',
    icon: PiggyBank,
    color: 'text-[#F2D827]',
    bgColor: 'bg-[#F2D827]/10',
    borderColor: 'border-white/10 hover:border-[#F2D827]/40',
    badge: 'P2P',
  },
  {
    id: 'vaults',
    label: 'AI Yield Vaults',
    shortLabel: 'Save AI',
    href: '/vaults',
    icon: TrendingUp,
    color: 'text-[#F2D827]',
    bgColor: 'bg-[#F2D827]/10',
    borderColor: 'border-white/10 hover:border-[#F2D827]/40',
    badge: 'Soon',
  },
  {
    id: 'envelopes',
    label: 'Red Envelopes',
    shortLabel: 'Red Env',
    href: '/envelopes',
    icon: Gift,
    color: 'text-[#F2D827]',
    bgColor: 'bg-[#F2D827]/10',
    borderColor: 'border-white/10 hover:border-[#F2D827]/40',
  },
  {
    id: 'splits',
    label: 'Group Splits',
    shortLabel: 'Splits',
    href: '/splits',
    icon: Users,
    color: 'text-[#F2D827]',
    bgColor: 'bg-[#F2D827]/10',
    borderColor: 'border-white/10 hover:border-[#F2D827]/40',
  },
  {
    id: 'subscriptions',
    label: 'Recurring Pay',
    shortLabel: 'Recurring',
    href: '/subscriptions',
    icon: Repeat,
    color: 'text-[#F2D827]',
    bgColor: 'bg-[#F2D827]/10',
    borderColor: 'border-white/10 hover:border-[#F2D827]/40',
  },
  {
    id: 'contacts',
    label: 'Contacts',
    shortLabel: 'Contacts',
    href: '/contacts',
    icon: BookUser,
    color: 'text-[#F2D827]',
    bgColor: 'bg-[#F2D827]/10',
    borderColor: 'border-white/10 hover:border-[#F2D827]/40',
  },
];

export const QuickActions: React.FC = () => {
  const [showAllModal, setShowAllModal] = useState(false);
  const mainActions = quickActionsList.slice(0, 9); // Top 9 in 3x3 grid

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
          <Grid className="w-3.5 h-3.5 text-slate-400" />
          <span>Quick Actions</span>
        </h3>
        <button
          onClick={() => setShowAllModal(true)}
          className="text-xs font-semibold text-[#F2D827] hover:underline flex items-center space-x-1"
        >
          <span>All ({quickActionsList.length})</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 3 BY 3 GRID LAYOUT (OPay Style) */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {mainActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.id} href={action.href}>
              <motion.div
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25, mass: 0.5 }}
                className={`group relative flex min-h-28 flex-col items-center justify-center space-y-2 rounded-2xl border bg-brand-card/80 p-3.5 text-center shadow-panel sm:p-4 ${action.borderColor}`}
              >
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.06] ${action.bgColor} ${action.color}`}>
                  <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <span className="text-xs font-extrabold text-white group-hover:text-[#F2D827] transition-colors line-clamp-1">
                  {action.shortLabel}
                </span>
                {action.badge && (
                  <span className="absolute top-1.5 right-1.5 text-[9px] font-extrabold px-1.5 py-0.2 rounded-md bg-[#F2D827]/15 text-[#F2D827] border border-[#F2D827]/30">
                    {action.badge}
                  </span>
                )}
              </motion.div>
            </Link>
          );
        })}
      </div>

      {/* Mobile / Desktop Bottom Sheet Modal for All Actions */}
      <FeaturesModal
        isOpen={showAllModal}
        onClose={() => setShowAllModal(false)}
        title="All Quick Actions"
      />
    </section>
  );
};
