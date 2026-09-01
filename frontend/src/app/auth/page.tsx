'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getAuthState, getAuthRedirectPath } from '../../lib/auth';
import { VeriAgentLoader } from '../../components/ui/VeriAgentLoader';

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<string>('Checking authentication credentials...');

  useEffect(() => {
    const handleAuth = async () => {
      try {
        // Get current auth state
        setStatus('Verifying passkey credentials...');
        const authState = getAuthState();

        // Determine redirect path
        const redirectPath = getAuthRedirectPath(authState);

        // Preserve query parameters
        const params = new URLSearchParams(searchParams.toString());
        const queryString = params.toString();
        const fullPath = queryString ? `${redirectPath}?${queryString}` : redirectPath;

        // Set status based on redirect
        if (redirectPath === '/dashboard') {
          setStatus('Welcome back! Redirecting to dashboard...');
        } else if (redirectPath === '/login') {
          setStatus('Session expired. Redirecting to login...');
        } else {
          setStatus('New user detected. Setting up your wallet...');
        }

        // Small delay for UX (so users see the status)
        await new Promise(resolve => setTimeout(resolve, 800));

        // Redirect
        router.push(fullPath);
      } catch (err) {
        console.error('[Auth] Routing error:', err);
        setStatus('Authentication error. Redirecting to onboarding...');
        setTimeout(() => router.push('/onboard'), 1000);
      }
    };

    handleAuth();
  }, [router, searchParams]);

  return (
    <VeriAgentLoader
      variant="fullscreen"
      size="lg"
      text="VeriAgent Pay"
      subtext={status}
      showProgress={true}
    />
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <VeriAgentLoader
          variant="fullscreen"
          size="lg"
          text="VeriAgent Pay"
          subtext="Authenticating session..."
          showProgress={true}
        />
      }
    >
      <AuthContent />
    </Suspense>
  );
}

