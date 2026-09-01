'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '../Sidebar';
import { BottomNav } from '../BottomNav';
import { useWalletStore } from '../../store/useWalletStore';
import { useBalances } from '../../hooks/useApi';
import { CopyToClipboard } from '../ui/CopyToClipboard';
import { NotificationCenter } from '../NotificationCenter';
import { PasskeyOnboardingModal } from '../PasskeyOnboardingModal';
import { SessionKeyGuard } from '../SessionKeyGuard';
import { MaintenanceBanner } from '../MaintenanceBanner';
import { ShieldCheck, Eye, EyeOff, Sun, Moon } from 'lucide-react';
import { AnimatedNumber } from '../ui/AnimatedNumber';
import { useTheme } from '../providers/ThemeProvider';
import { OfficialLogoMark } from '../ui/OfficialBrand';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { address, hideBalances, toggleHideBalances } = useWalletStore();
  const { data: balanceData } = useBalances();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      const tg = (window as any).Telegram.WebApp;
      tg.enableClosingConfirmation?.();

      if (pathname !== '/' && pathname !== '/dashboard') {
        tg.BackButton?.show();
        const handleBack = () => router.back();
        tg.BackButton?.onClick(handleBack);
        return () => {
          tg.BackButton?.offClick(handleBack);
          tg.BackButton?.hide();
        };
      } else {
        tg.BackButton?.hide();
      }
    }
  }, [pathname, router]);

  // Global chatbot url auto-login resolver
  useEffect(() => {
    const resolveUrlUser = async () => {
      if (typeof window === 'undefined') return;
      const searchParams = new URLSearchParams(window.location.search);
      const platId = searchParams.get('userId');
      const platUsername = searchParams.get('username');

      const lookupHandle = platId || platUsername;
      if (!lookupHandle) return;

      const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
      try {
        const res = await fetch(`${apiBase}/api/identity/resolve?platform=telegram&handle=${encodeURIComponent(lookupHandle)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.address) {
            useWalletStore.getState().setAddress(data.address);
            if (data.hasPasskey) {
              useWalletStore.getState().setPasskeyRegistered(true);
            }
          }
        }
      } catch (err) {
        console.error('AppLayout failed to resolve user:', err);
      }
    };

    resolveUrlUser();
  }, []);

  const [mounted, setMounted] = React.useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const totalUsd = balanceData?.totalUsd ?? 0;

  const displayAddress = mounted && address
    ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
    : 'No passkey connected';

  return (
    <SessionKeyGuard>
      <div className={`flex min-h-screen antialiased touch-pan-y transition-colors duration-200 ${isDark ? 'bg-black text-slate-100' : 'bg-white text-slate-950'
        }`}>
      {/* Skip Navigation link */}
      <a
        href="#main-content"
        suppressHydrationWarning
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#F2D827] focus:text-slate-950 focus:font-bold focus:rounded-xl focus:ring-2 focus:ring-[#F2D827]/40"
      >
        Skip to main content
      </a>

      {/* Passkey onboarding modal */}
      <PasskeyOnboardingModal />

      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <main id="main-content" tabIndex={-1} className="flex min-w-0 flex-1 flex-col pb-24 md:pb-6 focus:outline-none">
        <MaintenanceBanner />

        {/* Header bar */}
        <header className={`sticky top-0 z-30 flex items-center justify-between border-b px-4 py-3 backdrop-blur-xl md:px-8 transition-colors duration-200 ${isDark
          ? 'border-white/[0.12] bg-black/80'
          : 'border-[#e2e2e7] bg-white/80'
          }`}>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 md:hidden">
              <OfficialLogoMark size={32} withSquircle />
              <div>
              </div>
            </div>
            <div className={`hidden items-center gap-2 rounded-xl border px-3 py-1.5 font-mono text-xs sm:flex ${isDark ? 'border-white/[0.08] bg-slate-950/80 text-slate-300' : 'border-slate-200 bg-slate-100 text-slate-700'
              }`}>
              <ShieldCheck className="w-4 h-4 text-[#F2D827]" />
              <span suppressHydrationWarning>Passkey: {displayAddress}</span>
              {/* Icon only: the span above already shows the address. */}
              {mounted && address && <CopyToClipboard text={address} iconOnly />}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Balance Summary Header Pill */}
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium ${isDark ? 'border-white/[0.08] bg-slate-950/80' : 'border-slate-200 bg-slate-100'
              }`}>
              <span className={`hidden sm:inline text-[11px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Portfolio</span>
              {hideBalances ? (
                <span className="font-mono tracking-widest text-slate-400">••••••</span>
              ) : (
                <span suppressHydrationWarning className={`font-mono font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                  <AnimatedNumber value={totalUsd} prefix="$" />
                </span>
              )}
              <button
                onClick={toggleHideBalances}
                aria-label={hideBalances ? 'Show balances' : 'Hide balances'}
                className={`ml-1 transition-colors ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-950'}`}
              >
                {hideBalances ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Real-time Notification Center Dropdown */}
            <NotificationCenter />
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme mode"
              className={`p-2 rounded-xl border transition-colors ${isDark
                ? 'bg-slate-950 border-white/[0.08] text-[#F2D827] hover:bg-slate-800'
                : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                }`}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Page Content */}
        <section className="va-product-page flex-1">{children}</section>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav />
    </div>
    </SessionKeyGuard>
  );
}
