'use client';

import React, { useState } from 'react';
import { Undo2, AlertCircle, Clock, ExternalLink } from 'lucide-react';
import { usePendingEscrows, useCancelEscrow } from '../../hooks/useApi';
import { useTheme } from '../providers/ThemeProvider';
import { VeriAgentLogoMark } from '../ui/VeriAgentLoader';

/**
 * Payments the user sent that nobody has claimed yet, with a way to pull them
 * back. Cancelling releases the on-chain escrow and returns the tokens to the
 * sender's wallet: it is not merely a status change.
 */
export const PendingPaymentsCard: React.FC = () => {
  const { data: pending = [], isLoading } = usePendingEscrows();
  const cancel = useCancelEscrow();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ amount: number | null; token: string | null; txHash: string | null } | null>(null);

  const explorer = process.env.NEXT_PUBLIC_EXPLORER_URL || 'https://scan.bohr.life';

  // Nothing outstanding is the common case; stay out of the way entirely.
  if (isLoading || pending.length === 0) return null;

  const handleCancel = async (code: string) => {
    setActiveCode(code);
    setError(null);
    setDone(null);
    try {
      const res = await cancel.mutateAsync(code);
      setDone({ amount: res.amount, token: res.token, txHash: res.txHash });
    } catch (e: any) {
      setError(e?.message || 'Could not cancel this payment.');
    } finally {
      setActiveCode(null);
    }
  };

  return (
    <div
      className={`space-y-4 rounded-2xl border p-5 transition-colors ${
        isDark ? 'border-white/[0.08] bg-[#070A11]/80' : 'border-slate-200 bg-white shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>
            Unclaimed payments
          </h3>
          <p className={`mt-0.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Cancel to return the funds to your wallet.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase text-amber-500">
          {pending.length} pending
        </span>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-xs text-red-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {done && (
        <div className="flex items-start gap-2.5 rounded-xl border border-[#F2D827]/30 bg-[#F2D827]/10 px-3.5 py-3 text-xs text-[#D4A106] dark:text-[#F2D827]">
          <Undo2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            Returned {done.amount} {done.token} to your wallet.
          </span>
          {done.txHash && (
            <a
              href={`${explorer}/tx/${done.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 opacity-70 transition hover:opacity-100"
              aria-label="View refund on explorer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}

      <div className="space-y-2">
        {pending.map((p) => {
          const busy = activeCode === p.code;
          return (
            <div
              key={p.code}
              className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 ${
                isDark ? 'border-white/[0.06] bg-slate-950/60' : 'border-slate-200 bg-slate-50'
              }`}
            >
              <div className="min-w-0">
                <div className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-950'}`}>
                  {p.amount} {p.token}
                  <span className={`ml-1.5 font-normal ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    to {p.recipient ? `@${p.recipient.replace(/^@/, '')}` : 'anyone with the link'}
                  </span>
                </div>
                <div className={`mt-0.5 flex items-center gap-1.5 font-mono text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                  <Clock className="h-3 w-3" />
                  <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                  {!p.escrowed && (
                    <span className="text-amber-500">• never reached the chain</span>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleCancel(p.code)}
                disabled={busy || cancel.isPending}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${
                  isDark
                    ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                {busy ? <VeriAgentLogoMark size={14} speed="fast" withSquircle={false} glow={false} /> : <Undo2 className="h-3.5 w-3.5" />}
                <span>{busy ? 'Releasing Escrow…' : 'Cancel'}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
