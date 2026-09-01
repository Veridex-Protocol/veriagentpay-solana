import Link from 'next/link';
import { Home, Sparkles, Send, TrendingUp } from 'lucide-react';

/**
 * Product-level 404 fallback.
 * Displays a sleek, glassmorphic 404 screen consistent with VeriAgent Pay branding.
 */
export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#070A11] text-white px-6 py-16 flex flex-col items-center justify-center relative overflow-hidden font-sans">
      {/* Ambient background glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-yellow-500/10 rounded-full blur-[120px] pointer-events-none"
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-lg mx-auto text-center">
        {/* Animated Icon Badge */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 shadow-[0_0_25px_rgba(234,179,8,0.25)]">
          <Sparkles className="w-8 h-8" />
        </div>

        {/* 404 Status Kicker */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider uppercase bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 mb-4">
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          404 · Page Not Found
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">
          This payment path does not exist.
        </h1>

        <p className="text-sm text-slate-400 leading-relaxed max-w-md mx-auto mb-8">
          The link you followed may have expired, moved, or never existed on-chain. You can safely return home or explore available features below.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm bg-yellow-500 text-black hover:bg-yellow-400 transition-all shadow-[0_0_20px_rgba(234,179,8,0.3)] hover:scale-[1.02]"
          >
            <Home className="w-4 h-4" />
            Back to Home
          </Link>

          <Link
            href="/onboard"
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-yellow-500/40 transition-all"
          >
            Create Wallet
          </Link>
        </div>

        {/* Quick Nav Cards */}
        <div className="grid grid-cols-2 gap-3 pt-8 border-t border-white/10 text-left">
          <Link
            href="/send"
            className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5 hover:border-yellow-500/30 hover:bg-white/[0.06] transition-all group"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-white mb-1">
              <Send className="w-3.5 h-3.5 text-yellow-400 group-hover:translate-x-0.5 transition-transform" />
              <span>Send USDT</span>
            </div>
            <p className="text-[11px] text-slate-400">Transfer in chat via passkey</p>
          </Link>

          <Link
            href="/vaults"
            className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5 hover:border-yellow-500/30 hover:bg-white/[0.06] transition-all group"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-white mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-yellow-400 group-hover:translate-x-0.5 transition-transform" />
              <span>Auto-Save Vaults</span>
            </div>
            <p className="text-[11px] text-slate-400">Automated yield savings</p>
          </Link>
        </div>

        {/* Help / Socials */}
        <div className="mt-8 text-xs text-slate-500 flex items-center justify-center gap-4">
          <span>Need help?</span>
          <a
            href="https://t.me/VeriagentPay"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-yellow-400 transition-colors"
          >
            Telegram
          </a>
          <span>·</span>
          <a
            href="https://x.com/veriagentpay"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-yellow-400 transition-colors"
          >
            Twitter / X
          </a>
        </div>
      </div>
    </main>
  );
}
