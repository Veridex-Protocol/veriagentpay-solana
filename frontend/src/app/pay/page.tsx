'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { AppLayout } from '../../components/layout/AppLayout';
import { CreditCard, ShieldCheck, CheckCircle2, ArrowLeft, ExternalLink } from 'lucide-react';
import { PasskeyPrompt } from '../../components/ui/PasskeyPrompt';
import confetti from 'canvas-confetti';
import { getExplorerTxUrl, formatTxHash } from '../../lib/explorer';
import { VeriAgentLogoMark } from '../../components/ui/VeriAgentLoader';
import { transferWithPasskey } from '../../lib/passkey-actions';

function MerchantCheckoutContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const codeParam = searchParams.get('code') || searchParams.get('c');

  React.useEffect(() => {
    if (codeParam) {
      router.replace(`/c/${codeParam}`);
    }
  }, [codeParam, router]);

  const action = searchParams.get('action') || 'pay';
  const platform = searchParams.get('platform');
  const fromUser = searchParams.get('from');
  const isClaimMode = action === 'claim' || platform === 'telegram';

  const to = searchParams.get('to') || '';
  const amount = searchParams.get('amount') || '0.00';
  const token = searchParams.get('token') || 'USDC';
  const note = searchParams.get('note') || (isClaimMode ? `Social Payout ${fromUser ? `from @${fromUser}` : ''}` : 'Payment');

  const [showPasskey, setShowPasskey] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  const handlePaymentSuccess = async (_signature?: string) => {
    setIsRegistering(true);
    setPaymentError('');
    try {
      // Success is now reported only once a transaction actually settles. This
      // previously showed a confirmation and confetti against a TODO, so a user
      // who completed the passkey prompt was told their money had moved when
      // nothing had been sent.
      //
      // @see docs/security-remediation-plan.md (FE-C-05)
      const result = await transferWithPasskey({
        to,
        token,
        amount: parseFloat(amount),
        note,
      });

      if (!result?.success || !result?.txHash) {
        throw new Error('The payment did not complete. No funds were sent.');
      }

      setShowPasskey(false);
      setPaymentSuccess(true);
      setTxHash(result.txHash);
      confetti({ particleCount: 120, spread: 90, origin: { y: 0.55 } });
    } catch (err: any) {
      console.error('Payment failed:', err);
      setShowPasskey(false);
      setPaymentError(err?.message || 'Payment failed. No funds were sent.');
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-3">
          <Link
            href="/dashboard"
            className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center space-x-2">
              <CreditCard className="w-5 h-5 text-[#F2D827]" />
              <span>{isClaimMode ? '🎁 Claim Payout' : 'Merchant Pay'}</span>
            </h1>
            <p className="text-xs text-slate-400">
              {isClaimMode ? 'Claim your social payout with a Solana passkey' : 'USDC checkout secured by a Solana passkey vault'}
            </p>
          </div>
        </div>

        {paymentError && (
          <div
            role="alert"
            className="bg-red-950/40 border border-red-500/40 rounded-xl p-4 text-sm text-red-200"
          >
            <p className="font-semibold text-red-100">Payment not completed</p>
            <p className="mt-1 text-red-200/90">{paymentError}</p>
            <p className="mt-2 text-xs text-red-300/70">
              No funds were sent. You can safely try again.
            </p>
          </div>
        )}

        {paymentSuccess ? (
          /* Receipt View */
          <div className="bg-slate-950 border border-[#F2D827]/30 rounded-2xl p-6 text-center space-y-5 shadow-2xl backdrop-blur-xl">
            <div className="w-16 h-16 bg-[#F2D827]/10 text-[#F2D827] rounded-full flex items-center justify-center mx-auto border border-[#F2D827]/20">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-white">
                {isClaimMode ? '🎉 Passkey Wallet Created & Payout Claimed!' : 'Payment Complete!'}
              </h3>
              {txHash && (
                <a
                  href={getExplorerTxUrl(txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#D4A106] dark:text-[#F2D827] font-mono hover:underline flex items-center justify-center gap-1"
                >
                  Tx: {formatTxHash(txHash)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            <div className="bg-slate-955 p-4 rounded-xl border border-slate-800 text-xs space-y-2 text-left">
              {fromUser && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Sent From</span>
                  <span className="text-white font-semibold">@{fromUser}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">{isClaimMode ? 'Passkey Wallet Address' : 'Merchant'}</span>
                <span className="text-white font-mono font-semibold truncate max-w-[160px]">{to}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{isClaimMode ? 'Claimed Amount' : 'Amount Paid'}</span>
                <span className="text-[#D4A106] dark:text-[#F2D827] font-bold">{amount} {token}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Note</span>
                <span className="text-white font-semibold">{note}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status</span>
                <span className="text-[#D4A106] dark:text-[#F2D827] font-bold">Verified & Deposited to Smart Account</span>
              </div>
            </div>

            <button
              onClick={() => router.push('/dashboard')}
              className="w-full py-3.5 bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-950/20 transition font-mono"
            >
              View Wallet & Balance
            </button>
          </div>
        ) : (
          /* Checkout / Claim Request Card */
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-2xl backdrop-blur-xl">
            <div className="text-center space-y-2 border-b border-slate-800 pb-5">
              <span className="text-xs font-semibold text-[#D4A106] dark:text-[#F2D827] uppercase tracking-wider flex items-center justify-center gap-1">
                <ShieldCheck className="w-4 h-4" />
                {isClaimMode ? `Incoming Payout ${fromUser ? `from @${fromUser}` : 'from Telegram'}` : 'Merchant Invoice Amount'}
              </span>
              <div className="text-4xl font-extrabold text-white">
                ${amount} <span className="text-[#D4A106] dark:text-[#F2D827]">{token}</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              {fromUser && (
                <div className="bg-slate-955 p-3.5 rounded-xl border border-slate-800 space-y-1">
                  <span className="text-slate-500 font-semibold uppercase">Sender</span>
                  <p className="text-[#D4A106] dark:text-[#F2D827] font-bold">@{fromUser}</p>
                </div>
              )}
              <div className="bg-slate-955 p-3.5 rounded-xl border border-slate-800 space-y-1">
                <span className="text-slate-500 font-semibold uppercase">
                  {isClaimMode ? 'Recipient Account' : 'Pay To Merchant'}
                </span>
                <p className="text-white font-mono font-bold truncate">{to}</p>
              </div>
              <div className="bg-slate-955 p-3.5 rounded-xl border border-slate-800 space-y-1">
                <span className="text-slate-500 font-semibold uppercase">Claim Origin</span>
                <p className="text-slate-200 font-medium flex items-center gap-1">
                  ⚡ VeriAgent Pay Telegram Bot Deep Link
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowPasskey(true)}
              disabled={isRegistering}
              className="w-full py-3.5 bg-[#F2D827] hover:bg-[#E5A900] text-slate-950 font-bold text-sm rounded-xl shadow-lg shadow-amber-950/20 flex items-center justify-center space-x-2 transition disabled:opacity-50 cursor-pointer font-mono"
            >
              {isRegistering ? (
                <>
                  <VeriAgentLogoMark size={18} speed="fast" withSquircle={false} glow={false} />
                  <span>Processing Transaction...</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  <span>{isClaimMode ? '🔐 Authorize Passkey & Claim Funds' : '🔐 Authorize & Pay with Passkey'}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Passkey Biometric Confirmation Modal */}
      {showPasskey && (
        <PasskeyPrompt
          isOpen={showPasskey}
          onClose={() => setShowPasskey(false)}
          title={isClaimMode ? '1-Tap Passkey Registration & Claim' : 'Biometric Passkey Checkout'}
          amount={`${amount} ${token}`}
          recipient={to}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </AppLayout>
  );
}

export default function MerchantCheckoutPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-white flex items-center justify-center font-mono text-xs">Loading...</div>}>
      <MerchantCheckoutContent />
    </Suspense>
  );
}
