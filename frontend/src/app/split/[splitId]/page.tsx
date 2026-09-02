'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CheckCircle2, Clock, ShieldCheck, ArrowLeft, Share2, Sparkles } from 'lucide-react';
import { useSplit, usePaySplit } from '../../../hooks/useApi';
import { AppLayout } from '../../../components/layout/AppLayout';
import { useTheme } from '../../../components/providers/ThemeProvider';
import { VeriAgentLoader, VeriAgentLogoMark } from '../../../components/ui/VeriAgentLoader';
import { useToast } from '../../../components/providers/NotificationProvider';

export default function SplitBillDynamicPage() {
  const params = useParams();
  const router = useRouter();
  const splitId = (params?.splitId as string) || '';
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const toast = useToast();

  const { data: splitData, isLoading, refetch } = useSplit(splitId);
  const paySplitMutation = usePaySplit();

  const [copied, setCopied] = useState(false);

  const split = splitData?.split || splitData;

  // Real-time updates via periodic refetch polling
  useEffect(() => {
    if (!splitId) return;
    const interval = setInterval(() => {
      refetch();
    }, 4000);
    return () => clearInterval(interval);
  }, [splitId, refetch]);

  const handlePayShare = async () => {
    try {
      await paySplitMutation.mutateAsync(splitId);
      toast.success('Your share of the bill has been paid!', {
        title: 'Split Paid',
      });
      refetch();
    } catch (e: any) {
      toast.error(e.message || 'Split payment failed', {
        title: 'Payment Error',
      });
    }
  };

  const handleShareLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Split bill link copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <VeriAgentLoader
            variant="card"
            size="md"
            text="Loading Split Details"
            subtext="Fetching participant shares and settlement status..."
            showProgress={true}
          />
        </div>
      </AppLayout>
    );
  }

  const participants = split?.participants || [];
  const paidCount = participants.filter((p: any) => p.paid || p.hasPaid).length;
  const totalCount = participants.length || 1;
  const progressPercent = Math.min(100, Math.round((paidCount / totalCount) * 100));

  const total = split?.totalAmount || 0;
  const yourShare = split?.yourShare || (total / totalCount);
  const token = split?.token || 'USDC';
  const isCompleted = split?.status === 'COMPLETED' || paidCount === totalCount;
  const hasPaid = split?.hasPaid;

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto py-6 space-y-6 font-mono">
        {/* Back Link */}
        <button
          onClick={() => router.push('/splits')}
          className={`inline-flex items-center gap-2 text-xs font-bold transition ${
            isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-950'
          }`}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to All Splits</span>
        </button>

        {/* Card */}
        <div className={`rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden border ${
          isDark
            ? 'bg-[#070A11] border-white/[0.08] text-white'
            : 'bg-white border-slate-200 shadow-xl text-slate-950'
        }`}>
          {/* Top Banner Accent */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500" />

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  isCompleted
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                }`}>
                  {isCompleted ? 'FULLY COLLECTED' : 'PAYMENT PENDING'}
                </span>
                <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  by {split?.creatorIdentifier || 'Organizer'}
                </span>
              </div>
              <h1 className={`text-2xl font-extrabold tracking-tight mt-1 ${isDark ? 'text-white' : 'text-slate-950'}`}>
                {split?.description || 'Group Bill Split'}
              </h1>
            </div>

            <button
              onClick={handleShareLink}
              className={`p-2.5 rounded-xl border transition ${
                isDark
                  ? 'border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
              }`}
              title="Share Split Link"
            >
              <Share2 className="w-4 h-4 text-emerald-500" />
            </button>
          </div>

          {copied && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs text-center font-bold">
              Link copied to clipboard!
            </div>
          )}

          {/* Summary Metric Box */}
          <div className={`rounded-2xl p-5 grid grid-cols-2 gap-4 border ${
            isDark
              ? 'bg-slate-950/80 border-slate-800'
              : 'bg-slate-50 border-slate-200/80'
          }`}>
            <div>
              <div className={`text-xs uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>TOTAL BILL</div>
              <div className={`text-xl sm:text-2xl font-extrabold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                ${total.toFixed(2)} <span className="text-xs text-slate-400">{token}</span>
              </div>
            </div>

            <div>
              <div className={`text-xs uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>YOUR EQUAL SHARE</div>
              <div className="text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                ${yourShare.toFixed(2)} <span className="text-xs text-slate-400">{token}</span>
              </div>
            </div>
          </div>

          {/* Collection Progress */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className={`font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Payment Progress</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                {paidCount} of {totalCount} paid ({progressPercent}%)
              </span>
            </div>
            <div className={`w-full h-3 rounded-full overflow-hidden ${isDark ? 'bg-slate-900' : 'bg-slate-100'}`}>
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Participant Rows */}
          <div className="space-y-2.5">
            <h3 className={`text-xs uppercase tracking-wider font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Participants ({totalCount})
            </h3>
            <div className="space-y-2">
              {participants.map((p: any, idx: number) => {
                const isPaid = p.paid || p.hasPaid;
                const name = p.name || p.identifier || `Participant ${idx + 1}`;
                const share = p.shareAmount || p.amount || (total / totalCount);

                return (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-3.5 rounded-xl border text-xs font-semibold ${
                      isPaid
                        ? isDark
                          ? 'bg-emerald-500/5 border-emerald-500/20 text-white'
                          : 'bg-emerald-50/50 border-emerald-200 text-slate-900'
                        : isDark
                          ? 'bg-slate-950 border-slate-800/80 text-slate-300'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center text-xs">
                        {name.replace('@', '')[0]?.toUpperCase() || 'P'}
                      </div>
                      <span>{name}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>${share.toFixed(2)} {token}</span>
                      {isPaid ? (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-bold">
                          <CheckCircle2 className="w-4 h-4" /> Paid
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 font-bold">
                          <Clock className="w-4 h-4" /> Pending
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action CTA */}
          {!hasPaid && !isCompleted ? (
            <button
              onClick={handlePayShare}
              disabled={paySplitMutation.isPending}
              className="w-full py-4 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {paySplitMutation.isPending ? (
                <>
                  <VeriAgentLogoMark size={18} speed="fast" withSquircle={false} glow={false} />
                  <span>Signing Share Transfer...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" />
                  <span>{`Pay $${yourShare.toFixed(2)} ${token} Share Now`}</span>
                </>
              )}
            </button>
          ) : isCompleted ? (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs text-center font-bold flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span>Bill Split Fully Completed! All shares collected.</span>
            </div>
          ) : (
            <div className={`p-4 rounded-xl border text-xs text-center font-bold flex items-center justify-center gap-2 ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-slate-300'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>You have paid your share for this split.</span>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
