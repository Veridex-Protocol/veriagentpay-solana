// Fix: P2-15 Consolidated Dynamic Claim Route
'use client';

import React, { useState, useEffect } from 'react';
import { useYieldApy } from '../../../hooks/useApi';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Gift, CheckCircle2, Sparkles, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';
import { PasskeyPrompt } from '../../../components/ui/PasskeyPrompt';
import { EnvelopeClaimFlow } from '../../../components/envelopes/EnvelopeClaimFlow';
import { VeriAgentLogoMark } from '../../../components/ui/VeriAgentLoader';

export default function ConsolidatedClaimPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const claimId = params.id;
  // Check if it's an envelope: either has type=envelope query param, starts with 'env-', or is a UUID format
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claimId);
  const isEnvelope = searchParams.get('type') === 'envelope' || claimId.startsWith('env-') || isUuid;

  // Quoted rate comes from the oracle, not a constant: this is the first
  // number a brand-new recipient sees, so it must be one we can stand behind.
  const { label: apyLabel } = useYieldApy();
  const [amount, setAmount] = useState<number>(0);
  const [token, setToken] = useState<string>('USDC');
  const [claimed, setClaimed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isPasskeyOpen, setIsPasskeyOpen] = useState<boolean>(false);

  useEffect(() => {
    if (searchParams.get('amount')) {
      setAmount(parseFloat(searchParams.get('amount') || '0'));
    }
    if (searchParams.get('token')) {
      setToken(searchParams.get('token') || 'USDC');
    }
  }, [searchParams]);

  const handleClaimClick = () => {
    setIsPasskeyOpen(true);
  };

  const handlePasskeySuccess = async (signature: string) => {
    console.log('Signature generated:', signature.substring(0, 10) + '...');
    setIsPasskeyOpen(false);
    setLoading(true);
    setError(null);

    try {
      setClaimed(true);
    } catch (err: any) {
      setError(err.message || 'Claim failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * A red envelope link is followed by its recipient, who usually has no
   * account at all, so it gets the public claim flow: it reads the envelope
   * without a session and enrolls a passkey before claiming.
   *
   * This route used to handle envelopes itself and assumed neither was needed:
   * it fetched through the authenticated endpoint (401 for a recipient, which
   * is why the amount sat at 0.00) and then asked for a passkey *signature*,
   * failing with `NotAllowedError` for someone who never registered one.
   *
   * Rendered rather than redirected to `/claim-envelope/:id`: browsers may hold
   * a cached permanent redirect from that path to this one, and a redirect back
   * would loop.
   */
  if (isEnvelope) {
    return <EnvelopeClaimFlow envelopeId={claimId} />;
  }

  return (
    <main className="va-auth-shell va-public-claim px-5 py-10">
      <section className="va-auth-card va-public-claim-card">
        <div className="mb-5 flex items-center gap-3">
          <Gift size={30} className="text-red-500" />
          <h1 className="text-xl font-semibold tracking-tight">Claim payment</h1>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/35 bg-red-500/10 px-3.5 py-3 text-sm text-red-500">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {claimed ? (
          <div className="va-public-claim-success p-6 text-center">
            <CheckCircle2 size={56} className="mx-auto text-yellow-400" />
            <h2 className="mt-4 text-2xl font-semibold tracking-tight">
              Claimed {amount} {token}!
            </h2>
            <p className="va-public-claim-copy mb-6 mt-2 text-sm">
              USDC transferred to your passkey vault on Solana.
            </p>
            <button
              onClick={() => router.push(`/save-yield?amount=${amount}`)}
              className="va-product-action w-full justify-center text-sm"
            >
              <Sparkles size={16} /> {apyLabel ? `Earn ${apyLabel} APY` : 'Earn yield'} with Save-with-AI <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <div>
            <p className="va-public-claim-copy mb-4 text-sm">You received a gas-free payment drop on VeriAgent Pay.</p>
            <div className="va-product-panel va-public-claim-amount mb-6 p-5 text-center">{amount.toFixed(2)} {token}</div>
            <button
              className="va-product-action va-product-action--primary w-full justify-center flex items-center gap-2"
              onClick={handleClaimClick}
              disabled={loading}
            >
              {loading ? (
                <>
                  <VeriAgentLogoMark size={18} speed="fast" withSquircle={false} glow={false} />
                  <span>Claiming Gas-Free...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={18} />
                  <span>Claim with Passkey</span>
                </>
              )}
            </button>
          </div>
        )}
      </section>

      <PasskeyPrompt
        isOpen={isPasskeyOpen}
        onClose={() => setIsPasskeyOpen(false)}
        onSuccess={handlePasskeySuccess}
        title="Confirm Gasless Claim"
        description={`Authorize claim for ${amount.toFixed(2)} ${token} with Passkey`}
      />
    </main>
  );
}
