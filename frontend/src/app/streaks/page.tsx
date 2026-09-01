'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from '../../components/layout/AppLayout';
import {
  Flame,
  Trophy,
  Share2,
  Bell,
  BellOff,
  AlertCircle,
  Send,
  PiggyBank,
} from 'lucide-react';
import { api } from '../../lib/api';
import { VeriAgentLoader } from '../../components/ui/VeriAgentLoader';

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  totalBonusPoints: number;
  lastDepositDate: string | null;
  history: string[];
}

interface WrappedData {
  sent: number;
  received: number;
  saved: number;
  currentStreak: number;
  longestStreak: number;
  badgeCount: number;
  weekStart: string;
  weekEnd: string;
}

const REMINDER_KEY = 'veriagent_streak_reminder';

/** The last 30 calendar days, oldest first, as YYYY-MM-DD. */
function lastThirtyDays(): string[] {
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

export default function StreaksPage() {
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [wrapped, setWrapped] = useState<WrappedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reminderOn, setReminderOn] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setReminderOn(localStorage.getItem(REMINDER_KEY) === 'on');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [streakData, wrappedData] = await Promise.all([
        api.fetchSavingsStreak(),
        api.fetchWeeklyWrapped().catch(() => null),
      ]);
      setStreak(streakData);
      setWrapped(wrappedData);
    } catch (err: any) {
      setError(err?.message || 'Could not load your streak.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const depositDays = useMemo(() => new Set(streak?.history ?? []), [streak]);
  const calendar = useMemo(lastThirtyDays, []);

  const toggleReminder = () => {
    const next = !reminderOn;
    setReminderOn(next);
    localStorage.setItem(REMINDER_KEY, next ? 'on' : 'off');
  };

  const handleShare = async () => {
    if (!streak) return;
    // Balances are deliberately omitted: only streak length is shared.
    const text = `${streak.currentStreak}-day savings streak on VeriAgent Pay 🔥`;
    const url = `${window.location.origin}/activate?src=streak_share&campaign=streak`;
    if (navigator.share) {
      await navigator.share({ title: 'My savings streak', text, url }).catch(() => undefined);
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`);
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Flame className="h-6 w-6 text-orange-400" />
            <span>Savings Streak</span>
          </h1>
          <p className="text-xs text-slate-400">
            Deposit any amount each day to keep your streak alive.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center p-6">
            <VeriAgentLoader
              variant="card"
              size="sm"
              text="Loading Savings Streak"
              subtext="Calculating daily activity bonuses..."
              showProgress={true}
            />
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center gap-3 rounded-2xl border border-red-900/60 bg-red-950/30 p-5 text-sm text-red-300">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              onClick={load}
              className="rounded-lg border border-red-800 px-3 py-1 text-xs text-red-200 hover:bg-red-900/40"
            >
              Retry
            </button>
          </div>
        )}

        {streak && !loading && (
          <>
            {/* Streak counters */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-950/40 to-slate-950/80 p-5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-orange-300">
                  <Flame className="h-4 w-4" />
                  <span>Current streak</span>
                </div>
                <p className="mt-2 text-4xl font-extrabold text-white">
                  {streak.currentStreak}
                  <span className="ml-1 text-base font-medium text-slate-400">
                    day{streak.currentStreak === 1 ? '' : 's'}
                  </span>
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-300">
                  <Trophy className="h-4 w-4" />
                  <span>Longest</span>
                </div>
                <p className="mt-2 text-4xl font-extrabold text-white">
                  {streak.longestStreak}
                  <span className="ml-1 text-base font-medium text-slate-400">
                    day{streak.longestStreak === 1 ? '' : 's'}
                  </span>
                </p>
              </div>
            </div>

            {/* 30-day calendar */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
              <h2 className="mb-4 text-sm font-semibold text-white">Last 30 days</h2>
              <div className="grid grid-cols-10 gap-1.5">
                {calendar.map((day) => {
                  const active = depositDays.has(day);
                  return (
                    <div
                      key={day}
                      title={`${day}${active ? ': deposited' : ''}`}
                      aria-label={`${day}${active ? ', deposited' : ', no deposit'}`}
                      className={`aspect-square rounded-md border ${
                        active
                          ? 'border-orange-400/60 bg-orange-500/70'
                          : 'border-slate-800 bg-slate-900/60'
                      }`}
                    />
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {streak.totalBonusPoints} bonus VERI Points earned from this streak.
              </p>
            </div>

            {/* Weekly wrapped */}
            {wrapped && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
                <h2 className="mb-3 text-sm font-semibold text-white">This week so far</h2>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <Send className="mx-auto h-4 w-4 text-[#F2D827]" />
                    <p className="mt-1.5 text-xl font-bold text-white">{wrapped.sent}</p>
                    <p className="text-[11px] text-slate-400">Sent</p>
                  </div>
                  <div>
                    <PiggyBank className="mx-auto h-4 w-4 text-[#F2D827]" />
                    <p className="mt-1.5 text-xl font-bold text-white">{wrapped.saved}</p>
                    <p className="text-[11px] text-slate-400">USDC saved</p>
                  </div>
                  <div>
                    <Trophy className="mx-auto h-4 w-4 text-amber-400" />
                    <p className="mt-1.5 text-xl font-bold text-white">{wrapped.badgeCount}</p>
                    <p className="text-[11px] text-slate-400">Badges</p>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={handleShare}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-yellow-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-yellow-400"
              >
                <Share2 className="h-4 w-4" />
                <span>Share my streak</span>
              </button>

              <button
                onClick={toggleReminder}
                aria-pressed={reminderOn}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-medium transition ${
                  reminderOn
                    ? 'border-orange-500/40 bg-orange-500/10 text-orange-200'
                    : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                {reminderOn ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                <span>{reminderOn ? 'Reminders on' : "Don't break the streak"}</span>
              </button>
            </div>

            <p className="text-center text-xs text-slate-500">
              Share cards never include your balances.
            </p>
          </>
        )}
      </div>
    </AppLayout>
  );
}
