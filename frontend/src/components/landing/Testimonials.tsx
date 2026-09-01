'use client';

import React from 'react';
import { ShieldCheck } from 'lucide-react';

interface TestimonialsProps {
  theme?: 'dark' | 'light';
}

export function Testimonials({ theme = 'dark' }: TestimonialsProps) {
  const isDark = theme === 'dark';
  const reviews = [
    {
      quote: 'Sending 50 USDT inside Telegram using Touch ID without gas fees or seed phrases feels like the future of consumer payments.',
      author: 'Sarah Jenkins',
      handle: '@sarah_design',
      role: 'Lead Product Designer',
      initials: 'SJ',
    },
    {
      quote: 'The automated yield vault is generating 12.4% APY on idle stablecoins with verifiable on-chain proofs for every payout.',
      author: 'David Chen',
      handle: '@dchen_cap',
      role: 'Founding Partner, Alpha Capital',
      initials: 'DC',
    },
    {
      quote: 'Red Envelope group drops in our Discord community executed flawlessly. Over 200 members claimed funds within 30 seconds.',
      author: 'Elena Rostova',
      handle: '@elena_r',
      role: 'Community Lead, BOTChain',
      initials: 'ER',
    },
  ];

  return (
    <section
      id="reviews"
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
          Social Proof
        </span>
        <h2 className={`text-3xl sm:text-5xl font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
          Validated by Industry Leaders
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {reviews.map((r) => (
          <div
            key={r.author}
            className={`rounded-2xl border p-6 space-y-4 text-left flex flex-col justify-between transition-colors duration-200 ${isDark
                ? 'bg-[#070A11] border-white/[0.08] hover:border-yellow-500/30'
                : 'bg-white border-slate-200 shadow-sm hover:border-yellow-400'
              }`}
          >
            <p className={`text-xs sm:text-sm leading-relaxed font-sans ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              &quot;{r.quote}&quot;
            </p>

            <div className={`flex items-center gap-3 pt-3 border-t ${isDark ? 'border-white/[0.08]' : 'border-slate-200'}`}>
              <div className="w-8 h-8 rounded-lg bg-yellow-500 text-black font-bold flex items-center justify-center text-xs font-mono">
                {r.initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-bold flex items-center gap-1 ${isDark ? 'text-white' : 'text-slate-950'}`}>
                  <span>{r.author}</span>
                  <ShieldCheck className="w-3.5 h-3.5 text-[#F2D827]" />
                </div>
                <div className={`text-[10px] font-mono truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{r.handle} • {r.role}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
