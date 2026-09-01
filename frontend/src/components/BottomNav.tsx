'use client';

// Fix: P1-4 Mobile Bottom Navigation with Expandable "More" Feature Sheet
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Send,
  Trophy,
  TrendingUp,
  Grid,
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import { FeaturesModal } from './FeaturesModal';

export interface BottomNavProps {
  currentPath?: string;
}

export const BottomNav: React.FC<BottomNavProps> = () => {
  const pathname = usePathname();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const primaryItems = [
    { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { href: '/send', label: 'Send', icon: Send },
    { href: '/vaults', label: 'Vaults', icon: TrendingUp },
    { href: '/leaderboard', label: 'Ranks', icon: Trophy },
  ];

  return (
    <>
      {/* Expandable Slide-up "More" Features Modal */}
      <FeaturesModal
        isOpen={isMoreOpen}
        onClose={() => setIsMoreOpen(false)}
        title="Features"
      />

      {/* Persistent Bottom Bar */}
      <nav className="va-mobile-nav safe-bottom fixed bottom-0 left-0 right-0 z-40 border-t px-2 py-2 backdrop-blur-xl md:hidden">
        <div className="flex items-center justify-around max-w-md mx-auto">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'relative flex min-w-14 flex-col items-center justify-center rounded-xl px-3 py-1.5 transition-colors',
                  isActive
                    ? 'font-bold text-[#F2D827]'
                    : 'text-slate-400 hover:text-slate-200 light:text-slate-500 light:hover:text-slate-900'
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="mobile-nav-active"
                    className="absolute inset-0 rounded-xl border border-[#F2D827]/25 bg-[#F2D827]/10"
                    transition={{ type: 'spring', stiffness: 300, damping: 25, mass: 0.5 }}
                  />
                )}
                <Icon className="relative z-10 mb-0.5 h-5 w-5" />
                <span className="relative z-10 text-[10px] font-semibold tracking-normal">{item.label}</span>
              </Link>
            );
          })}

          {/* 5th "More" Action Button */}
          <button
            onClick={() => setIsMoreOpen(!isMoreOpen)}
            className={clsx(
              'relative flex min-w-14 flex-col items-center justify-center rounded-xl px-3 py-1.5 transition-colors',
              isMoreOpen ? 'font-bold text-[#F2D827]' : 'text-slate-400 hover:text-slate-200 light:text-slate-500 light:hover:text-slate-900'
            )}
          >
            <Grid className="relative z-10 mb-0.5 h-5 w-5" />
            <span className="relative z-10 text-[10px] font-semibold tracking-normal">More</span>
          </button>
        </div>
      </nav>
    </>
  );
};
