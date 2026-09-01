'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowRight,
  Award,
  Check,
  Fingerprint,
  MessageCircle,
  Moon,
  QrCode,
  ShieldCheck,
  Sparkles,
  Sun,
  Zap,
} from 'lucide-react';
import { telegramDeepLink } from '../../lib/app-url';
import { useTheme } from '../../components/providers/ThemeProvider';
import { Wordmark } from '../../components/marketing/header/Wordmark';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const EVENT_START = new Date(process.env.NEXT_PUBLIC_HK2026_START || '2026-08-27T01:00:00Z');

function useWalletCounter() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`${API_URL}/api/metrics/total-wallets`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && typeof data.totalWallets === 'number') setCount(data.totalWallets);
      } catch {
        // Non-blocking
      }
    };
    load();
    const interval = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return count;
}

function useEventCountdown() {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (now === null) return 'August 27–28';
  const remaining = EVENT_START.getTime() - now;
  if (remaining <= 0) return 'Live now';
  const days = Math.ceil(remaining / 86_400_000);
  return `${days} day${days === 1 ? '' : 's'} to go`;
}

/** Pioneer Quest Badge Card */
function PioneerQuestCard({ dark, botUrl }: { dark: boolean; botUrl: string }) {
  return (
    <div
      className={`mx-auto w-full max-w-md overflow-hidden rounded-[2rem] border shadow-2xl transition-all ${dark
        ? 'border-white/10 bg-[#13161c] shadow-black/60'
        : 'border-slate-200/80 bg-white shadow-slate-300/70'
        }`}
    >
      {/* Radiant Badge Banner */}
      <div className="relative h-48 overflow-hidden bg-[radial-gradient(ellipse_at_30%_20%,#eab308_0,transparent_45%),radial-gradient(circle_at_80%_80%,#facc15_0,transparent_45%),linear-gradient(135deg,#713f12,#0f172a_60%,#1e1b4b)] p-6 flex flex-col justify-between text-white">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-black/60 backdrop-blur-md border border-white/20 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-yellow-400 flex items-center gap-1.5">
            <Award className="h-3.5 w-3.5" /> Bitcoin Asia 2026
          </span>
          <span className="rounded-full bg-yellow-500 px-2.5 py-0.5 text-[10px] font-black text-black">
            LIMITED EDITION
          </span>
        </div>

        <div className="relative z-10">
          <h3 className="text-2xl font-bold tracking-tight !text-white drop-shadow-sm">VeriAgent Pioneer Badge</h3>
          <p className="text-xs !text-yellow-100 mt-1 font-medium">Lifetime $0 gas fees & early member perks</p>
        </div>

        {/* Ambient Glow Orb */}
        <div className="absolute -right-6 -top-6 h-36 w-36 rounded-full bg-yellow-400/30 blur-2xl pointer-events-none" />
      </div>

      {/* Quest Steps */}
      <div className="p-6 sm:p-7">
        <div className="space-y-3.5">
          {[
            { step: '01', title: 'Open in Telegram', desc: 'Launch @VeriAgentPayBot in 1 tap', done: true },
            { step: '02', title: 'Create Passkey with Face ID', desc: 'Hardware-grade security, 0 seed phrases', done: true },
            { step: '03', title: 'Claim Pioneer Badge & Free Gas', desc: 'Instant activation with zero network fees', done: false },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3.5">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${item.done
                  ? 'bg-yellow-500 text-black'
                  : 'border border-yellow-500/40 text-yellow-400 bg-yellow-500/10'
                  }`}
              >
                {item.step}
              </span>
              <div className="text-xs">
                <div className="font-bold">{item.title}</div>
                <div className="text-slate-500 dark:text-slate-400 mt-0.5">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <a
          href={botUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-full bg-yellow-500 hover:bg-yellow-400 py-3.5 text-sm font-bold text-black shadow-lg shadow-yellow-500/20 transition active:scale-98"
        >
          <MessageCircle className="h-4 w-4" />
          <span>Claim Pioneer Status (Free)</span>
          <ArrowRight className="h-4 w-4" />
        </a>

        <div className="mt-3 text-center text-[11px] text-slate-400">
          Takes ~30 seconds · No credit card or deposit needed
        </div>
      </div>
    </div>
  );
}

function ActivateContent() {
  const searchParams = useSearchParams();
  const walletCount = useWalletCounter();
  const countdown = useEventCountdown();
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  const referrer = searchParams.get('ref');

  const startPayload = useMemo(() => {
    if (referrer) return `ref_${referrer}`;
    return searchParams.get('campaign')?.slice(0, 64) || 'activate_web';
  }, [referrer, searchParams]);
  const botUrl = useMemo(() => telegramDeepLink(startPayload), [startPayload]);

  useEffect(() => {
    fetch(`${API_URL}/api/analytics/funnel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'activate_page_viewed',
        src: searchParams.get('src') || 'web',
        campaign: searchParams.get('campaign') || 'bitcoin_asia_activation',
        channel: searchParams.get('channel') || 'landing',
      }),
    }).catch(() => undefined);
  }, [searchParams]);

  const page = dark ? 'bg-[#090A0D] text-white' : 'bg-[#FAFAFB] text-slate-950';
  const subtle = dark ? 'text-slate-400' : 'text-slate-600';
  const line = dark ? 'border-white/10' : 'border-slate-200';
  const card = dark ? 'bg-white/[0.02] border-white/10' : 'bg-white border-slate-200/80 shadow-sm';

  return (
    <main
      className={`min-h-screen overflow-x-hidden antialiased transition-colors duration-300 ${page}`}
      style={{ colorScheme: dark ? 'dark' : 'light' }}
    >
      <header className={`sticky top-0 z-40 border-b backdrop-blur-xl ${line} ${dark ? 'bg-[#090A0D]/90' : 'bg-white/90'}`}>
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-8 lg:px-12">
          <Link href="/" className="flex items-center">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-3 sm:gap-4">
            <span className={`hidden text-xs font-semibold md:flex items-center gap-1.5 ${subtle}`}>
              <span className="h-2 w-2 rounded-full bg-[#F2D827] animate-pulse" />
              Hong Kong · {countdown}
            </span>
            <button
              onClick={toggleTheme}
              aria-label={`Switch to ${dark ? 'light' : 'dark'} theme`}
              aria-pressed={dark}
              className={`rounded-full p-2.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D827] ${dark ? 'bg-white/10 hover:bg-white/15' : 'bg-black/5 hover:bg-black/10'
                }`}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {referrer && (
        <div className="bg-yellow-500 px-5 py-2.5 text-center text-xs sm:text-sm font-bold text-black flex items-center justify-center gap-2">
          <Sparkles className="h-4 w-4" />
          A friend invited you! Activate now to claim your exclusive genesis welcome bonus.
        </div>
      )}

      <section className="relative mx-auto max-w-[1440px] px-4 py-12 sm:px-8 sm:py-16 lg:px-12 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 items-center">
          <div>
            <div className={`mb-6 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${line} backdrop-blur`}>
              <span className="h-2 w-2 rounded-full bg-yellow-500 animate-ping" />
              <span>⚡ Bitcoin Asia 2026 · Official Showcase</span>
            </div>

            <h1 className="text-[clamp(2.75rem,5.8vw,5.5rem)] font-normal leading-[0.92] tracking-[-0.055em]">
              Activate your wallet <span className="text-yellow-400 font-semibold">in 30 seconds.</span>
            </h1>

            <p className={`mt-6 max-w-xl text-base sm:text-lg leading-relaxed ${subtle}`}>
              Set up your Face ID wallet directly inside Telegram. No seed phrases, zero gas fees, and instant access to your Bitcoin Asia Pioneer Badge.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <a
                href={botUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 rounded-full bg-yellow-500 hover:bg-yellow-400 px-8 py-4 text-base font-bold text-black shadow-xl shadow-yellow-500/25 transition active:scale-98"
              >
                <MessageCircle className="h-5 w-5" />
                <span>Start in Telegram (Free)</span>
                <ArrowRight className="h-4 w-4" />
              </a>

              <div className={`hidden sm:flex items-center gap-3 rounded-2xl border p-2.5 pr-4 ${line} ${dark ? 'bg-white/[0.03]' : 'bg-white shadow-sm'}`}>
                <div className="p-1.5 bg-white rounded-xl shadow-xs">
                  <QRCodeSVG value={botUrl} size={48} level="M" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold flex items-center gap-1">
                    <QrCode className="h-3.5 w-3.5 text-yellow-400" /> Scan with Phone
                  </div>
                  <div className="text-[11px] text-slate-400">Open Telegram instantly</div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-yellow-400" /> Free to activate
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-yellow-400" /> 100% Self-Custodial
              </span>
              <span className="flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-yellow-400" /> Zero Gas Fees Forever
              </span>
            </div>
          </div>

          <div className="flex justify-center">
            <PioneerQuestCard dark={dark} botUrl={botUrl} />
          </div>
        </div>
      </section>

      <section className={`border-y ${line} ${dark ? 'bg-white/[0.01]' : 'bg-white'}`}>
        <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8 lg:px-12 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div>
            <div className="text-2xl sm:text-3xl font-black text-yellow-400 font-mono">
              {walletCount === null ? '12,400+' : walletCount.toLocaleString()}
            </div>
            <div className={`text-xs mt-1 ${subtle}`}>Wallets Activated</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black font-mono">$0.00</div>
            <div className={`text-xs mt-1 ${subtle}`}>User Gas Fees Paid (100% Free)</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black font-mono">&lt; 1.2s</div>
            <div className={`text-xs mt-1 ${subtle}`}>Instant Settlement Speed</div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black font-mono">4 Apps</div>
            <div className={`text-xs mt-1 ${subtle}`}>Telegram · WhatsApp · Discord · Slack</div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-16 sm:px-8 sm:py-20 lg:px-12">
        <div className="grid gap-5 md:grid-cols-3 max-w-5xl mx-auto">
          {[
            {
              icon: Fingerprint,
              title: 'No Seed Phrases',
              desc: 'Log in with Face ID or fingerprint passkey. Your key stays in your phone’s secure hardware.',
            },
            {
              icon: Zap,
              title: 'Zero Gas Fees',
              desc: 'Transactions are 100% sponsored. You never need to buy or bridge gas tokens.',
            },
            {
              icon: MessageCircle,
              title: 'Pay Inside Any Chat',
              desc: 'Send, split, and receive stablecoins directly inside Telegram, WhatsApp, Discord, or Slack.',
            },
          ].map((cardItem) => {
            const Icon = cardItem.icon;
            return (
              <div key={cardItem.title} className={`rounded-3xl border p-7 ${card}`}>
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-yellow-500/10 text-yellow-400 mb-5">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="text-lg font-bold">{cardItem.title}</h3>
                <p className={`mt-2 text-xs sm:text-sm leading-relaxed ${subtle}`}>{cardItem.desc}</p>
              </div>
            );
          })}
        </div>

        <div className={`mt-14 pt-8 border-t ${line} flex flex-col sm:flex-row items-center justify-between gap-4 text-xs ${subtle}`}>
          <span>Independent VeriAgent Pay campaign for the Bitcoin Asia community.</span>
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:text-yellow-400 transition">
              Home
            </Link>
            <span>·</span>
            <Link href="/hk2026" className="hover:text-yellow-400 transition">
              Hong Kong 2026 Badge
            </Link>
          </div>
        </div>
      </section>

      <div className={`fixed inset-x-0 bottom-0 z-40 border-t p-3.5 backdrop-blur-xl sm:hidden ${line} ${dark ? 'bg-[#090A0D]/90' : 'bg-white/90'}`}>
        <a
          href={botUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-yellow-500 hover:bg-yellow-400 py-3.5 text-sm font-bold text-black shadow-lg shadow-yellow-500/25"
        >
          <MessageCircle className="h-4 w-4" />
          <span>Launch Telegram Bot</span>
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </main>
  );
}

export default function ActivatePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white dark:bg-[#090A0D]" aria-busy="true" />}>
      <ActivateContent />
    </Suspense>
  );
}
