'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Send,
  PiggyBank,
  TrendingUp,
  Gift,
  Users,
  Repeat,
  Share2,
  Sparkles,
  Trophy,
  Award,
  Settings,
  ShieldCheck,
  Zap,
  BookUser,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  History,
  Coins,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useYieldApy } from '../hooks/useApi';
import { Tooltip } from './ui/Tooltip';
import { motion } from 'framer-motion';
import { useTheme } from './providers/ThemeProvider';
import { OfficialLogoMark } from './ui/OfficialBrand';

export interface SidebarProps {
  currentPath?: string;
}

export const Sidebar: React.FC<SidebarProps> = () => {
  const pathname = usePathname();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [isCollapsed, setIsCollapsed] = React.useState(false);

  React.useEffect(() => {
    const saved = localStorage.getItem('veriagent-sidebar-collapsed');
    if (saved !== null) {
      setIsCollapsed(saved === 'true');
    }
  }, []);

  const toggleCollapse = () => {
    const nextState = !isCollapsed;
    setIsCollapsed(nextState);
    localStorage.setItem('veriagent-sidebar-collapsed', String(nextState));
  };

  // The badge previously read a hardcoded "12.8% APY", roughly triple what
  // the oracle attests. Omitted entirely when the oracle has no reading.
  const { label: _apyLabel } = useYieldApy();

  const menuGroups = [
    {
      label: 'OVERVIEW',
      items: [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/send', label: 'Send', icon: Send },
        { href: '/requests', label: 'Requests', icon: CreditCard },
        { href: '/activity', label: 'Activity', icon: History },
      ],
    },
    {
      label: 'EARN & GROW',
      items: [
        { href: '/pools', label: 'Group Pools', icon: PiggyBank, badge: 'P2P' },
        { href: '/vaults', label: 'Yield Vaults', icon: TrendingUp, badge: 'Coming Soon' },
        { href: '/airdrop', label: 'VERI Rewards', icon: Sparkles },
        { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
      ],
    },
    {
      label: 'TOOLS & SOCIAL',
      items: [
        { href: '/tokens', label: 'Watched Tokens', icon: Coins },
        { href: '/contacts', label: 'Contacts', icon: BookUser },
        { href: '/envelopes', label: 'Red Envelopes', icon: Gift },
        { href: '/splits', label: 'Bill Splits', icon: Users },
        { href: '/subscriptions', label: 'Subscriptions', icon: Repeat },
        { href: '/ambassador', label: 'Ambassadors', icon: Award, badge: 'Rewards' },
        { href: '/badges', label: 'Badges & Profile', icon: Award, badge: 'Reputation' },
        { href: '/referral', label: 'Referrals', icon: Share2 },
      ],
    },
    {
      label: 'SYSTEM',
      items: [
        { href: '/settings', label: 'Settings', icon: Settings },
      ],
    },
  ];

  return (
    <motion.aside
      animate={{ width: isCollapsed ? 68 : 256 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25, mass: 0.5 }}
      className="va-sidebar sticky top-0 z-20 hidden h-screen shrink-0 flex-col overflow-hidden border-r p-3 md:flex"
    >
      {/* Brand logo & title */}
      <div
        className={clsx(
          'va-sidebar-brand mb-6 flex items-center border-b py-4 transition-all duration-200',
          isCollapsed ? 'justify-center px-1' : 'gap-3 px-3'
        )}
      >
        <OfficialLogoMark size={36} withSquircle />
        {!isCollapsed && (
          <div className="overflow-hidden whitespace-nowrap">
            <h1 className="flex items-center gap-1.5 text-[19px] font-semibold tracking-[-0.05em] text-[var(--va-app-ink)]">
              VeriAgent <span className="text-[#F2D827]">Pay</span>
            </h1>
            <p className="flex items-center gap-1 text-[11px] text-[var(--va-app-muted)]">
              <ShieldCheck className="w-3 h-3 text-[#F2D827]" /> Smart social wallet
            </p>
          </div>
        )}
      </div>

      {/* Navigation menu */}
      <nav className="no-scrollbar flex-1 space-y-6 overflow-y-auto px-1 pr-1">
        {menuGroups.map((group) => (
          <div key={group.label}>
            {isCollapsed ? (
              <div className={`my-3 border-t ${isDark ? 'border-white/[0.05]' : 'border-slate-200'}`} />
            ) : (
              <div className="va-sidebar-group mb-2 px-3">
                {group.label}
              </div>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <Tooltip key={item.href} content={item.label} disabled={!isCollapsed}>
                    <Link
                      href={item.href}
                      className={clsx(
                        'va-sidebar-link flex items-center transition-all duration-200',
                        isCollapsed ? 'h-10 w-10 justify-center' : 'w-full justify-between px-3 py-2.5',
                      )}
                      data-active={isActive}>
                      <div className="flex items-center gap-3">
                        <Icon className={clsx('w-4 h-4 shrink-0', isActive ? 'text-[#F2D827]' : '')} />
                        {!isCollapsed && <span className="truncate">{item.label}</span>}
                      </div>
                      {!isCollapsed && item.badge && (
                        <span
                          className="va-sidebar-badge px-2 py-0.5 font-mono text-[10px] transition-colors"
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer & interactive toggle */}
      <div className="va-sidebar-footer mt-auto flex flex-col gap-3 border-t px-1 pt-4">
        {!isCollapsed && (
          <div
            className="va-sidebar-status flex items-center justify-between p-3 text-xs"
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#F2D827]" />
              <span className="text-[11px] font-medium">Solana Devnet</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-[#F2D827] animate-pulse" />
          </div>
        )}

        <button
          onClick={toggleCollapse}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={clsx(
            'va-product-action flex h-10 items-center justify-center text-xs transition-all duration-200',
            isCollapsed ? 'w-10' : 'w-full gap-2'
          )}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span>Collapse Menu</span>
            </>
          )}
        </button>
      </div>
    </motion.aside>
  );
};
