'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Activity,
  ShieldCheck,
  Layers,
} from 'lucide-react';
import { OfficialLogoMark } from '../ui/OfficialBrand';

interface LandingFooterProps {
  theme?: 'dark' | 'light';
}

export function LandingFooter({ theme = 'dark' }: LandingFooterProps) {
  const isDark = theme === 'dark';

  return (
    <footer
      aria-label="Site Footer"
      className={`border-t pt-16 pb-12 px-4 sm:px-6 lg:px-8 w-full transition-colors duration-200 ${isDark
        ? 'border-white/[0.08] bg-[#070A11] text-slate-400'
        : 'border-slate-200 bg-[#F8FAFC] text-slate-600'
        }`}
    >
      <div className="max-w-7xl mx-auto space-y-12">
        {/* SECTION 1: Editorial Brand & Multi-Chain Network Health Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pb-10 border-b border-white/[0.06] dark:border-white/[0.08] border-slate-200">
          {/* Brand & Descriptor (7 cols) */}
          <div className="lg:col-span-6 space-y-4">
            <div className="flex items-center gap-3">
              <OfficialLogoMark size={36} withSquircle />
              <span className={`font-extrabold text-xl tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
                VeriAgent <span className={isDark ? 'text-yellow-400' : 'text-amber-800'}>Pay</span>
              </span>
            </div>
            <p className={`text-xs sm:text-sm leading-relaxed max-w-xl ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              Multi-chain social payment protocol & AI yield automation natively supporting <strong className={isDark ? 'text-white' : 'text-slate-900'}>BOTChain L1</strong> and <strong className={isDark ? 'text-white' : 'text-slate-900'}>Stellar Soroban</strong> smart contracts with zero seed phrases and gasless settlement.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono pt-1">
              <span className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold flex items-center gap-1.5 ${isDark ? 'bg-slate-900 border-white/[0.08] text-slate-300' : 'bg-white border-slate-200 text-slate-700 shadow-sm'}`}>
                <Layers className="w-3.5 h-3.5 text-yellow-400" />
                <span>Multi-Chain Protocol</span>
              </span>
              <span className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold flex items-center gap-1.5 ${isDark ? 'bg-slate-900 border-white/[0.08] text-slate-300' : 'bg-white border-slate-200 text-slate-700 shadow-sm'}`}>
                <ShieldCheck className="w-3.5 h-3.5 text-yellow-400" />
                <span>WebAuthn P-256 Passkeys</span>
              </span>
            </div>
          </div>

          {/* Multi-Chain Live Network Telemetry Cards (5 cols) */}
          <div className="lg:col-span-6 flex flex-col justify-center space-y-3">
            <div className="flex items-center justify-between text-xs font-mono font-bold uppercase tracking-wider">
              <span className={`flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <Activity className="w-3.5 h-3.5 text-yellow-400" />
                Network Telemetry & Health
              </span>
              <span className="text-yellow-400 text-[10px]">100% Operational</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* BOTChain L1 Status Card */}
              <div
                className={`p-3.5 rounded-xl border space-y-2 transition-all ${isDark
                  ? 'bg-slate-950/80 border-white/[0.08] hover:border-yellow-500/30'
                  : 'bg-white border-slate-200 shadow-sm hover:border-yellow-500/30'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                    <span className={`font-bold text-xs ${isDark ? 'text-white' : 'text-slate-950'}`}>BOTChain L1</span>
                  </div>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isDark ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                    EVM Mainnet
                  </span>
                </div>
                <div className={`text-[11px] font-mono space-y-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  <div className="flex justify-between">
                    <span>Block Time:</span>
                    <span className="font-semibold text-yellow-400">0.42s avg</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Uptime:</span>
                    <span className="font-semibold">99.99%</span>
                  </div>
                </div>
              </div>

              {/* Stellar Network Status Card */}
              <div
                className={`p-3.5 rounded-xl border space-y-2 transition-all ${isDark
                  ? 'bg-slate-950/80 border-white/[0.08] hover:border-sky-400/30'
                  : 'bg-white border-slate-200 shadow-sm hover:border-sky-400/30'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                    <span className={`font-bold text-xs ${isDark ? 'text-white' : 'text-slate-950'}`}>Stellar Network</span>
                  </div>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isDark ? 'bg-sky-400/10 text-sky-400 border border-sky-400/20' : 'bg-sky-50 text-sky-700 border border-sky-200'}`}>
                    Soroban & Anchors
                  </span>
                </div>
                <div className={`text-[11px] font-mono space-y-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  <div className="flex justify-between">
                    <span>Smart Contracts:</span>
                    <span className="font-semibold text-sky-400">Soroban Active</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fiat Ramps:</span>
                    <span className="font-semibold">Anchors Live</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: 5-Column High-Density Directory Grid */}
        <nav aria-label="Footer Directory" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8">
          {/* Column 1: Products */}
          <div className="space-y-3">
            <h3 className={`text-xs font-bold uppercase tracking-wider font-mono ${isDark ? 'text-white' : 'text-slate-950'}`}>
              Products
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/dashboard" className="hover:text-[#F2D827] transition-colors flex items-center justify-between group">
                  <span>Web App</span>
                  <span className="text-[10px] font-mono opacity-0 group-hover:opacity-100 transition-opacity text-[#F2D827]">Live</span>
                </Link>
              </li>
              <li>
                <a href="https://t.me/VeriAgentPayBot" target="_blank" rel="noopener noreferrer" className="hover:text-[#F2D827] transition-colors flex items-center gap-1 group">
                  <span>Telegram Bot</span>
                  <ArrowUpRight className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity" />
                </a>
              </li>
              <li>
                <Link href="/vaults" className="hover:text-[#F2D827] transition-colors">Yield Vaults (Soon)</Link>
              </li>
              <li>
                <Link href="/pools" className="hover:text-[#F2D827] transition-colors">Group Pools</Link>
              </li>
              <li>
                <Link href="/envelopes" className="hover:text-[#F2D827] transition-colors">Cash Envelopes</Link>
              </li>
            </ul>
          </div>

          {/* Column 2: Supported Networks */}
          <div className="space-y-3">
            <h3 className={`text-xs font-bold uppercase tracking-wider font-mono ${isDark ? 'text-white' : 'text-slate-950'}`}>
              Chains & L1s
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <span className="hover:text-[#F2D827] transition-colors flex items-center justify-between">
                  <span>BOTChain L1</span>
                  <span className={`text-[9px] font-mono px-1 rounded ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'}`}>EVM</span>
                </span>
              </li>
              <li>
                <span className="hover:text-[#F2D827] transition-colors flex items-center justify-between">
                  <span>Stellar Network</span>
                  <span className={`text-[9px] font-mono px-1 rounded ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'}`}>Soroban</span>
                </span>
              </li>
              <li>
                <span className="hover:text-[#F2D827] transition-colors flex items-center justify-between">
                  <span>Tether USDT</span>
                  <span className={`text-[9px] font-mono px-1 rounded ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'}`}>Native</span>
                </span>
              </li>
              <li>
                <span className="text-slate-500 flex items-center justify-between">
                  <span>Arbitrum L2</span>
                  <span className="text-[9px] font-mono text-amber-500">Q3</span>
                </span>
              </li>
              <li>
                <span className="text-slate-500 flex items-center justify-between">
                  <span>Solana Network</span>
                  <span className="text-[9px] font-mono text-amber-500">Q3</span>
                </span>
              </li>
            </ul>
          </div>

          {/* Column 3: Architecture */}
          <div className="space-y-3">
            <h3 className={`text-xs font-bold uppercase tracking-wider font-mono ${isDark ? 'text-white' : 'text-slate-950'}`}>
              Architecture
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <span className="hover:text-[#F2D827] transition-colors">Passkey WebAuthn (P-256)</span>
              </li>
              <li>
                <span className="hover:text-[#F2D827] transition-colors">ERC-4337 Bundler</span>
              </li>
              <li>
                <span className="hover:text-[#F2D827] transition-colors">zkTLS Attestation</span>
              </li>
              <li>
                <span className="hover:text-[#F2D827] transition-colors">Gas Paymasters</span>
              </li>
              <li>
                <span className="hover:text-[#F2D827] transition-colors">Stellar Anchor Ramps</span>
              </li>
            </ul>
          </div>

          {/* Column 4: Developers */}
          <div className="space-y-3">
            <h3 className={`text-xs font-bold uppercase tracking-wider font-mono ${isDark ? 'text-white' : 'text-slate-950'}`}>
              Developers
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <a
                  href="https://app.testnet.veriagentpay.xyz/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#F2D827] transition-colors flex items-center gap-1 group font-semibold text-[#D4A106] dark:text-[#F2D827]"
                >
                  <span>Testnet App</span>
                  <ArrowUpRight className="w-3 h-3 opacity-75 group-hover:opacity-100" />
                </a>
              </li>
              <li>
                <a href="#docs" className="hover:text-[#F2D827] transition-colors">Documentation</a>
              </li>
              <li>
                <a href="#api" className="hover:text-[#F2D827] transition-colors">API Reference</a>
              </li>
              <li>
                <a href="#faucet" className="hover:text-[#F2D827] transition-colors">Testnet Faucet</a>
              </li>
            </ul>
          </div>

          {/* Column 5: Ecosystem & Legal */}
          <div className="space-y-3">
            <h3 className={`text-xs font-bold uppercase tracking-wider font-mono ${isDark ? 'text-white' : 'text-slate-950'}`}>
              Ecosystem & Legal
            </h3>
            <ul className="space-y-2 text-xs">
              <li>
                <a
                  href="https://t.me/VeriagentPay"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#F2D827] transition-colors flex items-center gap-1 group"
                >
                  <span>Telegram Community</span>
                  <ArrowUpRight className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                </a>
              </li>
              <li>
                <a href="https://x.com/veriagentpay" target="_blank" rel="noopener noreferrer" className="hover:text-[#F2D827] transition-colors flex items-center gap-1 group">
                  <span>Twitter / X (@veriagentpay)</span>
                  <ArrowUpRight className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                </a>
              </li>
              <li>
                <a href="https://discord.gg" target="_blank" rel="noopener noreferrer" className="hover:text-[#F2D827] transition-colors flex items-center gap-1 group">
                  <span>Discord</span>
                  <ArrowUpRight className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                </a>
              </li>
              <li>
                <a href="#security" className="hover:text-[#F2D827] transition-colors">Security Audit</a>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-[#F2D827] transition-colors">Privacy Policy</Link>
              </li>
            </ul>
          </div>
        </nav>

        {/* SECTION 3: Giant Editorial Watermark & Copyright Bar */}
        <div className="space-y-6 pt-4">
          {/* Subtle Monospace Watermark Banner */}
          <div
            className={`w-full py-4 border-y text-center font-mono text-[11px] sm:text-xs tracking-[0.25em] uppercase select-none overflow-hidden whitespace-nowrap transition-colors ${isDark
              ? 'border-white/[0.06] text-slate-500/40 bg-white/[0.01]'
              : 'border-slate-200 text-slate-400 bg-slate-100/50'
              }`}
          >
            VERIAGENT PAY • BOTCHAIN L1 + STELLAR SOROBAN • INTEROPERABLE SOCIAL SETTLEMENT
          </div>

          {/* Copyright & Live Testnet Link */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono">
            <address className="not-italic text-center sm:text-left">
              Copyright © 2026 VeriAgent Pay. Built for BOTChain L1 & Stellar Network.
            </address>

            <a
              href="https://app.testnet.veriagentpay.xyz/"
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${isDark
                ? 'bg-slate-950 border-white/[0.08] hover:border-[#F2D827]/40 text-slate-300'
                : 'bg-white border-slate-200 hover:border-[#F2D827]/40 text-slate-700 shadow-sm'
                }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#F2D827] animate-pulse" />
              <span>Testnet Live:</span>
              <span className="font-bold text-[#D4A106] dark:text-[#F2D827] underline">app.testnet.veriagentpay.xyz</span>
              <ArrowUpRight className="w-3 h-3 text-[#D4A106] dark:text-[#F2D827]" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

