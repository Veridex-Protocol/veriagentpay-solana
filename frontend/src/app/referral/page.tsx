'use client';

import React from 'react';
import { AppLayout } from '../../components/layout/AppLayout';
import { useTheme } from '../../components/providers/ThemeProvider';
import { ShareLink } from '../../components/ShareLink';
import { useReferrals } from '../../hooks/useApi';
import { Share2, Sparkles, Users } from 'lucide-react';

export default function ReferralPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const { data: referralData, isLoading } = useReferrals();

  // Both come straight from the backend so this page, the badge share card and
  // the bots all quote one code and one landing URL.
  const referralCode = referralData?.referralCode || referralData?.code || '';
  const referralUrl = referralData?.shareUrl || '';
  const referredFriends = referralData?.referredUsers || [];

  return (
    <AppLayout>
      <div className="space-y-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-between border-b pb-6 border-slate-800">
          <div>
            <h1 className={`text-2xl font-extrabold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-950'}`}>
              <Share2 className="w-6 h-6 text-emerald-500" /> Referral Rewards
            </h1>
            <p className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Invite friends to VeriAgent Pay and earn VERI tokens for every active vault deposit.
            </p>
          </div>
        </div>

        {/* MULTI-PLATFORM SHARE CARD */}
        <ShareLink referralCode={referralCode} referralUrl={referralUrl} />

        {/* REWARDS STATS BANNER */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 font-mono">
          <div className={`p-4 rounded-2xl border space-y-1 text-center transition ${isDark ? 'bg-[#070A11]/80 border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm text-slate-950'
            }`}>
            <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Total Referrals</span>
            <div className={`text-2xl font-extrabold ${isDark ? 'text-white' : 'text-slate-950'}`}>{referredFriends.length} Friends</div>
          </div>

          <div className={`p-4 rounded-2xl border space-y-1 text-center transition ${isDark ? 'bg-[#070A11]/80 border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm text-slate-950'
            }`}>
            <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>VERI Earned</span>
            <div className="text-2xl font-extrabold text-emerald-500">{referralData?.totalEarned || 0} VERI</div>
          </div>

          <div className={`p-4 rounded-2xl border space-y-1 text-center col-span-2 sm:col-span-1 transition ${isDark ? 'bg-[#070A11]/80 border-white/[0.08]' : 'bg-white border-slate-200 shadow-sm text-slate-950'
            }`}>
            <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Reward Tier</span>
            <div className="text-base font-bold text-amber-500 flex items-center justify-center gap-1">
              <Sparkles className="w-4 h-4" /> Silver Partner
            </div>
          </div>
        </div>

        {/* REFERRED FRIENDS LIST */}
        <section className="space-y-4">
          <h3 className={`text-base font-bold font-mono uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-950'}`}>
            Referred Friends
          </h3>

          <div className={`rounded-2xl border divide-y overflow-hidden transition ${isDark ? 'bg-[#070A11] border-white/[0.08] divide-white/[0.08]' : 'bg-white border-slate-200 divide-slate-200 shadow-sm'
            }`}>
            {isLoading ? (
              <div className="p-8 text-center">
                <div className="space-y-3">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="h-16 bg-slate-950/40 rounded-xl animate-pulse" />
                  ))}
                </div>
              </div>
            ) : referredFriends.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Users className={`w-12 h-12 mx-auto ${isDark ? 'text-slate-700' : 'text-slate-300'}`} />
                <p className={`text-sm font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  No referrals yet. Share your code above to start earning rewards!
                </p>
              </div>
            ) : (
              referredFriends.map((friend: any, idx: number) => (
              <div key={idx} className="p-4 flex items-center justify-between font-mono">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 text-gray-950 font-bold flex items-center justify-center text-xs">
                    {friend.name.replace('@', '')[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>{friend.name}</div>
                    <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{friend.status} • {friend.date}</div>
                  </div>
                </div>
                <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                  +{friend.reward || '0 VERI'}
                </span>
              </div>
              ))
            )}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
