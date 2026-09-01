'use client';

import React from 'react';
import Link from 'next/link';
import { AppLayout } from '../../components/layout/AppLayout';
import { useTheme } from '../../components/providers/ThemeProvider';
import { ArrowLeft, Award, Users, DollarSign, Sparkles } from 'lucide-react';
import { useAmbassadorProfile } from '../../hooks/use-growth';

export default function AmbassadorPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const { data: profile, isLoading } = useAmbassadorProfile();
  const profileData = (profile as any)?.profile || profile || {};
  const badges = profileData?.soulboundBadges || [];

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link
              href="/dashboard"
              className={`p-2 rounded-xl border transition ${isDark ? 'bg-slate-950/60 border-white/[0.08] text-slate-400 hover:text-white' : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-slate-950'
                }`}
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-1.5 text-xs font-mono text-purple-400 uppercase tracking-wider font-bold mb-0.5">
                <Award className="w-4 h-4" />
                <span>REFERRAL REWARDS</span>
              </div>
              <h1 className={`text-2xl font-extrabold tracking-tight flex items-center space-x-2 ${isDark ? 'text-white' : 'text-slate-950'}`}>
                <span>Ambassador Program</span>
              </h1>
              <p className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Invite friends and communities to earn lifetime transaction fee commissions.
              </p>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono">
          <div className={`rounded-2xl border p-6 space-y-2 shadow-xl transition-colors ${isDark ? 'bg-[#070A11]/80 border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm text-slate-950'
            }`}>
            <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Active Referrals</span>
            <div className={`text-3xl font-extrabold flex items-center space-x-2 ${isDark ? 'text-white' : 'text-slate-950'}`}>
              <Users className="w-7 h-7 text-purple-500" />
              <span>{profileData?.referralCount ?? 0} Members</span>
            </div>
          </div>

          <div className={`rounded-2xl border p-6 space-y-2 shadow-xl transition-colors ${isDark ? 'bg-[#070A11]/80 border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm text-slate-950'
            }`}>
            <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Total Commission Earned</span>
            <div className="text-4xl font-extrabold text-[#D4A106] dark:text-[#F2D827] flex items-center space-x-2">
              <DollarSign className="w-8 h-8 text-[#D4A106] dark:text-[#F2D827]" />
              <span>${(profileData?.totalEarnedUsd ?? 0).toFixed(2)} USDC</span>
            </div>
          </div>
        </div>

        {/* Soulbound Badges Showcase */}
        <div className={`rounded-2xl border p-6 space-y-4 shadow-xl transition-colors ${isDark ? 'bg-[#070A11]/80 border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm text-slate-950'
          }`}>
          <h3 className={`text-sm font-bold font-mono uppercase tracking-wider flex items-center space-x-2 ${isDark ? 'text-white' : 'text-slate-950'}`}>
            <Sparkles className="w-4 h-4 text-purple-500" />
            <span>Soulbound ERC-721 Ambassador Badges</span>
          </h3>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2].map((n) => (
                <div key={n} className="h-24 bg-slate-950/40 rounded-xl animate-pulse border border-slate-800" />
              ))}
            </div>
          ) : badges.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <Award className={`w-12 h-12 mx-auto ${isDark ? 'text-slate-700' : 'text-slate-300'}`} />
              <p className={`text-sm font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                No badges earned yet. Keep referring to unlock exclusive rewards!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono">
              {badges.map((b: any) => (
              <div
                key={b.id}
                className={`border rounded-xl p-5 space-y-2 flex items-center space-x-4 shadow-md transition ${isDark ? 'bg-slate-950 border-white/[0.08]' : 'bg-slate-50 border-slate-200'
                  }`}
              >
                <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center text-2xl font-bold shrink-0">
                  🎖️
                </div>
                <div>
                  <h4 className={`font-bold text-base ${isDark ? 'text-white' : 'text-slate-950'}`}>{b.title}</h4>
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    Non-Transferable NFT
                  </span>
                  <p className={`text-[11px] mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Minted on BOTChain</p>
                </div>
              </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
