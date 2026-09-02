'use client';

import React from 'react';
import Link from 'next/link';
import { AppLayout } from '../../components/layout/AppLayout';
import { AnimatedNumber } from '../../components/ui/AnimatedNumber';
import { useWalletStore } from '../../store/useWalletStore';
import { useBalances, useActivity } from '../../hooks/useApi';
import { useLinkedAccounts } from '../../hooks/use-user';
import { useTheme } from '../../components/providers/ThemeProvider';
import { ReceiveCard } from '../../components/wallet/ReceiveCard';
import { PendingPaymentsCard } from '../../components/wallet/PendingPaymentsCard';
import { ActiveLoansDashboardCard } from '../../components/wallet/ActiveLoansDashboardCard';
import {
  Send,
  ArrowDownCircle,
  TrendingUp,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownLeft,
  Eye,
  EyeOff,
  Users,
  ExternalLink,
} from 'lucide-react';

export default function DashboardPage() {
  const { hideBalances, toggleHideBalances, address } = useWalletStore();
  const { data: balanceData } = useBalances();
  const { data: activities = [], isLoading: activityLoading } = useActivity();
  const { data: linkedAccounts = [] } = useLinkedAccounts();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const yieldSummary = balanceData?.yieldSummary || { earningYield: '0.00', apy: '0.0', availableCash: '0.00' };

  const totalUsd = balanceData?.totalUsd ?? 0;
  const usdcBalance = balanceData?.balances?.USDC ?? '0.00';
  const solBalance = balanceData?.balances?.SOL ?? '0';

  const platformColors: Record<string, string> = {
    telegram: 'text-[#229ED9]',
    whatsapp: 'text-[#25D366]',
    discord: 'text-[#5865F2]',
    slack: 'text-[#E01E5A]',
  };

  return (
    <AppLayout>
      <div className="space-y-10">
        <div className="va-product-page-header">
          <span className="va-product-eyebrow">Wallet overview</span>
          <h1 className="va-product-title">Your money, in one place.</h1>
          <p className="va-product-lede">Manage available funds, savings, and payments from your verified wallet.</p>
        </div>
        {/* Verified Flow balance overview */}
        <div
          className="va-product-surface p-6 md:p-8 space-y-7"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="va-product-label">
                  Total balance
                </span>
                <button
                  onClick={toggleHideBalances}
                  className={`p-1 rounded transition-colors ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-950'}`}
                >
                  {hideBalances ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="text-4xl sm:text-6xl font-semibold tracking-[-0.055em] text-[var(--va-app-ink)]">
                {hideBalances ? <span>$••••••</span> : <AnimatedNumber value={totalUsd} prefix="$" decimals={2} />}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 sm:grid-cols-3">
                <div className="va-product-subtle p-3"><span className="block text-[11px] text-[var(--va-app-muted)]">Available</span><strong className="mt-1 block font-mono text-sm">{hideBalances ? '$••••' : `$${parseFloat(yieldSummary.availableCash).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}</strong></div>
                <div className="va-product-subtle p-3"><span className="block text-[11px] text-[var(--va-app-muted)]">Savings · Coming Soon</span><strong className="mt-1 block font-mono text-sm text-amber-500">{hideBalances ? '$••••' : `$${parseFloat(yieldSummary.earningYield).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}</strong></div>
                <div className="va-product-subtle col-span-2 p-3 sm:col-span-1"><span className="block text-[11px] text-[var(--va-app-muted)]">Pending</span><strong className="mt-1 block font-mono text-sm">$0.00</strong></div>
              </div>

              <div className="flex flex-wrap gap-3 pt-1">
                <div className="va-product-subtle min-w-32 px-3 py-2">
                  <span className="block text-[11px] text-[var(--va-app-muted)]">Spendable</span>
                  <strong className="mt-1 block font-mono text-sm">{hideBalances ? '•••• USDC' : `${usdcBalance} USDC`}</strong>
                </div>
                <div className="va-product-subtle min-w-32 px-3 py-2">
                  <span className="block text-[11px] text-[var(--va-app-muted)]">Network balance</span>
                  <strong className="mt-1 block font-mono text-sm">{hideBalances ? '•••• SOL' : `${solBalance} SOL`}</strong>
                </div>
              </div>
            </div>

            {/* Passkey Wallet Badge */}
            <div className={`px-4 py-2.5 rounded-xl border font-mono text-xs flex items-center gap-2 ${isDark ? 'bg-slate-950 border-white/[0.08] text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
              }`}>
              <ShieldCheck className="w-4 h-4 text-[#F2D827]" />
              <span>Passkey: {address ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : 'Not connected'}</span>
            </div>
          </div>

          {/* Quick Action Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <Link
              href="/send"
              className="va-product-action va-product-action--primary flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>Send</span>
            </Link>

            <Link
              href="/request"
              className="va-product-action flex items-center justify-center gap-2"
            >
              <ArrowDownCircle className="w-4 h-4 text-[#F2D827]" />
              <span>Request</span>
            </Link>

            <Link
              href="/vaults"
              className="va-product-action flex items-center justify-center gap-2"
            >
              <TrendingUp className="w-4 h-4 text-[#F2D827]" />
              <span>Save <span className="text-[10px] text-[#F2D827] font-mono font-normal">(Soon)</span></span>
            </Link>

            <Link
              href="/pools"
              className="va-product-action flex items-center justify-center gap-2"
            >
              <Users className="w-4 h-4 text-[#F2D827]" />
              <span>Group Pool</span>
            </Link>
          </div>
        </div>

        {/* Active Pool Loans & Repayments Alert Card */}
        <ActiveLoansDashboardCard />

        {/* Sent payments nobody has claimed yet: renders nothing when empty */}
        <PendingPaymentsCard />

        {/* Fund from an external wallet */}
        <ReceiveCard />

        {/* Linked Social Identity Card */}
        <div className="space-y-3">
          <div>
            <h3 className={`text-base font-bold font-mono uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-950'}`}>
              Your identity
            </h3>
            <p className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              The same balance and payment history follows your verified social accounts.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {linkedAccounts.length === 0 ? (
              <div className={`col-span-full p-6 rounded-2xl border text-center space-y-2 ${isDark ? 'bg-[#070A11] border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm'}`}>
                <div className="text-2xl">🔗</div>
                <div className={`text-xs font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No chat handles linked yet. Link Telegram, WhatsApp, or Discord from the Accounts page.</div>
              </div>
            ) : (
              linkedAccounts.map((acc: any) => (
                <div
                  key={acc.id}
                  className={`p-4 rounded-2xl border space-y-2 transition-colors ${isDark ? 'bg-[#070A11] border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm text-slate-950'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-bold text-xs capitalize ${platformColors[acc.platform] || 'text-slate-400'}`}>{acc.platform}</span>
                    <span className="w-2 h-2 rounded-full bg-[#F2D827] animate-pulse" />
                  </div>
                  <div className={`text-xs font-mono font-semibold ${isDark ? 'text-white' : 'text-slate-950'}`}>{acc.username || acc.identifier}</div>
                  <div className={`text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Verified</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Activity Table */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className={`text-base font-bold font-mono uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-950'}`}>
              Recent Activity
            </h3>
            <Link
              href="/activity"
              className={`font-mono text-[11px] font-bold transition ${isDark ? 'text-slate-400 hover:text-[#F2D827]' : 'text-slate-600 hover:text-[#D4A106]'}`}
            >
              View all →
            </Link>
          </div>

          <div
            className={`rounded-2xl border divide-y overflow-hidden transition-colors ${isDark ? 'bg-[#070A11] border-white/[0.08] divide-white/[0.08]' : 'bg-white border-slate-200 divide-slate-200 shadow-sm'
              }`}
          >
            {activityLoading ? (
              <div className={`p-8 text-center text-xs font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                Loading activity...
              </div>
            ) : activities.length === 0 ? (
              <div className={`p-8 text-center space-y-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                <div className="text-2xl">📭</div>
                <div className="text-xs font-mono">No transactions yet. Send or receive crypto to see activity here.</div>
              </div>
            ) : (
              activities.map((act: any) => (
                <div key={act.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl border flex items-center justify-center ${act.type === 'sent' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' : 'bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827] border-[#F2D827]/20'
                        }`}
                    >
                      {act.type === 'sent' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>{act.activity}</div>
                      <div className={`text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {act.recipient} • {act.time}
                      </div>
                    </div>
                  </div>

                  <div className="text-right font-mono space-y-0.5">
                    <div className={`text-xs font-bold ${act.type === 'sent' ? 'text-rose-500' : 'text-[#D4A106] dark:text-[#F2D827]'}`}>{act.amount}</div>
                    <div className="flex items-center justify-end gap-1.5">
                      <span className={`text-[10px] font-bold ${act.status === 'Completed' || act.status === 'Settled' || act.status === 'Executed' ? 'text-[#D4A106] dark:text-[#F2D827]' : 'text-slate-400'}`}>
                        {act.status}
                      </span>
                      {act.explorerUrl && (
                        <a
                          href={act.explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className={`transition ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}
                          aria-label="View on explorer"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
