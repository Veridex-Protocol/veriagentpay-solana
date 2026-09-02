'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, ArrowRight, Share2 } from 'lucide-react';
import { useTheme } from './providers/ThemeProvider';

export interface Participant {
  id?: string;
  name: string;
  identifier?: string;
  userId?: string;
  shareAmount?: number;
  amount?: number;
  paid?: boolean;
  hasPaid?: boolean;
  paidAt?: string;
  txHash?: string;
}

export interface SplitCardProps {
  split: {
    id: string;
    description?: string;
    token?: string;
    totalAmount?: number;
    amount?: number;
    amountCollected?: number;
    yourShare?: number;
    hasPaid?: boolean;
    creatorIdentifier?: string;
    organizer?: string;
    status?: string;
    createdAt?: string;
    participants?: Participant[];
  };
  onPayShare?: (split: any) => void;
  onShareLink?: (split: any) => void;
}

export function SplitCard({ split, onPayShare, onShareLink }: SplitCardProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const participants = split.participants || [];
  const paidCount = participants.filter((p) => p.paid || p.hasPaid).length;
  const totalParticipants = participants.length || 1;
  const progressPercent = Math.min(100, Math.round((paidCount / totalParticipants) * 100));

  const total = split.totalAmount || split.amount || 0;
  const yourShare = split.yourShare || (total / totalParticipants);
  const token = split.token || 'USDC';
  const isCompleted = split.status === 'COMPLETED' || paidCount === totalParticipants;

  const handleCardClick = () => {
    router.push(`/split/${split.id}`);
  };

  return (
    <div
      onClick={handleCardClick}
      className={`rounded-2xl border p-6 space-y-5 cursor-pointer transition-all hover:border-[#F2D827]/40 ${
        isDark ? 'bg-[#070A11] border-white/[0.08] text-white' : 'bg-white border-slate-200 shadow-sm text-slate-950'
      }`}
    >
      {/* Header Info */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4 ${
        isDark ? 'border-slate-800/60' : 'border-slate-100'
      }`}>
        <div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider ${
              isCompleted
                ? 'bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827] border border-[#F2D827]/30'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30'
            }`}>
              {isCompleted ? 'COMPLETED' : 'ACTIVE SPLIT'}
            </span>
            <span className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              by {split.creatorIdentifier || split.organizer || 'Creator'}
            </span>
          </div>
          <h3 className={`text-lg font-bold mt-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {split.description || 'Group Bill Split'}
          </h3>
        </div>

        <div className="text-left sm:text-right font-mono">
          <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Total Bill</span>
          <div className="text-xl font-extrabold text-[#D4A106] dark:text-[#F2D827]">
            ${total.toFixed(2)} <span className="text-xs text-slate-400">{token}</span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2 font-mono">
        <div className="flex justify-between items-center text-xs">
          <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>Collection Progress</span>
          <span className="font-bold text-[#D4A106] dark:text-[#F2D827]">
            {paidCount} of {totalParticipants} paid ({progressPercent}%)
          </span>
        </div>
        <div className={`w-full h-2.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-900' : 'bg-slate-100'}`}>
          <div
            className="h-full bg-gradient-to-r from-[#F2D827] to-[#FFF275] transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Participant List */}
      <div className="flex flex-wrap gap-2 pt-1 font-mono">
        {participants.map((p, idx) => {
          const isPaid = p.paid || p.hasPaid;
          const displayName = p.name || p.identifier || `User ${idx + 1}`;
          const initial = displayName.replace('@', '')[0]?.toUpperCase() || 'U';

          return (
            <div
              key={idx}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
                isPaid
                  ? 'bg-[#F2D827]/10 border-[#F2D827]/30 text-[#D4A106] dark:text-[#F2D827]'
                  : isDark
                  ? 'bg-slate-900 border-white/[0.08] text-slate-400'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-[#F2D827] text-slate-950 font-bold flex items-center justify-center text-[9px]">
                {initial}
              </div>
              <span>{displayName}</span>
              {isPaid ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-[#F2D827]" />
              ) : (
                <Clock className="w-3.5 h-3.5 text-amber-500" />
              )}
            </div>
          );
        })}
      </div>

      {/* Action CTA */}
      <div className="pt-2 font-mono flex gap-2" onClick={(e) => e.stopPropagation()}>
        {!split.hasPaid && !isCompleted ? (
          <button
            onClick={() => onPayShare ? onPayShare(split) : router.push(`/split/${split.id}`)}
            className="w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition hover:scale-[1.01] bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 shadow-md"
          >
            <span>Pay My Share (${yourShare.toFixed(2)} {token})</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleCardClick}
            className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition ${
              isDark ? 'border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <span>View Details & Progress</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
        {onShareLink && (
          <button
            onClick={() => onShareLink(split)}
            className={`p-3 rounded-xl border flex items-center justify-center transition ${
              isDark ? 'border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
            title="Share Split Link"
          >
            <Share2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
