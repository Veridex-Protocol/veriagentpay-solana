'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Fingerprint,
  ArrowRight,
  MessageSquare,
  CheckCircle2,
  Lock,
  CheckCheck,
  Send,
  Hash,
  Layers,
} from 'lucide-react';

interface HeroProps {
  theme?: 'dark' | 'light';
}

export function Hero({ theme = 'dark' }: HeroProps) {
  const [activePlatform, setActivePlatform] = useState<'telegram' | 'whatsapp' | 'discord' | 'slack'>('telegram');
  const isDark = theme === 'dark';

  const platformLabels = {
    telegram: 'Telegram Mini App',
    whatsapp: 'WhatsApp Business API',
    discord: 'Discord Slash Command',
    slack: 'Slack App Integration',
  };

  return (
    <section className="relative pt-8 pb-16 lg:py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        {/* Left-Hand Column */}
        <div className="text-left space-y-6">
          {/* Status Pill */}
          <div
            className={`inline-flex items-center text-xs font-mono px-3.5 py-1.5 rounded-full border ${isDark
              ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
              : 'bg-amber-50 border-amber-300 text-amber-800 font-bold'
              }`}
          >
            <div className="flex items-center gap-1 mr-2">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            </div>
            <span>Built on BOTChain L1 & Stellar • Zero Seed Phrases</span>
          </div>

          {/* Headline */}
          <h1 className={`text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] ${isDark ? 'text-white' : 'text-slate-950'}`}>
            Send Money Like a<br />
            Text.{' '}
            <span className={`relative inline-block ${isDark ? 'text-yellow-400' : 'text-amber-800'}`}>
              Earn Like an AI.
              <span className="absolute bottom-1 left-0 w-full h-[3px] bg-yellow-500/40 rounded-full" />
            </span>
          </h1>

          {/* Subheadline */}
          <p className={`text-base sm:text-lg max-w-xl leading-relaxed mt-6 mb-8 font-normal ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            No 12-word recovery seed phrases to lose. No gas fees to calculate. Open Telegram, WhatsApp, Discord, or Slack, type a payment command, and execute gasless transfers on BOTChain or Stellar with your fingerprint.
          </p>

          {/* Primary CTA Cluster */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <Link
                href="/activate"
                className={`font-semibold px-6 py-3.5 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] ${isDark
                  ? 'bg-yellow-500 hover:bg-yellow-400 text-black shadow-yellow-500/20'
                  : 'bg-yellow-500 hover:bg-yellow-400 text-black shadow-yellow-500/20'
                  }`}
              >
                <span>Launch App, It’s Free</span>
                <ArrowRight className="w-4 h-4" />
              </Link>

              <a
                href="https://t.me/VeriAgentPayBot"
                target="_blank"
                rel="noopener noreferrer"
                className={`border font-medium px-6 py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 ${isDark
                  ? 'bg-slate-950/80 hover:bg-slate-800/80 border-slate-700/60 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800 shadow-sm'
                  }`}
              >
                <MessageSquare className={`w-4 h-4 ${isDark ? 'text-yellow-400' : 'text-amber-800'}`} />
                <span>Chat with Telegram Bot</span>
              </a>
            </div>

            {/* Micro-Disclaimer */}
            <p className={`text-xs italic mt-3 font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              * Surprisingly friendly, no App Store download required. Works right inside your existing chat apps.
            </p>
          </div>

          {/* Bottom Trust Badges */}
          <div className="pt-4 flex flex-wrap items-center gap-3 text-xs font-mono">
            <div className={`border px-3.5 py-2 rounded-xl flex items-center gap-2 ${isDark ? 'bg-slate-950/60 border-slate-800/80 text-slate-300' : 'bg-slate-100 border-slate-300 text-slate-800 shadow-sm'
              }`}>
              <Fingerprint className={`w-4 h-4 ${isDark ? 'text-yellow-400' : 'text-amber-800'}`} />
              <span>Touch ID / Face ID / YubiKey</span>
            </div>
            <div className={`border px-3.5 py-2 rounded-xl flex items-center gap-2 ${isDark ? 'bg-slate-950/60 border-slate-800/80 text-slate-300' : 'bg-slate-100 border-slate-300 text-slate-800 shadow-sm'
              }`}>
              <Layers className={`w-4 h-4 ${isDark ? 'text-yellow-400' : 'text-amber-800'}`} />
              <span>BOTChain + Stellar Soroban Enabled</span>
            </div>
            <div className={`border px-3.5 py-2 rounded-xl flex items-center gap-2 ${isDark ? 'bg-slate-950/60 border-slate-800/80 text-slate-300' : 'bg-slate-100 border-slate-300 text-slate-800 shadow-sm'
              }`}>
              <CheckCircle2 className={`w-4 h-4 ${isDark ? 'text-yellow-400' : 'text-amber-800'}`} />
              <span>On-Chain APY Proofs</span>
            </div>
            <div className={`border px-3.5 py-2 rounded-xl flex items-center gap-2 ${isDark ? 'bg-slate-950/60 border-slate-800/80 text-slate-300' : 'bg-slate-100 border-slate-300 text-slate-800 shadow-sm'
              }`}>
              <Lock className={`w-4 h-4 ${isDark ? 'text-yellow-400' : 'text-amber-800'}`} />
              <span>Self-Custodial Smart Wallet</span>
            </div>
          </div>
        </div>

        {/* Right-Hand Column */}
        <div className="relative w-full">
          <div
            className={`border rounded-2xl p-5 space-y-4 text-left relative overflow-hidden transition-colors duration-200 ${isDark
              ? 'bg-[#0B0F19] border-slate-800'
              : 'bg-white border-slate-200 shadow-xl text-slate-950'
              }`}
          >
            {/* Tab Bar Header */}
            <div className={`flex items-center justify-between border-b pb-3 overflow-x-auto no-scrollbar ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <div className="flex items-center gap-1.5">
                {(['telegram', 'whatsapp', 'discord', 'slack'] as const).map((platform) => {
                  const isActive = activePlatform === platform;
                  return (
                    <button
                      key={platform}
                      onClick={() => setActivePlatform(platform)}
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold uppercase transition-all ${isActive
                        ? isDark
                          ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
                          : 'bg-amber-50 text-amber-800 border border-amber-300 font-bold'
                        : isDark
                          ? 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
                          : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100 border border-transparent'
                        }`}
                    >
                      {platform}
                    </button>
                  );
                })}
              </div>

              <span className={`text-xs font-mono hidden sm:inline ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {platformLabels[activePlatform]}
              </span>
            </div>

            {/* Reactive Platform Content Engine */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activePlatform}
                initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
                transition={{ duration: 0.18, ease: 'easeInOut' }}
                className="w-full"
              >
                {/* 1. TELEGRAM MODE */}
                {activePlatform === 'telegram' && (
                  <div className="space-y-3 font-sans text-xs">
                    <div className="flex items-center justify-between bg-[#229ED9]/10 border border-[#229ED9]/20 px-3 py-1.5 rounded-lg text-[#229ED9] text-[10px] font-mono font-semibold">
                      <div className="flex items-center gap-2">
                        <Send className="w-3.5 h-3.5" />
                        <span>Telegram Mini App • @alex_dev</span>
                      </div>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#229ED9] animate-pulse" />
                    </div>

                    <div className={`p-3 rounded-xl border max-w-[88%] space-y-1 ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="font-bold text-[#229ED9]">Bob Smith</span>
                        <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>12:44 PM</span>
                      </div>
                      <p className={isDark ? 'text-slate-200' : 'text-slate-800'}>Hey Alex, splitting dinner from last night. $50.00 USDT total 🍕</p>
                    </div>

                    <div className={`p-3 rounded-xl border max-w-[92%] ml-auto space-y-1.5 font-mono text-xs ${isDark ? 'bg-slate-950 border-slate-700/80' : 'bg-slate-100 border-slate-300'}`}>
                      <div className={`flex items-center justify-between text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        <span>Direct Execution</span>
                        <span className="text-yellow-400 font-bold">@alex_dev</span>
                      </div>
                      <div className={`p-2 rounded-lg font-bold text-xs border ${isDark ? 'bg-slate-950 text-yellow-400 border-white/[0.05]' : 'bg-white text-amber-800 border-slate-300'}`}>
                        /pay 50 USDT @bob_smith
                      </div>
                    </div>

                    <div className={`p-3.5 rounded-xl border flex items-center justify-between font-mono ${isDark ? 'bg-slate-950/95 border-yellow-500/30' : 'bg-amber-50 border-amber-300'}`}>
                      <div className="flex items-center gap-2.5">
                        <Fingerprint className="w-5 h-5 text-yellow-400 animate-pulse" />
                        <div>
                          <div className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>Touch ID Approved</div>
                          <div className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>0.2s • Gas Sponsored</div>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-yellow-400">$50.00</span>
                    </div>

                    <div className="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-xl flex items-center justify-between font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-yellow-400" />
                        <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Payment Escrowed & Sent</span>
                      </div>
                      <a href="#" className="text-[10px] text-yellow-400 underline hover:text-yellow-300">
                        Tx 0x9f8e...1a2b
                      </a>
                    </div>
                  </div>
                )}

                {/* 2. WHATSAPP MODE */}
                {activePlatform === 'whatsapp' && (
                  <div className="space-y-3 font-sans text-xs">
                    <div className="flex items-center justify-between bg-[#128C7E]/10 border border-[#128C7E]/20 px-3 py-1.5 rounded-lg text-[#25D366] text-[10px] font-mono font-semibold">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>WhatsApp Business API</span>
                      </div>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] animate-pulse" />
                    </div>

                    <div className={`p-3.5 rounded-2xl rounded-tl-none border max-w-[88%] space-y-1 ${isDark ? 'bg-[#0b141a] border-slate-800' : 'bg-slate-100 border-slate-300'}`}>
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="font-bold text-[#25D366]">Bob Smith (+1 555-0192)</span>
                      </div>
                      <p className={`text-xs ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Hey Alex, splitting dinner from last night. $50.00 USDT total 🍕</p>
                    </div>

                    {/* WhatsApp 1-Tap Action Pill */}
                    <div className={`p-3 rounded-xl border max-w-[92%] ml-auto space-y-2 font-mono text-xs ${isDark ? 'bg-[#056162]/30 border-[#056162]' : 'bg-emerald-50 border-emerald-300'}`}>
                      <div className="text-[10px] text-[#25D366] font-bold flex items-center justify-between">
                        <span>Bot Request Prompt</span>
                        <span>/pay 50 USDT @bob_smith</span>
                      </div>
                      <button className="w-full py-2 bg-[#25D366] hover:bg-emerald-500 text-gray-950 font-bold rounded-lg text-xs flex items-center justify-center gap-2 shadow transition-all hover:scale-[1.01]">
                        <Fingerprint className="w-4 h-4" />
                        <span>Tap to Approve $50.00</span>
                      </button>
                    </div>

                    <div className={`p-3 rounded-xl border flex items-center justify-between font-mono text-xs ${isDark ? 'bg-[#0b141a] border-[#25D366]/40' : 'bg-emerald-50 border-emerald-300'}`}>
                      <div className="flex items-center gap-2">
                        <CheckCheck className="w-4 h-4 text-[#25D366]" />
                        <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Paid Instantly via Passkey</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. DISCORD MODE */}
                {activePlatform === 'discord' && (
                  <div className={`space-y-3 font-sans text-xs p-4 rounded-xl border ${isDark ? 'bg-[#1E1F22] border-slate-800' : 'bg-slate-100 border-slate-300'}`}>
                    <div className="flex items-center justify-between border-b pb-2 text-[#5865F2] text-[10px] font-mono font-semibold border-slate-700/60">
                      <div className="flex items-center gap-2">
                        <Hash className="w-3.5 h-3.5" />
                        <span>Discord Slash Command • #payments-bot</span>
                      </div>
                      <span className="bg-[#5865F2]/20 px-2 py-0.5 rounded text-[#5865F2]">Slash Command</span>
                    </div>

                    <div className="flex items-start gap-3 pt-1">
                      <div className="w-8 h-8 rounded-full bg-[#5865F2] text-white font-bold flex items-center justify-center text-xs font-mono">
                        BS
                      </div>
                      <div className="space-y-1 text-left flex-1 min-w-0">
                        <div className="flex items-center gap-2 font-mono text-[10px]">
                          <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>Bob Smith</span>
                          <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Today at 12:44 PM</span>
                        </div>
                        <p className={isDark ? 'text-slate-200' : 'text-slate-700'}>Hey Alex, splitting dinner from last night. $50.00 USDT total 🍕</p>
                      </div>
                    </div>

                    {/* Discord Interactive Slash Embed */}
                    <div className={`border-l-4 border-[#5865F2] p-3 rounded-r-xl space-y-2 font-mono text-xs ${isDark ? 'bg-[#2B2D31]' : 'bg-white border-y border-r border-slate-200 shadow-sm'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>VeriAgent Pay</span>
                        <span className="bg-[#5865F2] text-white text-[9px] px-1 rounded font-bold">BOT</span>
                      </div>
                      <div className={`p-2 rounded text-xs ${isDark ? 'bg-[#1E1F22] text-[#F2D827]' : 'bg-slate-100 text-amber-800'}`}>
                        /pay amount: 50 token: USDT recipient: @bob_smith
                      </div>
                      <button className="w-full py-1.5 bg-[#5865F2] hover:bg-indigo-600 text-white font-bold rounded text-xs flex items-center justify-center gap-2 transition">
                        <Fingerprint className="w-4 h-4" />
                        <span>Approve with Passkey</span>
                      </button>
                    </div>

                    <div className="text-[10px] font-mono text-[#F2D827] flex items-center gap-1.5 pt-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>✅ Settled in 0.4s • Tx 0x9f8e...1a2b</span>
                    </div>
                  </div>
                )}

                {/* 4. SLACK MODE */}
                {activePlatform === 'slack' && (
                  <div className={`space-y-3 font-sans text-xs p-4 rounded-xl border ${isDark ? 'bg-[#1A1D21] border-slate-800' : 'bg-slate-100 border-slate-300'}`}>
                    <div className="flex items-center justify-between border-b pb-2 text-[#E01E5A] text-[10px] font-mono font-semibold border-slate-700/60">
                      <div className="flex items-center gap-2">
                        <Hash className="w-3.5 h-3.5 text-[#E01E5A]" />
                        <span>Slack App Integration • #general</span>
                      </div>
                      <span className="bg-[#E01E5A]/10 px-2 py-0.5 rounded text-[#E01E5A]">Block Kit</span>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded bg-purple-600 text-white font-bold flex items-center justify-center text-xs font-mono">
                        BS
                      </div>
                      <div className="space-y-0.5 text-left flex-1 min-w-0">
                        <div className="flex items-center gap-2 font-mono text-[10px]">
                          <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>Bob Smith</span>
                          <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>12:44 PM</span>
                        </div>
                        <p className={isDark ? 'text-slate-200' : 'text-slate-700'}>Hey Alex, splitting dinner from last night. $50.00 USDC total 🍕</p>
                      </div>
                    </div>

                    {/* Slack Block Kit Action Card */}
                    <div className={`p-3 rounded-lg border-l-4 border-[#36C5F0] space-y-2 font-mono text-xs ${isDark ? 'bg-[#222529]' : 'bg-white border-y border-r border-slate-200 shadow-sm'}`}>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>VeriAgent Pay</span>
                        <span className="bg-[#36C5F0]/20 text-[#36C5F0] text-[9px] px-1.5 py-0.5 rounded">APP</span>
                      </div>
                      <div className={`p-2 rounded text-xs ${isDark ? 'bg-[#121417] text-[#F2D827]' : 'bg-slate-100 text-amber-800'}`}>
                        /pay 50 USDC to @bob_smith
                      </div>
                      <button className="w-full py-1.5 bg-[#007a5a] hover:bg-emerald-700 text-white font-bold rounded text-xs flex items-center justify-center gap-2 transition">
                        <Fingerprint className="w-4 h-4" />
                        <span>Sign Transaction</span>
                      </button>
                    </div>

                    <div className="text-[10px] font-mono text-[#F2D827] flex items-center gap-1.5 pt-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Payment Escrowed & Sent • Tx 0x9f8e...1a2b</span>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
