'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Fingerprint,
  MapPin,
  MessageCircle,
  Moon,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
} from 'lucide-react';
import { telegramDeepLink } from '../../lib/app-url';
import { useTheme } from '../../components/providers/ThemeProvider';
import { Wordmark } from '../../components/marketing/header/Wordmark';
import { VeriAgentLoader } from '../../components/ui/VeriAgentLoader';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const WINDOW_START = new Date(process.env.NEXT_PUBLIC_HK2026_START || '2026-08-27T01:00:00Z');
const WINDOW_END = new Date(process.env.NEXT_PUBLIC_HK2026_END || '2026-08-29T10:00:00Z');

type WindowState = 'before' | 'open' | 'after';

function useWindowState(): { state: WindowState; now: Date } {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const reference = now ?? WINDOW_START;
  const state = now === null ? 'before' : reference < WINDOW_START ? 'before' : reference > WINDOW_END ? 'after' : 'open';
  return { state, now: reference };
}

function formatCountdown(ms: number) {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const time = [hours, minutes, seconds].map((number) => String(number).padStart(2, '0')).join(':');
  return days ? `${days}d ${time}` : time;
}

function Hk2026Content() {
  const searchParams = useSearchParams();
  const { state, now } = useWindowState();
  const { theme, toggleTheme } = useTheme();
  const [opening, setOpening] = useState(false);
  const dark = theme === 'dark';

  const botUrl = useMemo(() => {
    const ref = searchParams.get('ref');
    return telegramDeepLink(ref ? `ref_${ref}` : 'hk2026');
  }, [searchParams]);

  useEffect(() => {
    fetch(`${API_URL}/api/analytics/funnel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'activate_page_viewed', src: 'bitcoin_asia_hk', campaign: 'hk2026', channel: 'conference' }),
    }).catch(() => undefined);
  }, []);

  const countdown = state === 'before'
    ? formatCountdown(WINDOW_START.getTime() - now.getTime())
    : state === 'open'
      ? formatCountdown(WINDOW_END.getTime() - now.getTime())
      : '';
  const page = dark ? 'bg-[#0A0B0D] text-white' : 'bg-white text-black';
  const subtle = dark ? 'text-[#A7A7A7]' : 'text-[#525252]';
  const line = dark ? 'border-white/10' : 'border-black/10';
  const card = dark ? 'border-white/10 bg-white/[.04]' : 'border-black/10 bg-[#F7F7F7]';
  const primary = dark ? 'bg-white !text-black hover:bg-slate-200' : 'bg-black !text-white hover:bg-slate-800';
  const trackTelegramClick = () => {
    fetch(`${API_URL}/api/analytics/funnel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'telegram_deeplink_clicked', src: 'bitcoin_asia_hk', campaign: 'hk2026', channel: 'conference' }),
      keepalive: true,
    }).catch(() => undefined);
  };

  return (
    <main className={`min-h-screen overflow-x-hidden antialiased transition-colors duration-300 ${page}`} style={{ colorScheme: dark ? 'dark' : 'light' }}>
      <header className={`sticky top-0 z-40 border-b backdrop-blur-xl ${line} ${dark ? 'bg-[#0A0B0D]/90' : 'bg-white/90'}`}>
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-4 sm:h-16 sm:px-8 lg:px-12">
          <Link href="/" className="flex items-center">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/activate" className={`hidden items-center gap-2 text-sm font-medium sm:flex ${subtle}`}><ArrowLeft className="h-4 w-4" /> Activation</Link>
            <button onClick={toggleTheme} aria-label={`Switch to ${dark ? 'light' : 'dark'} theme`} aria-pressed={dark} className={`rounded-full p-2.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 ${dark ? 'bg-white/10 hover:bg-white/15 focus-visible:ring-offset-black' : 'bg-black/5 hover:bg-black/10 focus-visible:ring-offset-white'}`}>{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1360px] items-center gap-12 px-5 py-12 sm:px-8 sm:py-16 lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[1.05fr_.95fr] lg:px-12 lg:py-20">
        <div className="max-w-2xl">
          <div className={`mb-7 inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs sm:text-sm ${line}`}><MapPin className="h-4 w-4 text-amber-500" /> Bitcoin Asia 2026 · Hong Kong</div>
          <h1 className="text-[clamp(3.25rem,7vw,7rem)] font-normal leading-[.91] tracking-[-0.06em] sm:leading-[.89]">Your Hong Kong <span className="text-amber-500">Pioneer badge.</span></h1>
          <p className={`mt-7 max-w-xl text-base leading-relaxed sm:text-xl ${subtle}`}>Create your wallet now. Claim your badge in Hong Kong.</p>

          <div className={`mt-9 inline-flex items-center gap-3 rounded-2xl border px-5 py-4 ${card}`}>
            <Clock className="h-5 w-5 text-amber-500" />
            <div><div className={`text-xs ${subtle}`}>{state === 'before' ? 'Claiming opens in' : state === 'open' ? 'Claiming closes in' : 'Claim status'}</div><div className="mt-0.5 font-mono text-base font-semibold">{state === 'after' ? 'Window closed' : countdown}</div></div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row [&>*]:min-h-12">
            {state === 'open' ? (
              <a href={botUrl} onClick={() => { setOpening(true); trackTelegramClick(); }} className={`inline-flex items-center justify-center gap-2 rounded-full px-7 py-4 font-semibold transition ${primary}`}>
                {opening ? <><CheckCircle2 className="h-5 w-5" /> Opening Telegram…</> : <><Award className="h-5 w-5" /> Claim badge</>}
              </a>
            ) : (
              <a href={botUrl} onClick={trackTelegramClick} className={`inline-flex items-center justify-center gap-2 rounded-full px-7 py-4 font-semibold transition ${primary}`}><MessageCircle className="h-5 w-5" /> {state === 'before' ? 'Get wallet-ready' : 'Create a wallet'} <ArrowRight className="h-4 w-4" /></a>
            )}
            <Link href="/activate" className={`inline-flex items-center justify-center rounded-full border px-7 py-4 font-semibold transition ${line} ${dark ? '!text-white hover:bg-white/5' : '!text-black hover:bg-black/5'}`}>Learn how it works</Link>
          </div>
          <p className={`mt-4 text-xs ${subtle}`}>One badge per wallet · Soulbound · Minted on BOTChain</p>
        </div>

        <div className="relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-[1.75rem] bg-[radial-gradient(circle_at_20%_10%,#fde68a_0,transparent_32%),radial-gradient(circle_at_85%_80%,#6ee7b7_0,transparent_34%),linear-gradient(135deg,#fef3c7,#fed7aa_48%,#a7f3d0)] p-6 sm:min-h-[520px] sm:rounded-[2.5rem] sm:p-8 lg:min-h-[590px]">
          <div className="absolute left-5 top-5 rounded-full bg-black px-3.5 py-1.5 text-[10px] font-semibold !text-white sm:left-8 sm:top-8 sm:px-4 sm:py-2 sm:text-xs">Limited · HK 2026</div>
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full border-[32px] border-white/25" />
          <div className="absolute -bottom-24 -left-20 h-72 w-72 rounded-full border-[42px] border-white/20" />
          <div className="relative">
            <div className="absolute inset-0 scale-110 rounded-full bg-amber-300/50 blur-3xl" />
            <div className="relative flex h-56 w-56 items-center justify-center rounded-full border-[6px] border-amber-300 bg-[radial-gradient(circle_at_30%_25%,#3f4653,#12151b_68%)] shadow-[0_32px_80px_rgba(15,23,42,.4)] sm:h-72 sm:w-72 sm:border-[7px] lg:h-80 lg:w-80">
              <div className="absolute inset-4 rounded-full border border-amber-300/35" />
              <div className="text-center text-amber-300"><Award className="mx-auto h-16 w-16 sm:h-20 sm:w-20" /><div className="mt-4 font-mono text-xs font-bold uppercase tracking-[.24em] sm:mt-5 sm:text-sm">Pioneer</div><div className="mt-1 font-mono text-[10px] tracking-[.16em] sm:text-xs sm:tracking-[.2em]">Hong Kong · 2026</div></div>
            </div>
          </div>
        </div>
      </section>

      <section className={`border-y ${line}`}>
        <div className="mx-auto max-w-[1440px] px-5 py-20 sm:px-8 sm:py-24 lg:px-12 lg:py-32">
          <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]">
            <div><div className={`text-sm font-medium ${subtle}`}>HOW TO QUALIFY</div><h2 className="mt-5 text-4xl font-normal leading-[.95] tracking-[-0.05em] sm:text-6xl">Three steps.<br />One permanent badge.</h2></div>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                { icon: Fingerprint, number: '01', title: 'Create your wallet', copy: 'Set up a passkey-secured wallet from Telegram before or during the event.' },
                { icon: ShieldCheck, number: '02', title: 'Verify eligibility', copy: 'Open the conference flow from the same Telegram account and wallet.' },
                { icon: Sparkles, number: '03', title: 'Claim in Hong Kong', copy: 'Mint your soulbound Pioneer badge while the event window is live.' },
              ].map(({ icon: Icon, number, title, copy }) => (
                <div key={title} className={`rounded-3xl border p-6 ${card}`}><div className="flex items-center justify-between"><Icon className="h-6 w-6 text-amber-500" /><span className={`text-xs ${subtle}`}>{number}</span></div><h3 className="mt-10 text-lg font-semibold sm:mt-14">{title}</h3><p className={`mt-3 text-sm leading-relaxed ${subtle}`}>{copy}</p></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-5 py-20 sm:px-8 sm:py-24 lg:px-12 lg:py-32">
        <div className="grid overflow-hidden rounded-[1.75rem] bg-black text-white sm:rounded-[2.5rem] lg:grid-cols-[1.1fr_.9fr]">
          <div className="p-7 sm:p-12 lg:p-16"><CalendarDays className="h-8 w-8 text-amber-400" /><h2 className="mt-7 max-w-2xl text-4xl font-normal leading-[.95] tracking-[-0.05em] sm:mt-8 sm:text-6xl">Don’t wait at the venue to set up your wallet.</h2><p className="mt-5 max-w-xl text-base text-white/65 sm:mt-6 sm:text-lg">Activate beforehand so claiming the badge in Hong Kong is the only step left.</p><a href={botUrl} onClick={trackTelegramClick} className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 py-4 text-sm font-semibold !text-black sm:mt-8 sm:px-7 sm:text-base"><Send className="h-4 w-4" /> Open VeriAgent in Telegram</a></div>
          <div className="flex min-h-80 items-center justify-center bg-[radial-gradient(ellipse_at_top,#F2D827_0%,transparent_60%),linear-gradient(135deg,#1c1917,#090A0D_60%,#292524)] p-10"><div className="rounded-[2rem] bg-[#070A11] border border-white/10 p-7 text-white shadow-2xl"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#229ED9] text-white"><Send className="h-4 w-4" /></span><div><div className="font-semibold text-white">VeriAgent Pay</div><div className="text-xs text-slate-400">Telegram bot</div></div></div><div className="my-6 h-px bg-white/10" />{['Wallet created', 'Passkey secured', 'Badge eligibility ready'].map((item) => <div key={item} className="mt-3 flex items-center gap-3 text-sm text-slate-200"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#F2D827] text-slate-950 font-bold"><Check className="h-3.5 w-3.5" /></span>{item}</div>)}</div></div>
        </div>
        <p className={`mt-7 text-center text-xs ${subtle}`}>Independent VeriAgent Pay campaign for the Bitcoin Asia community. Not an official Bitcoin Asia promotion.</p>
      </section>
    </main>
  );
}

export default function Hk2026Page() {
  return (
    <Suspense
      fallback={
        <VeriAgentLoader
          variant="fullscreen"
          size="md"
          text="HK 2026"
          subtext="Loading event credentials..."
          showProgress={true}
        />
      }
    >
      <Hk2026Content />
    </Suspense>
  );
}
