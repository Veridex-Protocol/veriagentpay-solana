'use client';

import React, { useState } from 'react';
import { Fingerprint, Bot, TrendingUp, Gift, Users, MessageSquare } from 'lucide-react';

interface FeatureGridProps {
  theme?: 'dark' | 'light';
}

export function FeatureGrid({ theme = 'dark' }: FeatureGridProps) {
  const [passkeyActive, setPasskeyActive] = useState(true);
  const [depositAmount, setDepositAmount] = useState(1000);
  const isDark = theme === 'dark';

  const projectedYield = (depositAmount * 0.128).toFixed(2);

  return (
    <section
      id="features"
      className={`py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t w-full transition-colors duration-200 ${isDark ? 'border-white/[0.08]' : 'border-slate-200'
        }`}
    >
      <div className="text-center max-w-3xl mx-auto mb-14 space-y-3">
        <span
          className={`px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider border ${isDark
            ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
            : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
        >
          Architecture Breakdown
        </span>
        <h2 className={`text-3xl sm:text-5xl font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
          Engineered for Performance & Security
        </h2>
        <p className={`text-base ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          Explore the core modular capabilities underpinning VeriAgent Pay.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Bento 1: Passkey Biometrics */}
        <div
          className={`rounded-2xl border p-6 space-y-4 text-left transition-colors duration-200 flex flex-col justify-between ${isDark
            ? 'bg-[#070A11] border-white/[0.08] hover:border-yellow-500/30'
            : 'bg-white border-slate-200 shadow-sm hover:border-yellow-400'
            }`}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${isDark ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                <Fingerprint className="w-5 h-5" />
              </div>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${isDark ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                Hardware P-256
              </span>
            </div>
            <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>Passkey Biometric Auth</h3>
            <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Native WebAuthn authentication using Touch ID or Face ID. Eliminates seed phrase vulnerability vectors.
            </p>
          </div>

          {/* Micro-UI: Passkey Toggle */}
          <div className={`p-3 rounded-xl border flex items-center justify-between ${isDark ? 'bg-slate-950 border-white/[0.08]' : 'bg-slate-100 border-slate-200'}`}>
            <span className={`text-xs font-mono ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Biometric State</span>
            <button
              onClick={() => setPasskeyActive(!passkeyActive)}
              className={`px-3 py-1 rounded-lg text-[11px] font-mono font-bold transition ${passkeyActive
                ? 'bg-yellow-500 text-black'
                : isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-600'
                }`}
            >
              {passkeyActive ? 'AUTHENTICATED' : 'LOCKED'}
            </button>
          </div>
        </div>

        {/* Bento 2: Natural Language NLU */}
        <div
          className={`rounded-2xl border p-6 space-y-4 text-left transition-colors duration-200 flex flex-col justify-between ${isDark
            ? 'bg-[#070A11] border-white/[0.08] hover:border-yellow-500/30'
            : 'bg-white border-slate-200 shadow-sm hover:border-yellow-400'
            }`}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${isDark ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                <Bot className="w-5 h-5" />
              </div>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${isDark ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                Gemini NLU
              </span>
            </div>
            <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>Natural Language Intent Parser</h3>
            <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Processes freeform social prompts and extracts action intents, recipient identifiers, and token symbols.
            </p>
          </div>

          {/* Micro-UI: Code Intent Preview */}
          <div className={`p-3 rounded-xl border font-mono text-[10px] space-y-1 ${isDark ? 'bg-slate-950 border-white/[0.08]' : 'bg-slate-100 border-slate-200'}`}>
            <div className={isDark ? 'text-slate-400' : 'text-slate-500'}>// Parsed Intent Output</div>
            <div className={isDark ? 'text-yellow-400' : 'text-amber-700'}>{`{ intent: "PAY", amount: 50, token: "USDT" }`}</div>
          </div>
        </div>

        {/* Bento 3: zkTLS Yield Vaults */}
        <div
          id="yield"
          className={`rounded-2xl border p-6 space-y-4 text-left transition-colors duration-200 flex flex-col justify-between ${isDark
            ? 'bg-[#070A11] border-white/[0.08] hover:border-yellow-500/30'
            : 'bg-white border-slate-200 shadow-sm hover:border-yellow-400'
            }`}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${isDark ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                <TrendingUp className="w-5 h-5" />
              </div>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${isDark ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                12.8% APY
              </span>
            </div>
            <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>zkTLS Yield Automation</h3>
            <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Idle USDT balances auto-route to verified yield strategies backed by on-chain zkTLS attestations.
            </p>
          </div>

          {/* Micro-UI: APY Estimator */}
          <div className={`p-3 rounded-xl border space-y-2 ${isDark ? 'bg-slate-950 border-white/[0.08]' : 'bg-slate-100 border-slate-200'}`}>
            <div className="flex justify-between text-[11px] font-mono">
              <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>Principal: ${depositAmount}</span>
              <span className={`font-bold ${isDark ? 'text-yellow-400' : 'text-amber-800'}`}>+${projectedYield}/yr</span>
            </div>
            <input
              type="range"
              min="100"
              max="10000"
              step="100"
              value={depositAmount}
              onChange={(e) => setDepositAmount(Number(e.target.value))}
              className="w-full accent-yellow-500 bg-slate-800 h-1 rounded"
            />
          </div>
        </div>

        {/* Bento 4: Merkle Red Envelopes */}
        <div
          className={`rounded-2xl border p-6 space-y-4 text-left transition-colors duration-200 ${isDark
            ? 'bg-[#070A11] border-white/[0.08] hover:border-yellow-500/30'
            : 'bg-white border-slate-200 shadow-sm hover:border-yellow-400'
            }`}
        >
          <div className="flex items-center justify-between">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${isDark ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
              <Gift className="w-5 h-5" />
            </div>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${isDark ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
              Social Drops
            </span>
          </div>
          <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>Merkle Red Envelopes</h3>
          <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Multi-recipient red envelope packet drops escrowed at creation with cryptographic Merkle proof claiming.
          </p>
        </div>

        {/* Bento 5: Social Lending Circles */}
        <div
          className={`rounded-2xl border p-6 space-y-4 text-left transition-colors duration-200 ${isDark
            ? 'bg-[#070A11] border-white/[0.08] hover:border-yellow-500/30'
            : 'bg-white border-slate-200 shadow-sm hover:border-yellow-400'
            }`}
        >
          <div className="flex items-center justify-between">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${isDark ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
              <Users className="w-5 h-5" />
            </div>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${isDark ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
              P2P Pools
            </span>
          </div>
          <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>Group Lending Pools</h3>
          <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Form decentralized lending circles with majority member voting and dynamic social credit scoring.
          </p>
        </div>

        {/* Bento 6: Cross-Platform Mesh */}
        <div
          className={`rounded-2xl border p-6 space-y-4 text-left transition-colors duration-200 ${isDark
            ? 'bg-[#070A11] border-white/[0.08] hover:border-yellow-500/30'
            : 'bg-white border-slate-200 shadow-sm hover:border-yellow-400'
            }`}
        >
          <div className="flex items-center justify-between">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${isDark ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
              <MessageSquare className="w-5 h-5" />
            </div>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${isDark ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
              Universal Drivers
            </span>
          </div>
          <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>Cross-Platform Sync</h3>
          <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Native integrations across Telegram Mini Apps, WhatsApp PWAs, Discord Activities, and Slack Slash Commands.
          </p>
        </div>
      </div>
    </section>
  );
}
