'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWalletStore } from '../../../store/useWalletStore';
import { registerBiometricPasskey } from '../../../lib/veridex';
import { grantSessionKeyWithPasskey } from '../../../lib/passkey-actions';
import { VeriAgentLoader, VeriAgentLogoMark } from '../../../components/ui/VeriAgentLoader';

interface ShortLinkMetadata {
  code: string;
  kind: string;
  senderUserId?: string;
  targetUserId?: string;
  toAddress?: string;
  fromUser?: string;
  platform?: string;
  amount?: number;
  token?: string;
  status: string;
  expiresAt?: string;
  envelopeId?: string;
}

export default function ShortLinkClaimPage() {
  const params = useParams();
  const router = useRouter();
  const code = params?.code as string;

  const [metadata, setMetadata] = useState<ShortLinkMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimStep, setClaimStep] = useState<'idle' | 'enrolling' | 'authorizing' | 'claiming'>('idle');
  const [claimedTxHash, setClaimedTxHash] = useState<string | null>(null);
  // Set when the claimer registered from a handle alone and still has no
  // platform id. Opening the bot is what supplies it, so the success screen
  // leads with that rather than offering it as an afterthought.
  const [botLink, setBotLink] = useState<string | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      const tg = (window as any).Telegram.WebApp;
      tg.enableClosingConfirmation?.();
      tg.BackButton?.show();
      const handleBack = () => {
        router.push('/dashboard');
      };
      tg.BackButton?.onClick(handleBack);
      return () => {
        tg.BackButton?.offClick(handleBack);
        tg.BackButton?.hide();
      };
    }
  }, [router]);

  useEffect(() => {
    if (!code) return;
    fetch(`${apiBase}/api/shortlinks/${code}`)
      .then((res) => {
        if (!res.ok) throw new Error('Short link not found or invalid');
        return res.json();
      })
      .then((data) => {
        setMetadata(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [code, apiBase]);

  const handleClaimClick = async () => {
    // 0. Pre-enforcement: Abort immediately if link is expired
    const isExpiredLink = metadata?.status === 'EXPIRED' || (metadata?.expiresAt && new Date(metadata.expiresAt) < new Date());
    if (isExpiredLink) {
      setError('This claim link has expired. Unclaimed funds have been returned to the sender.');
      setMetadata((prev) => (prev ? { ...prev, status: 'EXPIRED' } : null));
      return;
    }

    setClaiming(true);
    setClaimStep('enrolling');
    setError(null);

    try {
        // This link is issued only for an unregistered recipient. Deliberately
        // ignore any wallet state left in this browser by another app user:
        // the claim code authorizes a fresh, isolated recipient enrollment.
        const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const paramPlatform = urlParams?.get('platform');
        const paramPlatformId = urlParams?.get('id') || urlParams?.get('phone') || urlParams?.get('user_id');
        const paramUsername = urlParams?.get('username') || urlParams?.get('user') || urlParams?.get('handle');

        const tgUser = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp?.initDataUnsafe?.user : null;

        let platform = (paramPlatform || metadata?.platform || 'web').toLowerCase();
        if (tgUser) platform = 'telegram';

        const rawTarget = metadata?.targetUserId ? metadata.targetUserId.replace(/^@/, '') : '';
        const platformId = paramPlatformId || (tgUser?.id ? tgUser.id.toString() : (rawTarget || `user_${Date.now()}`));
        const username = paramUsername || tgUser?.username || rawTarget || `user_${Date.now().toString().slice(-4)}`;

        // Step 1: Create a new passkey via WebAuthn (also registers user + wallet)
        const passkeyResult = await registerBiometricPasskey(username, {
          platform: platform as any,
          platformId,
          claimCode: code,
        });

        // Save wallet to local store
        if (passkeyResult.smartAccountAddress) {
          useWalletStore.getState().setAddress(passkeyResult.smartAccountAddress);
          useWalletStore.getState().setPasskeyRegistered(true);
          if (typeof window !== 'undefined') {
            localStorage.setItem('veriagent_wallet_address', passkeyResult.smartAccountAddress);
            localStorage.setItem('veriagent_passkey_registered', 'true');
          }
          if (passkeyResult.accessToken) useWalletStore.getState().setToken(passkeyResult.accessToken);
        }

        if (!passkeyResult.smartAccountAddress || !passkeyResult.accessToken) {
          throw new Error('Wallet enrollment did not return an authenticated wallet session. Please try again.');
        }

        // Step 2: The freshly enrolled passkey authorizes the initial session
        // grant on-chain. Registration provisions key material, but cannot
        // activate spending authority without this explicit user signature.
        setClaimStep('authorizing');
        await grantSessionKeyWithPasskey({
          durationHours: 24,
          perTxLimitUSD: 100,
          dailyLimitUSD: 100,
        });

        // Step 3: Claim with the newly registered and authorized wallet.
        setClaimStep('claiming');
        const claimRes = await fetch(`${apiBase}/api/shortlinks/${code}/claim`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${passkeyResult.accessToken}`,
          },
          credentials: 'include',
          body: JSON.stringify({}),
        });

        if (!claimRes.ok) {
          const errData = await claimRes.json();
          throw new Error(errData.message || 'Failed to claim escrowed funds');
        }

        const claimData = await claimRes.json();
        setClaimedTxHash(claimData.txHash || null);
        setBotLink(claimData.needsPlatformLink ? claimData.botLink ?? null : null);
        setMetadata((prev) => (prev ? { ...prev, status: 'CLAIMED' } : null));
      if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.HapticFeedback) {
        (window as any).Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setClaiming(false);
      setClaimStep('idle');
    }
  };

  if (loading) {
    return (
      <VeriAgentLoader
        variant="fullscreen"
        size="lg"
        text="VeriAgent Pay"
        subtext="Fetching social escrow payment details..."
        showProgress={true}
      />
    );
  }

  if (!metadata) {
    return (
      <div className="va-auth-shell va-public-claim flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-red-900/30 flex items-center justify-center mb-4">
          <span className="text-2xl">⚠️</span>
        </div>
        <h1 className="text-xl font-semibold mb-2">Claim Link Error</h1>
        <p className="va-public-claim-copy max-w-md mb-6">{error || 'This link is invalid or has expired.'}</p>
        <button
          onClick={() => router.push('/')}
          className="va-product-action px-6 py-2.5 text-sm transition"
        >
          Return to App
        </button>
      </div>
    );
  }

  return (
    <div className="va-auth-shell va-public-claim flex min-h-screen flex-col items-center justify-center px-4 py-12 touch-pan-y">
      <div className="va-auth-card va-public-claim-card relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-yellow-500/10 rounded-full blur-3xl"></div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-semibold uppercase tracking-wider mb-4">
            ⚡ Escrowed Social Transfer
          </div>
          <h1 className="text-2xl font-semibold">
            {metadata.fromUser ? `${metadata.fromUser} sent you` : 'You received'}
          </h1>
          <div className="va-public-claim-amount my-3">
            ${metadata.amount} <span className="text-2xl font-semibold" style={{ color: 'var(--va-app-ink)' }}>{metadata.token || 'USDT'}</span>
          </div>
          <p className="va-public-claim-copy text-xs">
            Secured on BOTChain L1 via SocialPayments escrow
          </p>
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs text-center font-medium">
            ⚠️ {error}
          </div>
        )}

        {claimedTxHash || metadata.status === 'CLAIMED' ? (
          <div className="va-public-claim-success p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-yellow-500/20 text-yellow-400 flex items-center justify-center mx-auto mb-3 text-xl">
              ✓
            </div>
            <h3 className="font-bold text-yellow-400 text-lg mb-1">Payment Claimed!</h3>
            <p className="va-public-claim-copy text-xs break-all mb-4">
              Tx: {claimedTxHash || 'Claimed on-chain'}
            </p>

            {botLink ? (
              <div className="space-y-3">
                <p className="va-public-claim-warning text-xs leading-relaxed p-3 text-left">
                  <strong className="text-amber-400">One step left.</strong> Open the bot to link
                  this wallet to your Telegram account. Until you do, the bot cannot find your
                  funds or message you about them.
                </p>
                <a
                  href={botLink}
                  className="va-product-action va-product-action--primary block w-full py-3 text-center transition"
                >
                  Open VeriAgent Pay Bot
                </a>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="va-product-action w-full py-2.5 text-xs transition"
                >
                  Skip for now
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.close) {
                    (window as any).Telegram.WebApp.close();
                  } else {
                    router.push('/dashboard');
                  }
                }}
                className="va-product-action va-product-action--primary w-full py-3 transition"
              >
                {typeof window !== 'undefined' && (window as any).Telegram?.WebApp ? 'Return to Telegram Chat' : 'Go to Dashboard'}
              </button>
            )}
          </div>
        ) : metadata.status === 'EXPIRED' ? (
          <div className="va-public-claim-warning p-6 text-center">
            <h3 className="font-bold text-amber-400 text-lg mb-1">Link Expired</h3>
            <p className="va-public-claim-copy text-xs">
              Unclaimed funds have been returned to the sender.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={handleClaimClick}
              disabled={claiming}
              className="va-product-action va-product-action--primary w-full py-4 text-base transition disabled:opacity-50 flex items-center justify-center gap-2.5"
            >
              {claiming ? (
                <>
                  <VeriAgentLogoMark size={20} speed="fast" withSquircle={false} glow={false} />
                  <span>
                    {claimStep === 'enrolling'
                      ? 'Creating your passkey wallet...'
                      : claimStep === 'authorizing'
                        ? 'Authorize your wallet to claim...'
                        : 'Claiming your payment...'}
                  </span>
                </>
              ) : metadata.targetUserId ? (
                `🧧 Create Passkey Wallet for @${metadata.targetUserId.replace(/^@/, '')} & Claim`
              ) : (
                '🧧 Create Passkey Wallet & Claim'
              )}
            </button>
            <p className="va-public-claim-copy text-center text-xs">
              No seed phrase required. Deploys gasless smart account via Touch ID / Face ID.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
