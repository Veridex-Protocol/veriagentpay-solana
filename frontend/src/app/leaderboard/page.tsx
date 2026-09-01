'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppLayout } from '../../components/layout/AppLayout';
import { useTheme } from '../../components/providers/ThemeProvider';
import { Trophy, ArrowLeft, Award, Flame, Users } from 'lucide-react';
import { useLeaderboard } from '../../hooks/use-growth';
import { api } from '../../lib/api';
import { VeriAgentLoader } from '../../components/ui/VeriAgentLoader';

type LeaderboardTab = 'vaults' | 'referrals';
type ReferralPeriod = 'week' | 'month' | 'all';

interface ReferralEntry {
  rank: number;
  userId: string;
  username: string;
  activations: number;
  retained: number;
  points: number;
}

export default function YieldLeaderboardPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { data: leaderboardData } = useLeaderboard();

  const [tab, setTab] = useState<LeaderboardTab>('vaults');
  const [period, setPeriod] = useState<ReferralPeriod>('week');
  const [referrals, setReferrals] = useState<ReferralEntry[]>([]);
  const [referralsLoading, setReferralsLoading] = useState(false);
  const [referralsError, setReferralsError] = useState<string | null>(null);

  const loadReferrals = useCallback(async () => {
    setReferralsLoading(true);
    setReferralsError(null);
    try {
      const data = await api.fetchReferralLeaderboard(period);
      setReferrals(data.entries);
    } catch (err: any) {
      setReferralsError(err?.message || 'Could not load the referral leaderboard.');
    } finally {
      setReferralsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    if (tab === 'referrals') loadReferrals();
  }, [tab, loadReferrals]);

  const topVaults = leaderboardData?.topVaults || [];

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link
              href="/vaults"
              className={`p-2 rounded-xl border transition ${isDark ? 'bg-slate-950/60 border-white/[0.08] text-slate-400 hover:text-white' : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-slate-950'
                }`}
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-1.5 text-xs font-mono text-amber-500 uppercase tracking-wider font-bold mb-0.5">
                <Trophy className="w-4 h-4" />
                <span>WEEKLY COMPETITION</span>
              </div>
              <h1 className={`text-xl sm:text-2xl font-extrabold tracking-tight flex items-center space-x-2 ${isDark ? 'text-white' : 'text-slate-950'}`}>
                <span>Yield Leaderboard</span>
              </h1>
              <p className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Live vault strategy and referral rankings.
              </p>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div
          className={`inline-flex rounded-xl border p-1 ${
            isDark ? 'border-white/[0.08] bg-slate-950/60' : 'border-slate-300 bg-slate-100'
          }`}
          role="tablist"
        >
          {([
            { id: 'vaults' as const, label: 'Vaults', icon: Award },
            { id: 'referrals' as const, label: 'Referrals', icon: Users },
          ]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold font-mono uppercase tracking-wider transition ${
                tab === id
                  ? 'bg-amber-500 text-slate-950'
                  : isDark
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {tab === 'referrals' ? (
          <div
            className={`space-y-4 rounded-2xl border p-4 shadow-xl transition-colors sm:p-6 ${
              isDark ? 'border-white/[0.08] bg-[#070A11]/80' : 'border-slate-200 bg-white text-slate-950 shadow-sm'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3
                className={`flex items-center space-x-2 font-mono text-xs font-bold uppercase tracking-wider sm:text-sm ${
                  isDark ? 'text-white' : 'text-slate-950'
                }`}
              >
                <Users className="h-4 w-4 text-amber-500" />
                <span>Top Referrers</span>
              </h3>

              <div className="flex gap-1">
                {(['week', 'month', 'all'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`rounded-lg px-3 py-1 font-mono text-[11px] font-bold uppercase transition ${
                      period === p
                        ? 'bg-amber-500/15 text-amber-500'
                        : isDark
                          ? 'text-slate-500 hover:text-slate-300'
                          : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <p className={`font-mono text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
              Ranked by activated invites from friends who created a wallet.
            </p>

            {referralsLoading && (
              <div className="flex items-center justify-center py-10">
                <VeriAgentLoader
                  variant="inline"
                  text="Loading rankings"
                  speed="fast"
                />
              </div>
            )}

            {referralsError && !referralsLoading && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300">
                <span>{referralsError}</span>
                <button
                  onClick={loadReferrals}
                  className="rounded-lg border border-red-800 px-3 py-1 text-xs"
                >
                  Retry
                </button>
              </div>
            )}

            {!referralsLoading && !referralsError && referrals.length === 0 && (
              <p className="py-10 text-center text-sm text-slate-400">
                No activated referrals in this period yet. Be the first!
              </p>
            )}

            <div className="space-y-2.5">
              {referrals.map((entry) => (
                <div
                  key={entry.userId}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 shadow-md transition ${
                    isDark
                      ? 'border-white/[0.08] bg-slate-950 hover:border-amber-500/40'
                      : 'border-slate-200 bg-slate-50 hover:border-amber-400'
                  }`}
                >
                  <div className="flex min-w-0 items-center space-x-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 font-mono text-sm font-extrabold text-amber-500">
                      #{entry.rank}
                    </div>
                    <div className="min-w-0">
                      <h4
                        className={`truncate text-sm font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}
                      >
                        @{entry.username}
                      </h4>
                      <p className={`font-mono text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        {entry.retained} retained past 7 days
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="font-mono text-base font-extrabold text-[#D4A106] dark:text-[#F2D827]">
                      {entry.activations}
                    </div>
                    <span className={`font-mono text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      activated
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
        <>
        {/* Showdown Prize Banner */}
        <div className={`rounded-2xl p-6 sm:p-8 space-y-3 shadow-2xl transition-colors duration-200 ${isDark ? 'bg-gradient-to-r from-amber-600 via-yellow-600 to-amber-700 text-white' : 'bg-amber-500 text-gray-950 shadow-slate-200/50'
          }`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider font-mono bg-black/25 px-3 py-1 rounded-full whitespace-nowrap text-white">
              Live standings
            </span>
            <span className="text-[11px] font-bold font-mono bg-black/35 px-3 py-1 rounded-full flex items-center space-x-1 whitespace-nowrap text-white">
              <Flame className="w-3.5 h-3.5 text-yellow-300" />
              <span>Updates as vault activity settles</span>
            </span>
          </div>

          <div>
            <span className="text-xs font-semibold font-mono uppercase tracking-wider">Current Prize Pool</span>
            <div className="text-3xl sm:text-5xl font-extrabold font-mono tracking-tight mt-0.5">${leaderboardData?.showdownPrizePool?.toLocaleString() || '0'} USDC</div>
          </div>
        </div>

        {/* Leaderboard Table */}
        <div className={`rounded-2xl border p-4 sm:p-6 space-y-4 shadow-xl transition-colors ${isDark ? 'bg-[#070A11]/80 border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm text-slate-950'
          }`}>
          <h3 className={`text-xs sm:text-sm font-bold font-mono uppercase tracking-wider flex items-center space-x-2 ${isDark ? 'text-white' : 'text-slate-950'}`}>
            <Award className="w-4 h-4 text-amber-500" />
            <span>Vault Strategy Rankings</span>
          </h3>

          <div className="space-y-3">
            {topVaults.map((vault: any) => (
              <div
                key={vault.rank}
                className={`border rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition shadow-md ${isDark
                  ? 'bg-slate-950 border-white/[0.08] hover:border-amber-500/40'
                  : 'bg-slate-50 border-slate-200 hover:border-amber-400'
                  }`}
              >
                <div className="flex items-start sm:items-center space-x-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-extrabold text-sm font-mono border border-amber-500/20 shrink-0">
                    #{vault.rank}
                  </div>
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className={`font-bold text-sm sm:text-base leading-snug ${isDark ? 'text-white' : 'text-slate-950'}`}>{vault.name}</h4>
                      <span className="inline-flex items-center text-[10px] sm:text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30 whitespace-nowrap shrink-0">
                        {vault.badge}
                      </span>
                    </div>
                    <p className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      Manager: <span className="text-[#D4A106] dark:text-[#F2D827] font-semibold">{vault.manager}</span>
                    </p>
                  </div>
                </div>

                <div className={`flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 shrink-0 ${isDark ? 'border-slate-800' : 'border-slate-200'
                  }`}>
                  <div className="text-base sm:text-lg font-extrabold font-mono text-[#D4A106] dark:text-[#F2D827]">+{vault.apy}% APY</div>
                  <span className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>${vault.totalDeposits?.toLocaleString()} TVL</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        </>
        )}
      </div>
    </AppLayout>
  );
}
