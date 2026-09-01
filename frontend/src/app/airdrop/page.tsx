'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AppLayout } from '../../components/layout/AppLayout';
import { useTheme } from '../../components/providers/ThemeProvider';
import { Sparkles, ArrowRight, CheckCircle2, TrendingUp } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function AirdropClaimPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [claimed, setClaimed] = useState(false);

  const handleClaim = () => {
    setClaimed(true);
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-mono text-[#D4A106] dark:text-[#F2D827] uppercase tracking-wider">
            <Sparkles className="w-4 h-4" />
            <span>Community Governance Distribution</span>
          </div>
          <h1 className={`text-3xl font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
            VERI Token Airdrop & Rewards
          </h1>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Unlock your vested 250 VERI reward by depositing into any zkTLS AI Yield Vault.
          </p>
        </div>

        {/* Main Airdrop Container */}
        <div
          className={`rounded-2xl border p-6 md:p-8 space-y-6 shadow-xl transition-colors duration-200 ${isDark
            ? 'bg-[#070A11] border-white/[0.08]'
            : 'bg-white border-slate-200 shadow-slate-200/50 text-slate-950'
            }`}
        >
          <div className="flex items-center justify-between border-b pb-5 border-slate-800">
            <div>
              <span className={`text-xs font-mono font-bold uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Eligible Vested Allocation
              </span>
              <div className={`text-4xl font-extrabold font-mono tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
                250 <span className="text-[#D4A106] dark:text-[#F2D827] font-bold">VERI</span>
              </div>
            </div>

            <span className="text-xs font-mono font-bold text-[#D4A106] dark:text-[#F2D827] bg-[#F2D827]/10 border border-[#F2D827]/30 px-3 py-1 rounded-full flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>Wallet Eligible</span>
            </span>
          </div>

          {/* Campaign Requirement Box */}
          <div className={`p-4 rounded-xl border space-y-2 font-mono text-xs ${isDark ? 'bg-slate-950 border-white/[0.08]' : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}>
            <div className="flex items-center justify-between font-bold">
              <span className="text-[#D4A106] dark:text-[#F2D827]">Requirement Checklist</span>
              <span className="text-slate-400">1 / 1 Completed</span>
            </div>
            <p className={isDark ? 'text-slate-300' : 'text-slate-600'}>
              • Minimum $50 USDC deposit into any zkTLS Yield Vault to unlock full airdrop vesting.
            </p>
          </div>

          {/* Clean Primary / Secondary Button Hierarchy */}
          <div className="space-y-3 pt-2">
            <Link
              href="/vaults"
              className="w-full py-3.5 rounded-xl font-bold text-sm shadow-lg flex items-center justify-center gap-2 transition hover:scale-[1.01] active:scale-[0.99] bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 shadow-amber-950/20"
            >
              <TrendingUp className="w-4 h-4" />
              <span>Deposit $50 in Yield Vault First</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <button
              onClick={handleClaim}
              disabled={claimed}
              className={`w-full py-3.5 rounded-xl border font-mono font-bold text-xs transition ${claimed
                ? 'bg-slate-800 border-slate-700 text-[#F2D827]'
                : isDark
                  ? 'bg-slate-950 hover:bg-slate-800 border-white/[0.08] text-slate-200'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                }`}
            >
              {claimed ? '✓ 250 VERI Airdrop Claimed!' : 'Claim Vested 250 VERI Airdrop'}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
