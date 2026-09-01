'use client';

import React, { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  Link2,
  RotateCcw,
  ShieldCheck,
  UserRoundCheck,
  UserRoundPlus,
  XCircle,
} from 'lucide-react';
import { useCancelEscrow, useSentPayments } from '../../hooks/useApi';
import { useTheme } from '../providers/ThemeProvider';
import { VeriAgentLoader, VeriAgentLogoMark } from '../ui/VeriAgentLoader';
import { useConfirm, useToast } from '../providers/NotificationProvider';

type PaymentStatus = 'all' | 'COMPLETED' | 'AWAITING_CLAIM' | 'CLAIMED' | 'CANCELLED' | 'EXPIRED';

const filters: Array<{ value: PaymentStatus; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'AWAITING_CLAIM', label: 'Awaiting claim' },
  { value: 'CLAIMED', label: 'Claimed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const statusPresentation = {
  COMPLETED: { label: 'Completed', icon: CheckCircle2, color: 'text-[#D4A106] dark:text-[#F2D827]', surface: 'border-[#F2D827]/30 bg-[#F2D827]/10' },
  AWAITING_CLAIM: { label: 'Awaiting claim', icon: Clock3, color: 'text-amber-500', surface: 'border-amber-500/25 bg-amber-500/10' },
  CLAIMED: { label: 'Claimed', icon: UserRoundCheck, color: 'text-cyan-500', surface: 'border-cyan-500/25 bg-cyan-500/10' },
  CANCELLED: { label: 'Cancelled', icon: RotateCcw, color: 'text-slate-500', surface: 'border-slate-500/25 bg-slate-500/10' },
  EXPIRED: { label: 'Expired', icon: XCircle, color: 'text-rose-500', surface: 'border-rose-500/25 bg-rose-500/10' },
} as const;

const formatChannel = (channel: string) =>
  channel ? channel.charAt(0).toUpperCase() + channel.slice(1) : 'Payment';

const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}).format(new Date(value));

export function SentPaymentsPanel() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const confirm = useConfirm();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<PaymentStatus>('all');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [cancellingCode, setCancellingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading, isFetching } = useSentPayments(page, status);
  const cancelEscrow = useCancelEscrow();
  const explorer = process.env.NEXT_PUBLIC_EXPLORER_URL || 'https://scan.bohr.life';

  useEffect(() => setPage(1), [status]);

  const copyClaimLink = async (code: string, url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedCode(code);
    toast.success('Claim link copied to clipboard!');
    window.setTimeout(() => setCopiedCode(null), 2000);
  };

  const cancelPayment = async (code: string) => {
    const ok = await confirm({
      title: 'Cancel Unclaimed Payment',
      message: 'Cancel this unclaimed payment and return the funds to your wallet?',
      description: 'The claim link will become invalid and funds will be immediately restored to your balance.',
      confirmText: 'Cancel & Refund',
      cancelText: 'Keep Payment',
      variant: 'danger',
    });
    if (!ok) return;

    setCancellingCode(code);
    setError(null);
    try {
      await cancelEscrow.mutateAsync(code);
      toast.success('Payment cancelled and funds restored to your wallet!', {
        title: 'Payment Cancelled',
      });
    } catch (err: any) {
      const errMsg = err?.message || 'The payment could not be cancelled. Please try again.';
      setError(errMsg);
      toast.error(errMsg, { title: 'Cancellation Error' });
    } finally {
      setCancellingCode(null);
    }
  };

  const payments = data?.payments ?? [];
  const summary = data?.summary;
  const totalPages = data?.totalPages ?? 1;

  return (
    <section id="sent-payments" className="scroll-mt-24 space-y-4 pt-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-[#D4A106] dark:text-[#F2D827]">
            <ArrowUpRight className="h-4 w-4" /> Sent payments
          </div>
          <h2 className={`mt-1 text-xl font-extrabold ${isDark ? 'text-white' : 'text-slate-950'}`}>Payment history</h2>
          <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Direct transfers and payments waiting for an unregistered recipient to claim.
          </p>
        </div>
        <div className={`font-mono text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          {summary?.total ?? 0} sent · <span className="text-amber-500">{summary?.awaitingClaim ?? 0} awaiting claim</span>
        </div>
      </div>

      <div className={`flex gap-1 overflow-x-auto rounded-xl border p-1.5 ${isDark ? 'border-white/[0.08] bg-[#070A11]' : 'border-slate-200 bg-slate-100'}`}>
        {filters.map((filter) => (
          <button
            key={filter.value}
            onClick={() => setStatus(filter.value)}
            className={`shrink-0 rounded-lg px-3 py-2 font-mono text-[10px] font-bold transition ${status === filter.value
              ? 'bg-[#F2D827] text-slate-950 shadow-sm'
              : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-950'}`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-xs text-rose-500">{error}</div>}

      <div className={`divide-y overflow-hidden rounded-2xl border ${isDark ? 'divide-white/[0.08] border-white/[0.08] bg-[#070A11]' : 'divide-slate-200 border-slate-200 bg-white shadow-sm'}`}>
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <VeriAgentLoader
              variant="inline"
              text="Loading sent payments"
              speed="fast"
            />
          </div>
        ) : payments.length === 0 ? (
          <div className={`p-12 text-center text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
            No sent payments match this filter.
          </div>
        ) : payments.map((payment) => {
          const state = statusPresentation[payment.status];
          const StatusIcon = state.icon;
          const isClaimLink = payment.kind === 'CLAIM_LINK';
          const transactionHash = payment.claimTxHash || payment.txHash;
          const busy = cancellingCode === payment.code;

          return (
            <article key={payment.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${isClaimLink ? 'border-amber-500/20 bg-amber-500/10 text-amber-500' : 'border-[#F2D827]/20 bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827]'}`}>
                    {isClaimLink ? <UserRoundPlus className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className={`truncate text-xs font-extrabold ${isDark ? 'text-white' : 'text-slate-950'}`}>{payment.recipient}</h3>
                      <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${isClaimLink ? 'border-amber-500/20 bg-amber-500/10 text-amber-500' : 'border-[#F2D827]/20 bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827]'}`}>
                        {isClaimLink ? 'Claim payment' : 'Direct'}
                      </span>
                    </div>
                    <div className={`mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[9px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                      <span>{formatChannel(payment.channel)}</span><span>•</span><span>{formatDate(payment.createdAt)}</span><span>•</span>
                      <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" />{payment.recipientRegistered ? 'Registered' : 'Unregistered at send time'}</span>
                    </div>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`font-mono text-sm font-extrabold ${isDark ? 'text-white' : 'text-slate-950'}`}>{payment.amount ?? '-'} {payment.token}</div>
                  <span className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${state.surface} ${state.color}`}>
                    <StatusIcon className="h-3 w-3" /> {state.label}
                  </span>
                </div>
              </div>

              {(payment.claimUrl || transactionHash) && (
                <div className={`flex flex-wrap items-center gap-1.5 rounded-xl border p-2 ${isDark ? 'border-white/[0.06] bg-slate-950/60' : 'border-slate-200 bg-slate-50'}`}>
                  {payment.claimUrl && payment.status === 'AWAITING_CLAIM' && payment.code && (
                    <button onClick={() => copyClaimLink(payment.code!, payment.claimUrl!)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-cyan-500 hover:bg-cyan-500/10">
                      {copiedCode === payment.code ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}{copiedCode === payment.code ? 'Copied' : 'Copy claim link'}
                    </button>
                  )}
                  {payment.claimUrl && payment.status === 'AWAITING_CLAIM' && (
                    <a href={payment.claimUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold ${isDark ? 'text-slate-300 hover:bg-white/[0.05]' : 'text-slate-700 hover:bg-slate-200'}`}>
                      <Link2 className="h-3 w-3" /> Open claim
                    </a>
                  )}
                  {transactionHash && (
                    <a href={`${explorer}/tx/${transactionHash}`} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold ${isDark ? 'text-slate-300 hover:bg-white/[0.05]' : 'text-slate-700 hover:bg-slate-200'}`}>
                      <ExternalLink className="h-3 w-3" /> Transaction
                    </a>
                  )}
                  {payment.cancellable && payment.code && (
                    <button onClick={() => cancelPayment(payment.code!)} disabled={busy || cancelEscrow.isPending} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-rose-500/25 px-2 py-1.5 text-[10px] font-semibold text-rose-500 hover:bg-rose-500/10 disabled:opacity-50">
                      {busy ? <VeriAgentLogoMark size={12} speed="fast" withSquircle={false} glow={false} /> : <RotateCcw className="h-3 w-3" />}{busy ? 'Cancelling…' : 'Cancel & return funds'}
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || isFetching} className={`inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-[10px] font-semibold disabled:opacity-40 ${isDark ? 'border-white/[0.08] bg-[#070A11] text-slate-300' : 'border-slate-200 bg-white text-slate-700'}`}>
            <ChevronLeft className="h-3.5 w-3.5" /> Previous
          </button>
          <span className={`font-mono text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages || isFetching} className={`inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-[10px] font-semibold disabled:opacity-40 ${isDark ? 'border-white/[0.08] bg-[#070A11] text-slate-300' : 'border-slate-200 bg-white text-slate-700'}`}>
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </section>
  );
}
