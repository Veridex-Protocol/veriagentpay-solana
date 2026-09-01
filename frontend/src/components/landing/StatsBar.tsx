'use client';

import React from 'react';

interface StatsBarProps {
  theme?: 'dark' | 'light';
}

export function StatsBar({ theme = 'dark' }: StatsBarProps) {
  const isDark = theme === 'dark';
  const stats = [
    { value: '$18.5M+', label: 'Total Volume Relayed' },
    { value: '1.4M+', label: 'Passkey Authentications' },
    { value: '< 0.5s', label: 'Settlement Speed' },
    { value: '$0.00', label: 'User Gas Fees Paid' },
  ];

  return (
    <section
      id="stats"
      className={`border-y py-10 px-4 sm:px-6 lg:px-8 w-full transition-colors duration-200 ${isDark
          ? 'border-white/[0.08] bg-[#070A11]/60'
          : 'border-slate-200 bg-white/80'
        }`}
    >
      <div
        className={`max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-px rounded-2xl overflow-hidden border transition-colors duration-200 ${isDark
            ? 'bg-white/[0.08] border-white/[0.08]'
            : 'bg-slate-200 border-slate-200 shadow-sm'
          }`}
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`p-6 text-center space-y-1 transition-colors duration-200 ${isDark ? 'bg-[#070A11]' : 'bg-white'
              }`}
          >
            <div className={`text-2xl sm:text-4xl font-extrabold font-mono tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
              {stat.value}
            </div>
            <p className={`text-xs font-semibold uppercase tracking-wider font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
