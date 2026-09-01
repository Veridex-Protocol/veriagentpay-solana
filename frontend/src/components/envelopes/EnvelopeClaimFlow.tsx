'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useYieldApy } from '../../hooks/useApi';
import { api, restoreAccessToken, type RedEnvelopePreview } from '../../lib/api';
import { useWalletStore } from '../../store/useWalletStore';
import { registerBiometricPasskey } from '../../lib/veridex';
import { grantSessionKeyWithPasskey } from '../../lib/passkey-actions';
import { Gift, CheckCircle2, Sparkles, ArrowRight, MessageSquare } from 'lucide-react';
import { VeriAgentLoader, VeriAgentLogoMark } from '../ui/VeriAgentLoader';

/**
 * The recipient's side of a red envelope share link.
 *
 * Whoever opens this usually has no account: the sender posted the link into a
 * group chat. So it reads the envelope without a session, and the claim button
 * creates the wallet, authorizes it, and claims in one pass rather than
 * bouncing an account-less visitor into passkey login.
 *
 * Lives as a component, not a page, because two routes reach it: `/claim-envelope/:id`
 * and the consolidated `/claim/:id`. Having one render and the other redirect
 * would fight the permanent redirect browsers may still have cached between
 * those two paths.
 */
export function EnvelopeClaimFlow({ envelopeId }: { envelopeId: string }) {
  // Quoted rate comes from the oracle, not a constant.
  const { label: apyLabel } = useYieldApy();
  const router = useRouter();

  const token = useWalletStore((state) => state.token);
  const setToken = useWalletStore((state) => state.setToken);
  const setAddress = useWalletStore((state) => state.setAddress);
  const setPasskeyRegistered = useWalletStore((state) => state.setPasskeyRegistered);

  const [envelope, setEnvelope] = useState<RedEnvelopePreview | null>(null);
  const [claimedAmount, setClaimedAmount] = useState<number | null>(null);
  const [claimStep, setClaimStep] = useState<'idle' | 'enrolling' | 'authorizing' | 'claiming'>('idle');
  const [createdWallet, setCreatedWallet] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const claiming = claimStep !== 'idle';
  const amount = envelope?.remainingBalance ?? 0;
  const tokenSymbol = envelope?.token || 'USDT';

  // What this recipient actually walks away with, which is not always the
  // whole remaining pool: an OPEN envelope with claims left either draws a
  // random share or splits evenly, and only the final claim takes the rest.
  const isLastClaim = !envelope || envelope.remainingClaims <= 1;
  const isRandomShare = Boolean(envelope && envelope.isRandom && !isLastClaim);
  const evenShare =
    envelope && !envelope.isRandom && !isLastClaim
      ? Math.min(envelope.totalAmount / Math.max(1, envelope.maxClaims), amount)
      : null;
  const headlineAmount = evenShare ?? amount;

  useEffect(() => {
    if (!envelopeId) return;
    api.fetchRedEnvelopePreview(envelopeId)
      .then(({ envelope: preview }) => setEnvelope(preview))
      .catch((requestError) => setError(requestError.message || 'Envelope details are unavailable.'));
  }, [envelopeId]);

  // This flow is public, so the session gate never restores a session here:
  // and without this, a returning user would be enrolled as a brand-new one and
  // claim into a second wallet instead of the one they already have.
  useEffect(() => {
    restoreAccessToken().finally(() => setSessionChecked(true));
  }, []);

  /**
   * Creates the wallet a first-time recipient claims with.
   *
   * Registration mints the identity server-side for a web signup, so nothing
   * needs to be supplied here. The session-key grant that follows is not
   * optional: registration provisions key material but only a passkey-signed
   * `registerSession` gives it spending authority, and the claim needs it.
   */
  const enrollWallet = async () => {
    setClaimStep('enrolling');
    const passkeyResult = await registerBiometricPasskey('', {
      platform: 'web',
      platformId: '',
      label: 'Primary passkey',
    });

    const walletAddress = passkeyResult.smartAccountAddress;
    if (!walletAddress || !passkeyResult.accessToken) {
      throw new Error('Wallet enrollment did not return an authenticated wallet session. Please try again.');
    }

    setToken(passkeyResult.accessToken);
    setAddress(walletAddress);
    setPasskeyRegistered(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('veriagent_wallet_address', walletAddress);
      localStorage.setItem('veriagent_passkey_registered', 'true');
    }

    setClaimStep('authorizing');
    await grantSessionKeyWithPasskey({ durationHours: 24, perTxLimitUSD: 100, dailyLimitUSD: 100 });
    setCreatedWallet(true);
  };

  const handleClaim = async () => {
    if (!envelopeId) return;
    setError(null);

    try {
      if (!token) await enrollWallet();

      setClaimStep('claiming');
      const result = await api.claimRedEnvelope(envelopeId);
      setClaimedAmount(result.claimedAmount ?? amount);
    } catch (e: any) {
      setError(e.message || 'The envelope could not be claimed. Please try again.');
    } finally {
      setClaimStep('idle');
    }
  };

  const claimLabel = {
    idle: 'Claim Red Envelope',
    enrolling: 'Creating Your Wallet...',
    authorizing: 'Authorizing Wallet...',
    claiming: 'Claiming Gas-Free...',
  }[claimStep];

  const isExhausted =
    envelope !== null &&
    (envelope.status !== 'ACTIVE' || envelope.remainingClaims <= 0 || envelope.remainingBalance <= 0);

  if (!envelope && !error) {
    return (
      <VeriAgentLoader
        variant="fullscreen"
        size="lg"
        text="Red Envelope"
        subtext="Fetching gift pool details..."
        showProgress={true}
      />
    );
  }

  return (
    <main className="va-auth-shell va-public-claim px-5 py-10">
      <section className="va-auth-card va-public-claim-card text-center">
        <div className="mb-4 flex items-center justify-center gap-2.5">
          <Gift size={30} className="text-red-500" />
          <h1 className="text-xl font-semibold tracking-tight">Red Envelope</h1>
        </div>

        {claimedAmount !== null ? (
          <div className="va-public-claim-success p-6">
            <CheckCircle2 size={56} className="mx-auto text-[#F2D827]" />
            <h2 className="mt-4 text-2xl font-semibold tracking-tight">
              You claimed {claimedAmount} {tokenSymbol}!
            </h2>
            <p className="va-public-claim-copy mb-6 mt-2 text-sm">
              Funds transferred gas-free to your Smart Account on BOTChain.
            </p>

            {/* A wallet created here has a generated handle. Until a chat
                platform is linked, nobody can pay this person by name. */}
            {createdWallet && (
              <button
                onClick={() => router.push('/settings?connect=telegram')}
                className="va-product-action mb-3 w-full justify-center text-sm"
              >
                <MessageSquare size={16} /> Connect Telegram to claim your handle
              </button>
            )}

            <a
              href={`/save-yield?amount=${encodeURIComponent(String(claimedAmount))}`}
              className="va-product-action justify-center text-sm"
            >
              <Sparkles size={16} /> {apyLabel ? `Earn ${apyLabel} APY` : 'Earn yield'} with Save-with-AI{' '}
              <ArrowRight size={16} />
            </a>
          </div>
        ) : (
          <div>
            {error && (
              <p className="mb-4 rounded-xl border border-red-500/35 bg-red-500/10 px-3.5 py-3 text-sm text-red-500">
                {error}
              </p>
            )}

            {envelope && (
              <>
                <p className="va-public-claim-copy mb-4 text-sm">
                  {envelope.creatorUsername
                    ? `@${envelope.creatorUsername} sent you a Red Envelope gift pool!`
                    : 'Someone sent you a Red Envelope gift pool!'}
                </p>
                {envelope.message && (
                  <p className="va-public-claim-copy mb-4 text-sm italic">“{envelope.message}”</p>
                )}
                <div className="va-product-panel va-public-claim-amount mb-2 p-5">
                  {isRandomShare ? `up to ${amount}` : headlineAmount.toFixed(2)} {tokenSymbol}
                </div>
                <p className="va-public-claim-copy mb-6 text-xs">
                  {isExhausted
                    ? 'This envelope is no longer available.'
                    : isRandomShare
                      ? `Your share is drawn at random from the ${amount} ${tokenSymbol} left · ${envelope.remainingClaims} of ${envelope.maxClaims} claims remaining`
                      : `Yours to claim · ${envelope.remainingClaims} of ${envelope.maxClaims} claims remaining`}
                  {envelope.isTargeted && !isExhausted && ' · reserved for one recipient'}
                </p>

                <button
                  className="va-product-action va-product-action--primary w-full justify-center"
                  onClick={handleClaim}
                  disabled={claiming || isExhausted || !sessionChecked}
                >
                  {claiming && <VeriAgentLogoMark size={18} speed="fast" withSquircle={false} glow={false} />}
                  {claimLabel}
                </button>

                {sessionChecked && !token && !isExhausted && (
                  <>
                    <p className="va-public-claim-copy mt-3 text-xs">
                      No wallet yet? Claiming creates one with Touch ID / Face ID: zero seed phrases, $0 gas.
                    </p>
                    {/* A passkey held in another browser cannot be restored from
                        the cookie above, and enrolling again would open a second
                        wallet. Signing in first claims into the existing one. */}
                    <button
                      onClick={() =>
                        router.push(`/login?next=${encodeURIComponent(`/claim-envelope/${envelopeId}`)}`)
                      }
                      className="va-public-claim-copy mt-2 text-xs underline underline-offset-4"
                    >
                      Already have a VeriAgent Pay wallet? Sign in first
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
