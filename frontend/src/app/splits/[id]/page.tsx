'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppLayout } from '../../../components/layout/AppLayout';
import { useTheme } from '../../../components/providers/ThemeProvider';
import { useSplit, usePaySplit } from '../../../hooks/useApi';
import { Users, CheckCircle2, Clock, XCircle, ArrowLeft, Wallet, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { VeriAgentLoader } from '../../../components/ui/VeriAgentLoader';

export default function SplitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const splitId = params.id as string;

  const { data: splitData, isLoading, error } = useSplit(splitId);
  const payMutation = usePaySplit();

  const split = splitData?.split;

  const handlePayShare = async () => {
    if (!split) return;

    try {
      await payMutation.mutateAsync(splitId);
    } catch (err: any) {
      console.error('Payment failed:', err);
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="min-h-[50vh] flex items-center justify-center p-6">
          <VeriAgentLoader
            variant="card"
            size="md"
            text="Loading Split Bill"
            subtext="Reading on-chain split allocations and status..."
            showProgress={true}
          />
        </div>
      </AppLayout>
    );
  }

  if (error || !split) {
    return (
      <AppLayout>
        <div className="space-y-8 max-w-4xl mx-auto">
          <div className="text-center py-16 space-y-4">
            <AlertCircle className="w-16 h-16 mx-auto text-red-500" />
            <p className={`text-sm font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Split not found or failed to load
            </p>
            <button
              onClick={() => router.push('/splits')}
              className="text-[#D4A106] dark:text-[#F2D827] hover:underline font-mono text-sm font-semibold"
            >
              ← Back to Splits
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const participants = split.participants || [];
  const paidCount = participants.filter((p: any) => p.hasPaid).length;
  const totalCount = participants.length;
  const progressPercent = Math.round((paidCount / totalCount) * 100);
  const isComplete = split.status === 'COMPLETED';
  const isExpired = split.status === 'EXPIRED';
  const isCancelled = split.status === 'CANCELLED';

  const getStatusBadge = () => {
    if (isComplete) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827] border border-[#F2D827]/30 text-xs font-mono font-bold">
          <CheckCircle2 className="w-3.5 h-3.5" />
          COMPLETED
        </span>
      );
    }
    if (isExpired) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-500/20 text-slate-500 text-xs font-mono font-bold">
          <Clock className="w-3.5 h-3.5" />
          EXPIRED
        </span>
      );
    }
    if (isCancelled) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 text-red-600 text-xs font-mono font-bold">
          <XCircle className="w-3.5 h-3.5" />
          CANCELLED
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-mono font-bold">
        <Clock className="w-3.5 h-3.5" />
        PENDING
      </span>
    );
  };

  const deadlineDate = new Date(split.deadline);
  const daysRemaining = Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return (
    <AppLayout>
      <div className="space-y-8 max-w-4xl mx-auto relative pb-12">
        {/* Back Button */}
        <button
          onClick={() => router.push('/splits')}
          className={`inline-flex items-center gap-2 text-sm font-mono transition-colors ${
            isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-950'
          }`}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Splits
        </button>

        {/* Header */}
        <div className={`space-y-4 border-b pb-6 ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2 text-xs font-mono text-[#D4A106] dark:text-[#F2D827] uppercase tracking-wider font-bold">
                <Users className="w-4 h-4" />
                <span>BILL SPLIT</span>
              </div>
              <h1 className={`text-3xl font-extrabold tracking-tight ${isDark ? 'text-white' : 'text-slate-950'}`}>
                {split.description || 'Group Split'}
              </h1>
            </div>
            {getStatusBadge()}
          </div>

          {/* Amount & Progress */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              <p className="text-xs font-mono text-slate-500 mb-1">Total Amount</p>
              <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {split.totalAmount} {split.token}
              </p>
            </div>
            <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              <p className="text-xs font-mono text-slate-500 mb-1">Collected</p>
              <p className="text-2xl font-bold text-[#D4A106] dark:text-[#F2D827]">
                {split.amountCollected || 0} {split.token}
              </p>
            </div>
            <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              <p className="text-xs font-mono text-slate-500 mb-1">Deadline</p>
              <p className={`text-sm font-mono ${daysRemaining > 0 ? 'text-amber-500' : 'text-red-500'}`}>
                {daysRemaining > 0 ? `${daysRemaining} days left` : 'Expired'}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Payment Progress</span>
              <span className={isDark ? 'text-white' : 'text-slate-900'}>
                {paidCount}/{totalCount} paid ({progressPercent}%)
              </span>
            </div>
            <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="h-full bg-gradient-to-r from-[#F2D827] to-[#E5A900]"
              />
            </div>
          </div>
        </div>

        {/* Participants List */}
        <div className="space-y-4">
          <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Participants
          </h2>
          <div className="space-y-3">
            {participants.map((participant: any, index: number) => (
              <motion.div
                key={participant.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`p-4 rounded-xl border ${
                  isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                } ${participant.hasPaid ? 'border-[#F2D827]/50 ring-1 ring-[#F2D827]/20' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                      participant.hasPaid
                        ? 'bg-[#F2D827] text-slate-950 font-bold'
                        : isDark
                          ? 'bg-slate-800 text-slate-300'
                          : 'bg-slate-100 text-slate-700'
                    }`}>
                      {participant.userIdentifier?.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className={`font-mono font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {participant.userIdentifier}
                      </p>
                      <p className="text-xs text-slate-500">
                        {participant.shareAmount} {split.token}
                      </p>
                    </div>
                  </div>
                  {participant.hasPaid ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-[#F2D827]" />
                      <span className="text-xs font-mono text-[#D4A106] dark:text-[#F2D827] font-bold">PAID</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-amber-500" />
                      <span className="text-xs font-mono text-amber-600 dark:text-amber-400 font-bold">PENDING</span>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        {!isComplete && !isExpired && !isCancelled && (
          <div className={`sticky bottom-4 p-4 rounded-xl border backdrop-blur-xl ${
            isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white/80 border-slate-200 shadow-lg'
          }`}>
            <button
              onClick={handlePayShare}
              disabled={payMutation.isPending}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold font-mono text-sm shadow-md transition-all hover:scale-[1.01] bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Wallet className="w-5 h-5" />
              <span>{payMutation.isPending ? 'Processing...' : 'Pay My Share'}</span>
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
