'use client';

import React from 'react';

interface EcosystemMarqueeProps {
  theme?: 'dark' | 'light';
}

export function EcosystemMarquee({ theme = 'dark' }: EcosystemMarqueeProps) {
  const isDark = theme === 'dark';
  const partners = [
    { name: 'BOTChain L1', tag: 'EVM Mainnet' },
    { name: 'Stellar Network', tag: 'Soroban & Anchors' },
    { name: 'Tether USDT', tag: 'Native Settlement' },
    { name: 'Pyth Oracle', tag: 'Real-Time Feeds' },
    { name: 'Telegram Mini Apps', tag: '900M+ Users' },
    { name: 'WebAuthn P-256', tag: 'Passkey Auth' },
    { name: 'Veridex Protocol', tag: 'zkTLS Proofs' },
    { name: 'More Networks', tag: 'Coming Soon' },
  ];

  return (
    <section
      id="ecosystem"
      className={`py-12 border-t w-full transition-colors duration-200 ${isDark ? 'bg-[#070A11]/40 border-white/[0.08]' : 'bg-slate-100/60 border-slate-200'
        }`}
    >
      <div className="max-w-7xl mx-auto px-4 text-center mb-6">
        <span className={`text-xs font-mono font-bold uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          Ecosystem & Multi-Chain Infrastructure Partners
        </span>
      </div>

      <div className="flex justify-center flex-wrap gap-3 max-w-6xl mx-auto px-4">
        {partners.map((p) => (
          <div
            key={p.name}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-mono transition-all duration-200 hover:scale-105 ${isDark
              ? 'bg-slate-950 border-white/[0.08] text-slate-200 hover:border-yellow-500/40'
              : 'bg-white border-slate-200 text-slate-800 shadow-sm hover:border-yellow-500/40'
              }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${p.name.includes('Stellar') ? 'bg-amber-400' : p.name.includes('More') ? 'bg-yellow-400' : 'bg-yellow-500'}`} />
            <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>{p.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'text-slate-400 bg-slate-800' : 'text-slate-600 bg-slate-100'}`}>
              {p.tag}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

