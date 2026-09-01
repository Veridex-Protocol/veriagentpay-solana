'use client';

import React, { useState } from 'react';
import { AppLayout } from '../../components/layout/AppLayout';
import { useTheme } from '../../components/providers/ThemeProvider';
import { ShieldCheck, TrendingUp, CheckCircle2 } from 'lucide-react';
import { useVaults, useYieldApy } from '../../hooks/useApi';

export default function VaultsPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [depositAmount, setDepositAmount] = useState(2500);

  const { data: vaults = [], isLoading } = useVaults();

  // Projections track the attested rate rather than a fixed 5.8%. Null means
  // the oracle has no usable reading, and the calculator says so instead of
  // quoting a return it cannot back.
  const { apy: liveApy, label: apyLabel } = useYieldApy();
  const projectedYieldYearly = liveApy === null ? null : (depositAmount * (liveApy / 100)).toFixed(2);
  const projectedYieldMonthly = liveApy === null ? null : (depositAmount * (liveApy / 100) / 12).toFixed(2);

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Header Title */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider font-bold">
            <span className="flex items-center gap-1 text-[#D4A106] dark:text-[#F2D827]">
              <TrendingUp className="w-4 h-4" />
              <span>AUTOMATED SAVINGS</span>
            </span>
            <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-mono font-semibold text-amber-400 border border-amber-500/30">
              Coming Soon
            </span>
          </div>
          <h1 className={`text-3xl font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
            High-Yield Vaults
          </h1>
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Put your idle dollars to work. Automated cross-chain savings vaults and lending yields are launching soon.
          </p>
        </div>

        {/* Coming Soon Notice Banner */}
        <div className={`p-4 rounded-xl border flex items-start gap-3 ${
          isDark ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-900'
        }`}>
          <div className="p-1 rounded-md bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="text-xs space-y-1">
            <p className="font-bold">Cross-Chain Yield Infrastructure in Preparation</p>
            <p className="opacity-90">
              Automated savings balances and cross-chain yield routing are being finalized. Vault deposits are temporarily in preview mode while integrations complete.
            </p>
          </div>
        </div>

        {/* Deposit Yield Simulator Card */}
        <div
          className={`rounded-2xl border p-6 md:p-8 space-y-6 shadow-xl transition-colors duration-200 ${isDark
              ? 'bg-[#070A11]/80 border-white/[0.08]'
              : 'bg-white border-slate-200 shadow-slate-200/50'
            }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className={`text-xs font-mono font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Yield Simulator (Preview)
              </span>
              <div className={`text-2xl sm:text-3xl font-extrabold font-mono ${isDark ? 'text-white' : 'text-slate-950'}`}>
                ${depositAmount.toLocaleString()} USDT Principal
              </div>
              <div className={`text-[11px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {apyLabel ? `at ${apyLabel} APY, attested on-chain` : 'awaiting verified rate'}
              </div>
            </div>

            <div className="flex items-center gap-4 text-right font-mono">
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Est. Monthly Return</div>
                <div className="text-sm font-bold text-[#D4A106] dark:text-[#F2D827]">
                  {projectedYieldMonthly ? `+$${projectedYieldMonthly}/mo` : '-'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Est. Annual Return</div>
                <div className="text-lg font-bold text-[#D4A106] dark:text-[#F2D827]">
                  {projectedYieldYearly ? `+$${projectedYieldYearly}/yr` : '-'}
                </div>
              </div>
            </div>
          </div>

          <input
            type="range"
            min="100"
            max="25000"
            step="100"
            value={depositAmount}
            onChange={(e) => setDepositAmount(Number(e.target.value))}
            className="w-full accent-[#F2D827] bg-slate-800 h-2 rounded-lg cursor-pointer"
          />

          <div className={`flex flex-wrap items-center justify-between gap-2 text-xs font-mono pt-2 border-t ${isDark ? 'border-white/[0.08] text-slate-400' : 'border-slate-200 text-slate-500'
            }`}>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#F2D827]" />
              <span>Principal Protected • Hourly Payouts</span>
            </div>
            <div className="flex items-center gap-1 text-amber-400 font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>Launching Soon</span>
            </div>
          </div>
        </div>

        {/* Vault Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {isLoading ? (
            <>
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-64 bg-slate-950/40 rounded-2xl animate-pulse border border-slate-800" />
              ))}
            </>
          ) : vaults.length === 0 ? (
            <div className="col-span-full text-center py-16 space-y-4">
              <TrendingUp className={`w-16 h-16 mx-auto ${isDark ? 'text-slate-700' : 'text-slate-300'}`} />
              <p className={`text-sm font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Automated vaults launching soon. Check back for live yield opportunities.
              </p>
            </div>
          ) : (
            vaults.map((v: any) => (
              <div
                key={v.id}
                className={`rounded-2xl border p-6 space-y-4 text-left flex flex-col justify-between transition-colors ${isDark
                    ? 'bg-[#070A11] border-white/[0.08] hover:border-amber-500/30'
                    : 'bg-white border-slate-200 shadow-sm hover:border-amber-300'
                  }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-xs font-bold font-mono px-2.5 py-1 rounded-lg border bg-amber-500/10 text-amber-400 border-amber-500/20">
                      Coming Soon
                    </span>
                    <span className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {v.apy ? `${v.apy}% Target APY` : 'Target Yield'}
                    </span>
                  </div>

                  <div>
                    <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>{v.name}</h3>
                    <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      {v.description || v.strategy || 'Automated yield strategy'}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 pt-3 border-t border-slate-800/60">
                  <div className="flex justify-between items-center text-[10px] font-mono">
                    <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Status</span>
                    <span className="text-amber-400 font-bold">Coming Soon</span>
                  </div>

                  <button
                    disabled
                    className={`w-full py-2.5 rounded-xl font-bold font-mono text-xs flex items-center justify-center gap-2 cursor-not-allowed opacity-60 ${isDark
                        ? 'bg-slate-800 text-slate-400 border border-slate-700'
                        : 'bg-slate-200 text-slate-600 border border-slate-300'
                      }`}
                  >
                    <span>Deposits Coming Soon</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}
