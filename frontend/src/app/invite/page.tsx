'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Gift, Copy, CheckCircle2, AlertCircle, Send } from 'lucide-react';
import { api } from '../../lib/api';
import { VeriAgentLoader } from '../../components/ui/VeriAgentLoader';

interface ReferralStats {
  code: string;
  shareUrl: string;
  totalReferrals: number;
  activatedReferrals: number;
  pendingReferrals: number;
  referralPoints: number;
}

export default function InvitePage() {
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.fetchReferralStats();
      setStats({
        code: data.code,
        shareUrl: data.shareUrl,
        totalReferrals: data.totalReferrals,
        activatedReferrals: data.activatedReferrals,
        pendingReferrals: data.pendingReferrals,
        referralPoints: data.referralPoints,
      });
    } catch (err: any) {
      setError(err?.message || 'Could not load your referral link. Please sign in and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCopy = () => {
    if (!stats?.shareUrl) return;
    navigator.clipboard.writeText(stats.shareUrl);
    setCopied(true);
    // Report the share so k-factor can be measured.
    fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/analytics/funnel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'referral_link_shared',
        src: 'web',
        campaign: 'referral',
        ref: stats.code,
      }),
    }).catch(() => undefined);
    setTimeout(() => setCopied(false), 2000);
  };

  const telegramShareUrl = stats
    ? `https://t.me/share/url?url=${encodeURIComponent(stats.shareUrl)}&text=${encodeURIComponent(
        'Send crypto like texting with zero seed phrases and $0 gas fees. Join me on VeriAgent Pay:',
      )}`
    : '#';

  return (
    <main className="va-auth-shell px-5 py-10">
      <section className="va-auth-card w-full max-w-[420px] p-6 text-center">
        <div className="mb-4 flex items-center justify-center gap-2.5">
          <Gift size={30} className="text-[#F2D827]" />
          <h1 className="text-xl font-semibold tracking-tight">Refer &amp; Earn VERI Points</h1>
        </div>

        <p className="mb-5 text-sm leading-6 text-[var(--va-app-muted)]">
          Share your link. You earn points as your friend gets started:{' '}
          <strong className="text-[#D4A106] dark:text-[#F2D827]">25</strong> when they create their wallet,{' '}
          <strong className="text-[#D4A106] dark:text-[#F2D827]">25</strong> on their first send, and{' '}
          <strong className="text-[#D4A106] dark:text-[#F2D827]">50</strong> once they&apos;ve saved for 7 days.
        </p>

        {loading && (
          <div className="va-product-panel mb-5 flex items-center justify-center p-4">
            <VeriAgentLoader
              variant="inline"
              text="Loading your referral link"
              speed="fast"
            />
          </div>
        )}

        {error && !loading && (
          <div className="mb-5 flex items-center justify-center gap-2.5 rounded-xl border border-red-500/35 bg-red-500/10 p-4 text-sm text-red-500">
            <AlertCircle size={18} />
            <span>{error}</span>
            <button className="rounded-lg border border-current px-2.5 py-1 text-xs font-semibold" onClick={load}>
              Retry
            </button>
          </div>
        )}

        {stats && !loading && (
          <>
            <div className="mb-3 flex gap-2">
              <input type="text" readOnly value={stats.shareUrl} className="va-product-input min-w-0 flex-1 py-2.5 text-sm font-semibold text-[#D4A106] dark:text-[#F2D827]" />
              <button className="flex items-center rounded-xl bg-[#F2D827] hover:bg-[#E5A900] px-3.5 text-slate-950 font-bold transition" onClick={handleCopy} aria-label="Copy referral link">
                {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
              </button>
            </div>

            <a href={telegramShareUrl} target="_blank" rel="noopener noreferrer" className="va-product-action mb-5 w-full justify-center text-sm">
              <Send size={16} />
              <span>Share on Telegram</span>
            </a>

            <div className="grid grid-cols-3 divide-x divide-[var(--va-app-line)] rounded-xl border border-[var(--va-app-line)] bg-[var(--va-app-soft)] p-4">
              <div>
                <div className="text-[10px] font-semibold tracking-[0.08em] text-[var(--va-app-muted)]">ACTIVATED</div>
                <div className="mt-1 text-lg font-semibold">{stats.activatedReferrals}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold tracking-[0.08em] text-[var(--va-app-muted)]">PENDING</div>
                <div className="mt-1 text-lg font-semibold">{stats.pendingReferrals}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold tracking-[0.08em] text-[var(--va-app-muted)]">POINTS EARNED</div>
                <div className="mt-1 text-lg font-semibold text-[#D4A106] dark:text-[#F2D827]">{stats.referralPoints}</div>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
