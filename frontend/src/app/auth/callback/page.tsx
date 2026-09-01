'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useWalletStore } from '../../../store/useWalletStore';
import { VeriAgentLoader } from '../../../components/ui/VeriAgentLoader';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const processCallback = async () => {
      try {
        const code = searchParams.get('code');
        const returnTo = searchParams.get('returnTo');

        if (!code) {
          throw new Error('Missing authorization code');
        }

        const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(`${apiBase}/api/auth/exchange-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || 'Failed to exchange authorization code');
        }

        const data = await res.json();
        if (data.token) {
          useWalletStore.getState().setToken(data.token);
          if (data.user?.walletAddress) {
            localStorage.setItem('veriagent_wallet_address', data.user.walletAddress);
          }
        }

        // Safe relative redirect to prevent open redirect attacks
        const destination = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/dashboard';
        router.replace(destination);
      } catch (err: any) {
        console.error('[OAuth Callback] Error:', err);
        setError(err.message || 'Authentication failed');
        setTimeout(() => router.replace('/login'), 2000);
      }
    };

    processCallback();
  }, [router, searchParams]);

  if (error) {
    return (
      <VeriAgentLoader
        variant="fullscreen"
        size="lg"
        text="Authentication Failed"
        subtext={`${error}. Redirecting to login...`}
        showProgress={false}
      />
    );
  }

  return (
    <VeriAgentLoader
      variant="fullscreen"
      size="lg"
      text="VeriAgent Pay"
      subtext="Completing secure authentication..."
      showProgress={true}
    />
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <VeriAgentLoader
          variant="fullscreen"
          size="lg"
          text="VeriAgent Pay"
          subtext="Completing sign-in..."
          showProgress={true}
        />
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
