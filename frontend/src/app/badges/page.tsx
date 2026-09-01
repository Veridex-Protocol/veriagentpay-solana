'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AppLayout } from '../../components/layout/AppLayout';
import { useTheme } from '../../components/providers/ThemeProvider';
import { Award, ArrowLeft, Trophy, Sparkles, Share2 } from 'lucide-react';
import { useMyBadges, useMyRank } from '../../hooks/use-badges';
import { ShareCardPreview } from '../../components/ShareCardPreview';

export default function BadgesProfilePage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const { data: badgesData, isLoading } = useMyBadges();
  const { data: rankData } = useMyRank();

  const [selectedBadge, setSelectedBadge] = useState<any | null>(null);
  const [showCelebrativeModal, setShowCelebrativeModal] = useState(false);

  const badges = badgesData?.badges || [];
  // This view is a record of accomplishments, not a progress catalogue.  A
  // badge becomes visible and shareable only once the backend has verified it.
  const unlockedBadges = badges.filter((badge: any) => badge.unlocked);
  const activeBadge = selectedBadge || unlockedBadges[0] || null;

  return (
    <AppLayout>
      <div className="min-w-0 max-w-4xl mx-auto space-y-6">
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
              <div className="flex items-center gap-1.5 text-xs font-mono text-amber-500 uppercase tracking-wider font-bold mb-0.5">
                <Award className="w-4 h-4" />
                <span>SOCIAL REPUTATION</span>
              </div>
              <h1 className={`text-2xl font-extrabold tracking-tight flex items-center space-x-2 ${isDark ? 'text-white' : 'text-slate-950'}`}>
                <span>Reputation & Badges</span>
              </h1>
              <p className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Unlock achievement badges, boost your social credit score, and share your verified card.
              </p>
            </div>
          </div>
        </div>

        {/* Rank & Stats Banner */}
        <div className={`rounded-2xl border p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl transition-colors ${isDark ? 'bg-[#070A11]/80 border-white/[0.08]' : 'bg-white border-slate-200 shadow-slate-200/50 text-slate-950'
          }`}>
          <div className="space-y-1">
            <span className="text-xs font-mono font-bold text-[#D4A106] dark:text-[#F2D827] uppercase tracking-wider">Global Rank</span>
            <div className={`text-3xl font-extrabold font-mono flex items-center space-x-2 ${isDark ? 'text-white' : 'text-slate-950'}`}>
              <Trophy className="w-7 h-7 text-[#F2D827]" />
              <span>#{rankData?.globalRank || '--'} <span className={`text-xs font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>({rankData?.percentile || '--'})</span></span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="text-right font-mono">
              <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Reputation Score</span>
              <p className="text-base font-bold text-[#D4A106] dark:text-[#F2D827]">⭐ {rankData?.reputationPoints ?? 0} Pts</p>
            </div>
            <button
              onClick={() => {
                setSelectedBadge(activeBadge);
                setShowCelebrativeModal(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 font-bold text-xs flex items-center space-x-1.5 transition shadow-lg"
            >
              <Share2 className="w-4 h-4" />
              <span>Share Card</span>
            </button>
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Badges Grid */}
          <div className="min-w-0 space-y-4">
            <h3 className={`text-sm font-bold font-mono uppercase tracking-wider flex items-center space-x-2 ${isDark ? 'text-white' : 'text-slate-950'}`}>
              <Award className="w-4 h-4 text-[#F2D827]" />
              <span>Unlocked Achievement Badges ({unlockedBadges.length})</span>
            </h3>

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-20 bg-slate-950/40 rounded-xl animate-pulse border border-slate-800" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {unlockedBadges.length === 0 ? (
                  <div className={`rounded-2xl border p-6 text-center text-xs font-mono ${isDark ? 'bg-[#070A11] border-white/[0.08] text-slate-400' : 'bg-white border-slate-200 text-slate-600'}`}>
                    No achievement badges yet. Complete verified payments, savings, or referrals to unlock one.
                  </div>
                ) : unlockedBadges.map((b: any) => (
                  <div
                    key={b.id}
                    onClick={() => {
                      setSelectedBadge(b);
                      setShowCelebrativeModal(true);
                    }}
                    className={`p-4 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                      activeBadge?.id === b.id
                        ? isDark
                          ? 'bg-[#070A11] border-[#F2D827] shadow-lg ring-1 ring-[#F2D827]/50'
                          : 'bg-amber-50/50 border-[#F2D827] shadow-sm ring-1 ring-[#F2D827]/30'
                        : isDark
                          ? 'bg-[#070A11] border-white/[0.08] hover:border-[#F2D827]/60 shadow-lg'
                          : 'bg-white border-slate-200 shadow-sm hover:border-[#F2D827]/40'
                    }`}
                  >
                    <div className="flex min-w-0 items-center space-x-3.5">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${b.color} flex items-center justify-center text-2xl shadow-md shrink-0`}>
                        {b.icon}
                      </div>
                      <div className="min-w-0">
                        <h4 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-950'}`}>{b.name}</h4>
                        <p className={`break-words text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{b.description}</p>
                      </div>
                    </div>

                    <span className="text-xs font-bold text-[#D4A106] dark:text-[#F2D827] flex items-center space-x-1 shrink-0 font-mono">
                      <span>Share</span>
                      <Share2 className="w-3.5 h-3.5" />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dynamic Share Card Preview Column */}
          <div className="min-w-0 space-y-4">
            <h3 className={`text-sm font-bold font-mono uppercase tracking-wider flex items-center space-x-2 ${isDark ? 'text-white' : 'text-slate-950'}`}>
              <Share2 className="w-4 h-4 text-[#F2D827]" />
              <span>Live Share Card Preview</span>
            </h3>

            <ShareCardPreview selectedBadge={activeBadge} />
          </div>
        </div>
      </div>

      {/* Celebratory Milestone Share Modal */}
      {showCelebrativeModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className={`min-w-0 border rounded-3xl p-4 sm:p-6 max-w-lg w-full space-y-5 shadow-2xl max-h-[90vh] overflow-x-hidden overflow-y-auto ${isDark ? 'bg-[#070A11] border-white/[0.08]' : 'bg-white border-slate-200 text-slate-950'
            }`}>
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>Share Milestone & Card</h3>
              </div>
              <button
                onClick={() => setShowCelebrativeModal(false)}
                className={`text-sm ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-950'}`}
              >
                ✕
              </button>
            </div>

            <ShareCardPreview selectedBadge={activeBadge} />

            <button
              onClick={() => setShowCelebrativeModal(false)}
              className={`w-full py-3 rounded-xl font-bold text-xs transition ${isDark ? 'bg-slate-950 border border-white/[0.08] text-white hover:bg-slate-800' : 'bg-slate-100 border border-slate-300 text-slate-800 hover:bg-slate-200'
                }`}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
