'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AppLayout } from '../../../components/layout/AppLayout';
import { Gift, ShieldCheck, ArrowLeft, Flame } from 'lucide-react';
import { usePublicEnvelope, useClaimPublicEnvelope } from '../../../hooks/use-growth';
import { PasskeyPrompt } from '../../../components/ui/PasskeyPrompt';
import { ShareEnvelopeLink } from '../../../components/ShareEnvelopeLink';
import confetti from 'canvas-confetti';
import { VeriAgentLoader } from '../../../components/ui/VeriAgentLoader';
import { useToast } from '../../../components/providers/NotificationProvider';

function PublicEnvelopeClaimContent() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || 'pub-env-preview';
  const { data: envelope, isLoading } = usePublicEnvelope(id);

  const [showPasskey, setShowPasskey] = useState(false);
  const [claimedResult, setClaimedResult] = useState<any>(null);

  const claimMutation = useClaimPublicEnvelope();

  const handleClaimSuccess = async () => {
    try {
      const res = await claimMutation.mutateAsync(id);
      setShowPasskey(false);
      if (res) {
        setClaimedResult(res);
        confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 } });
        toast.success('Envelope packet claimed successfully!', {
          title: 'Claim Successful',
        });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to claim packet', {
        title: 'Claim Error',
      });
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="min-h-[50vh] flex items-center justify-center p-6">
          <VeriAgentLoader
            variant="card"
            size="md"
            text="Loading Public Envelope"
            subtext="Connecting to smart reward contract..."
            showProgress={true}
          />
        </div>
      </AppLayout>
    );
  }

  const remainingBalance = envelope?.remainingBalance || 320.0;
  const remainingClaims = envelope?.remainingClaims || 64;
  const token = envelope?.token || 'USDC';

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
            <h1 className="text-2xl font-bold bg-gradient-to-r from-red-400 via-amber-300 to-yellow-400 bg-clip-text text-transparent flex items-center space-x-2">
              <Gift className="w-6 h-6 text-red-400" />
              <span>Public Red Envelope Drop 🧧</span>
            </h1>
            <p className="text-xs text-slate-400">First-come, first-served gasless lucky packet drop</p>
          </div>
        </div>

        {/* Claim Success Banner */}
        {claimedResult && (
          <div className="bg-gradient-to-r from-red-600 via-amber-600 to-yellow-600 rounded-2xl p-6 text-center space-y-2 text-white shadow-2xl animate-bounce">
            <h3 className="text-2xl font-extrabold">🎉 Lucky Payout Claimed!</h3>
            <p className="text-sm font-semibold">
              You won <span className="underline">{claimedResult.claimedAmount} {claimedResult.token}</span>!
            </p>
          </div>
        )}

        {/* Public Drop Card */}
        <div className="bg-slate-950/80 border border-red-500/30 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl backdrop-blur-xl text-center">
          <div className="w-20 h-20 bg-gradient-to-tr from-red-600 to-amber-500 rounded-full flex items-center justify-center mx-auto text-white shadow-lg shadow-red-950 animate-pulse">
            <Gift className="w-10 h-10" />
          </div>

          <div>
            <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">Remaining Pool Payout</span>
            <div className="text-4xl font-extrabold text-white mt-1">
              ${remainingBalance} <span className="text-red-400">{token}</span>
            </div>
            <p className="text-xs text-slate-400 mt-1 flex items-center justify-center space-x-1">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>{remainingClaims} lucky claims left in drop!</span>
            </p>
          </div>

          <ShareEnvelopeLink envelopeId={id} />

          {!claimedResult && (
            <button
              onClick={() => setShowPasskey(true)}
              className="w-full py-4 bg-gradient-to-r from-red-600 via-amber-600 to-yellow-600 hover:from-red-500 hover:to-yellow-500 text-white font-extrabold text-base rounded-2xl shadow-xl shadow-red-950 flex items-center justify-center space-x-2 transition"
            >
              <Gift className="w-6 h-6" />
              <span>Claim Lucky Packet (Passkey)</span>
            </button>
          )}
        </div>
      </div>

      {/* Passkey Biometric Confirmation Modal */}
      {showPasskey && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-red-500/30 rounded-2xl p-6 max-w-md w-full space-y-6 shadow-2xl">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Biometric Passkey Claim</h3>
              <p className="text-xs text-slate-400">Sign with your Passkey to claim lucky packet payout</p>
            </div>

            <PasskeyPrompt onSuccess={handleClaimSuccess} onCancel={() => setShowPasskey(false)} />
          </div>
        </div>
      )}
    </AppLayout>
  );
}

export default function PublicEnvelopeClaimPage() {
  return (
    <Suspense
      fallback={
        <VeriAgentLoader
          variant="fullscreen"
          size="md"
          text="Public Envelope Drop"
          subtext="Loading drop parameters..."
          showProgress={true}
        />
      }
    >
      <PublicEnvelopeClaimContent />
    </Suspense>
  );
}
