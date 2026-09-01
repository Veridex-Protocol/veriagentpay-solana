'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppLayout } from '../../../components/layout/AppLayout';
import {
  Gift,
  ArrowLeft,
  Users,
  XCircle,
  ShieldCheck,
} from 'lucide-react';
import {
  useEnvelopeDetails,
  useCancelEnvelope,
  useClaimEnvelope,
} from '../../../hooks/use-envelopes';
import { PasskeyPrompt } from '../../../components/ui/PasskeyPrompt';
import { ShareEnvelopeLink } from '../../../components/ShareEnvelopeLink';
import { EnvelopeRevealOverlay } from '../../../components/envelopes/EnvelopeRevealOverlay';

import { useWalletStore } from '../../../store/useWalletStore';
import { usePasskey } from '../../../hooks/usePasskey';
import { VeriAgentLoader } from '../../../components/ui/VeriAgentLoader';
import { useConfirm, useToast } from '../../../components/providers/NotificationProvider';

export default function RedEnvelopeDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { data: envelope, isLoading, refetch } = useEnvelopeDetails(id);
  const confirm = useConfirm();
  const toast = useToast();

  const { address, passkeyRegistered } = useWalletStore();
  const { registerPasskey } = usePasskey();
  const isWalletActive = Boolean(
    address ||
    passkeyRegistered ||
    (typeof window !== 'undefined' && (localStorage.getItem('veriagent_wallet_address') || localStorage.getItem('veriagent_passkey_registered') === 'true'))
  );

  const [showPasskey, setShowPasskey] = useState(false);
  const [claimedResult, setClaimedResult] = useState<any>(null);
  const [claiming, setClaiming] = useState(false);
  const [showReveal, setShowReveal] = useState(false);

  const cancelMutation = useCancelEnvelope();
  const claimMutation = useClaimEnvelope();

  if (isLoading) {
    return (
      <AppLayout>
        <div className="min-h-[50vh] flex items-center justify-center p-6">
          <VeriAgentLoader
            variant="card"
            size="md"
            text="Loading Red Envelope"
            subtext="Connecting to decentralized reward pool..."
            showProgress={true}
          />
        </div>
      </AppLayout>
    );
  }

  if (!envelope) {
    return (
      <AppLayout>
        <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-4">
          <p className="text-slate-400">Red envelope not found.</p>
          <Link href="/envelopes" className="text-red-400 hover:underline text-sm font-semibold">
            &larr; Back to envelopes
          </Link>
        </div>
      </AppLayout>
    );
  }

  const isActive = envelope.status === 'ACTIVE';
  const claims = envelope.claims || [];

  // Check if current user is the creator
  const currentWalletAddress = address || (typeof window !== 'undefined' ? localStorage.getItem('veriagent_wallet_address') : null);
  const currentUserId = typeof window !== 'undefined' ? localStorage.getItem('veriagent_user_id') : null;

  const isCreator = Boolean(
    (envelope.creatorWalletAddress && currentWalletAddress && envelope.creatorWalletAddress.toLowerCase() === currentWalletAddress.toLowerCase()) ||
    (envelope.creatorId && (currentUserId === envelope.creatorId || currentWalletAddress === envelope.creatorId))
  );

  const handleClaimSuccess = async () => {
    setClaiming(true);
    try {
      const res = await claimMutation.mutateAsync(id);
      setShowPasskey(false);
      if (res) {
        setClaimedResult(res);
        // Confetti fires from inside the reveal overlay, at the payoff beat.
        setShowReveal(true);
        refetch();
      }
    } catch (err: any) {
      toast.error(err.message || 'Claim failed', { title: 'Claim Error' });
    } finally {
      setClaiming(false);
    }
  };

  const handleClaimClick = async () => {
    if (isWalletActive) {
      handleClaimSuccess();
    } else {
      // New user without an account: 1-click Passkey creation + auto claim
      const attestation = await registerPasskey('user_' + Date.now().toString(36));
      if (attestation) {
        handleClaimSuccess();
      }
    }
  };

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-3">
          <Link
            href="/envelopes"
            className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center space-x-2">
              <Gift className="w-6 h-6 text-red-400" />
              <span>Red Envelope Details</span>
            </h1>
            <p className="text-xs text-slate-400">ID: {envelope.id}</p>
          </div>
        </div>

        {/* Claim Success Celebration Banner */}
        {claimedResult && (
          <div className="bg-gradient-to-r from-red-600 via-amber-600 to-yellow-600 rounded-2xl p-6 text-center space-y-3 text-white shadow-2xl">
            <h3 className="text-2xl font-extrabold">🧧 Congratulations!</h3>
            <p className="text-sm font-semibold">
              You claimed <span className="underline">{claimedResult.claimedAmount} {claimedResult.token}</span>!
            </p>
            {claimedResult.payItForward && (
              <a
                href={claimedResult.payItForward.deepLink}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/95 px-5 py-2.5 text-sm font-bold text-red-700 transition hover:bg-white"
              >
                🧧 Create Your Own ({claimedResult.payItForward.suggestedAmount} {claimedResult.token})
              </a>
            )}
          </div>
        )}

        <EnvelopeRevealOverlay
          open={showReveal}
          amount={claimedResult?.claimedAmount ?? ''}
          token={claimedResult?.token ?? envelope.token}
          payItForward={claimedResult?.payItForward}
          onClose={() => setShowReveal(false)}
        />

        {/* Main Envelope Card */}
        <div className="bg-slate-950/80 border border-red-500/30 rounded-2xl p-6 space-y-6 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-5">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Amount Pool</p>
              <p className="text-3xl font-extrabold text-white">
                {envelope.totalAmount} <span className="text-red-400">{envelope.token}</span>
              </p>
            </div>
            <div className="flex flex-col items-end space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                {envelope.type}
              </span>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${isActive
                    ? 'bg-[#F2D827]/10 text-[#D4A106] dark:text-[#F2D827] border border-[#F2D827]/30'
                    : 'bg-slate-800 text-slate-400'
                  }`}
              >
                {envelope.status}
              </span>
            </div>
          </div>

          <p className="text-sm text-slate-200 italic bg-slate-955/60 p-3.5 rounded-xl border border-slate-800">
            "{envelope.message}"
          </p>

          {/* Envelope Stats Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-1">
              <span className="text-slate-500 font-semibold uppercase">Remaining Balance</span>
              <p className="text-[#F2D827] font-bold text-base">
                {envelope.remainingBalance} {envelope.token}
              </p>
            </div>
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-1">
              <span className="text-slate-500 font-semibold uppercase">Claims Remaining</span>
              <p className="text-white font-bold text-base">{envelope.remainingClaims} left</p>
            </div>
          </div>

          {/* Multi-Platform Share Section */}
          <ShareEnvelopeLink envelopeId={envelope.id} />

          {/* Claims History Table */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
              <Users className="w-4 h-4 text-slate-400" />
              <span>Claims History ({claims.length})</span>
            </h4>

            {claims.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 bg-slate-955/60 rounded-xl border border-slate-800">
                No claims yet. Share the link to distribute lucky packets!
              </div>
            ) : (
              <div className="space-y-2">
                {claims.map((claim: any) => (
                  <div
                    key={claim.id}
                    className="flex items-center justify-between p-3 bg-slate-955/80 border border-slate-800 rounded-xl text-xs"
                  >
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center font-bold text-xs">
                        🎁
                      </div>
                      <span className="text-slate-200 font-medium font-mono truncate max-w-[140px]">
                        {claim.claimerAddress}
                      </span>
                    </div>
                    <span className="text-[#D4A106] dark:text-[#F2D827] font-bold">
                      +{claim.amount} {envelope.token}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {isActive && (
            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={handleClaimClick}
                disabled={claiming || claimMutation.isPending}
                className="flex-1 py-3.5 px-4 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-sm flex items-center justify-center space-x-2 transition shadow-lg shadow-red-950 disabled:opacity-50"
              >
                <Gift className="w-5 h-5" />
                <span>{claiming || claimMutation.isPending ? 'Claiming Gas-Free...' : isWalletActive ? 'Claim Your Packet' : '🧧 1-Click Passkey & Claim'}</span>
              </button>

              {isCreator && (
                <button
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Cancel Envelope & Refund',
                      message: `Cancel this envelope and refund remaining ${envelope.remainingBalance} ${envelope.token}?`,
                      description: 'The remaining tokens will be transferred back to your wallet and the envelope closed.',
                      badge: `${envelope.remainingBalance} ${envelope.token}`,
                      confirmText: 'Cancel & Refund',
                      cancelText: 'Keep Active',
                      variant: 'danger',
                    });
                    if (ok) {
                      try {
                        await cancelMutation.mutateAsync(envelope.id);
                        toast.success(`Refunded ${envelope.remainingBalance} ${envelope.token} to your wallet!`, {
                          title: 'Envelope Cancelled',
                        });
                      } catch (err: any) {
                        toast.error(err.message || 'Failed to cancel envelope');
                      }
                    }
                  }}
                  disabled={cancelMutation.isPending}
                  className="py-3.5 px-4 rounded-xl bg-slate-800 hover:bg-red-950/50 text-red-400 font-semibold text-sm flex items-center justify-center space-x-2 transition"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Cancel & Refund</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Passkey Claim Confirmation Modal */}
      {showPasskey && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-red-500/30 rounded-2xl p-6 max-w-md w-full space-y-6 shadow-2xl">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Biometric Passkey Claim</h3>
              <p className="text-xs text-slate-400">
                Sign with Passkey to claim lucky packet from <span className="text-red-300 font-bold">{envelope.creatorId}</span>
              </p>
            </div>

            <PasskeyPrompt
              onSuccess={handleClaimSuccess}
              onCancel={() => setShowPasskey(false)}
            />
          </div>
        </div>
      )}
    </AppLayout>
  );
}
