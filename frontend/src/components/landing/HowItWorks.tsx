'use client';

import React from 'react';
import { MessageSquare, Bot, Fingerprint, TrendingUp } from 'lucide-react';

interface HowItWorksProps {
  theme?: 'dark' | 'light';
}

export function HowItWorks({ theme = 'dark' }: HowItWorksProps) {
  const isDark = theme === 'dark';
  const steps = [
    {
      num: '01',
      title: 'Select Messenger',
      description: 'Open Telegram, WhatsApp, Discord, or Slack. Counterfactual smart account initializes automatically on first prompt.',
      icon: MessageSquare,
      type: 'Client Setup',
    },
    {
      num: '02',
      title: 'Type Command',
      description: 'Execute transfers using simple syntax like "/pay 20 USDT to @alice". Gemini NLU engine parses intent in real time.',
      icon: Bot,
      type: 'User Input',
    },
    {
      num: '03',
      title: 'Fingerprint Auth',
      description: 'Authorize transactions with native Touch ID or Face ID hardware biometrics. Zero private key exposure.',
      icon: Fingerprint,
      type: 'P-256 WebAuthn',
    },
    {
      num: '04',
      title: 'Automated Execution',
      description: 'Relayer executes sponsored UserOps on BOTChain L1 while idle treasury balance auto-routes into zkTLS yield vaults.',
      icon: TrendingUp,
      type: 'L1 Settlement',
    },
  ];

  return (
    <section
      id="how-it-works"
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
          Transaction Lifecycle
        </span>
        <h2 className={`text-3xl sm:text-5xl font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
          How VeriAgent Pay Operates
        </h2>
        <p className={`text-base ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          End-to-end payment execution pipeline from messenger prompt to L1 settlement.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <div
              key={step.num}
              className={`rounded-2xl border p-6 space-y-4 text-left transition-colors duration-200 relative ${isDark
                ? 'bg-[#070A11] border-white/[0.08] hover:border-yellow-500/30'
                : 'bg-white border-slate-200 shadow-sm hover:border-yellow-400 shadow-slate-200/50'
                }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-2xl font-extrabold font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {step.num}
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border ${isDark
                    ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                >
                  {step.type}
                </span>
              </div>

              <div
                className={`w-10 h-10 rounded-xl border flex items-center justify-center ${isDark
                  ? 'bg-slate-950 border-white/[0.08] text-yellow-400'
                  : 'bg-slate-100 border-slate-200 text-amber-800'
                  }`}
              >
                <Icon className="w-5 h-5" />
              </div>

              <div className="space-y-1.5">
                <h3 className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                  {step.title}
                </h3>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
