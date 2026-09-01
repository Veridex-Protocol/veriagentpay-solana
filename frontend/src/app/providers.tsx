'use client';

import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import { usePlatformStore, PlatformType } from '../store/usePlatformStore';
import { useWalletStore } from '../store/useWalletStore';
import { SocketProvider } from '../components/providers/SocketProvider';
import { ThemeProvider } from '../components/providers/ThemeProvider';
import { NotificationProvider } from '../components/providers/NotificationProvider';
import { VeriAgentLoader } from '../components/ui/VeriAgentLoader';
import { ApiError, restoreAccessToken } from '../lib/api';

const isPublicRoute = (pathname: string) =>
  pathname === '/' ||
  ['/login', '/auth', '/onboard', '/activate', '/privacy', '/discord', '/hk2026', '/claim', '/claim-envelope'].includes(pathname) ||
  pathname.startsWith('/c/') ||
  // Claim links are intentionally public: they establish a wallet/passkey for
  // a recipient who may not have signed in on this browser yet.
  (pathname.startsWith('/claim/') && pathname !== '/claim/envelope') ||
  pathname.startsWith('/claim-envelope/');

/**
 * Keeps the entire authenticated application unmounted until the durable
 * HttpOnly refresh session has been restored. This prevents every page's
 * independent React Query hook from issuing an unauthenticated bootstrap call
 * before the passkey session is known.
 */
function PasskeySessionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const token = useWalletStore((state) => state.token);
  const authChecked = useWalletStore((state) => state.authChecked);
  const setAuthChecked = useWalletStore((state) => state.setAuthChecked);
  const setAuthRequired = useWalletStore((state) => state.setAuthRequired);
  const publicRoute = isPublicRoute(pathname);

  useEffect(() => {
    if (publicRoute) return;

    if (token) {
      if (!authChecked) setAuthChecked(true);
      setAuthRequired(false);
      return;
    }

    if (authChecked) {
      setAuthRequired(true);
      return;
    }

    let cancelled = false;
    restoreAccessToken()
      .then((accessToken) => {
        if (cancelled) return;
        setAuthRequired(!accessToken);
        setAuthChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        setAuthRequired(true);
        setAuthChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [authChecked, publicRoute, setAuthChecked, setAuthRequired, token]);

  useEffect(() => {
    if (publicRoute || !authChecked || token) return;

    // An envelope share link points at the owner's detail page, but the person
    // following it is usually the recipient, who has no account yet. Sending
    // them to passkey login is a dead end: there is no passkey to present.
    // The public claim page can create one and claim in a single flow.
    const sharedEnvelopeId = /^\/envelopes\/([^/]+)\/?$/.exec(window.location.pathname)?.[1];
    if (sharedEnvelopeId) {
      router.replace(`/claim-envelope/${sharedEnvelopeId}`);
      return;
    }

    const currentPath = `${window.location.pathname}${window.location.search}`;
    router.replace(`/login?reason=session&next=${encodeURIComponent(currentPath)}`);
  }, [authChecked, publicRoute, router, token]);

  if (publicRoute) return <>{children}</>;

  if (!authChecked) {
    return (
      <VeriAgentLoader
        variant="fullscreen"
        size="lg"
        text="VeriAgent Pay"
        subtext="Verifying your passkey credentials..."
        showProgress={true}
      />
    );
  }

  // Keep protected content off-screen while the redirect effect moves the
  // visitor to passkey login. No child query, effect, or socket is mounted.
  if (!token) return null;

  return <SocketProvider>{children}</SocketProvider>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 30, // 30 seconds
            refetchOnWindowFocus: false,
            retry: (failureCount, error) =>
              !(error instanceof ApiError && error.status === 401) && failureCount < 3,
          },
        },
      })
  );

  const setPlatform = usePlatformStore((state) => state.setPlatform);
  const setIsInIframe = usePlatformStore((state) => state.setIsInIframe);

  useEffect(() => {
    // Detect environment
    if (typeof window !== 'undefined') {
      const isIframe = window.self !== window.top;
      setIsInIframe(isIframe);

      const params = new URLSearchParams(window.location.search);
      const platformParam = params.get('platform');
      const userAgent = navigator.userAgent || '';

      let detectedPlatform: PlatformType = 'web';
      if (platformParam === 'telegram' || userAgent.includes('Telegram') || (window as any).Telegram?.WebApp) {
        detectedPlatform = 'telegram';
      } else if (platformParam === 'whatsapp' || userAgent.includes('WhatsApp')) {
        detectedPlatform = 'whatsapp';
      } else if (platformParam === 'discord' || userAgent.includes('Discord') || isIframe) {
        detectedPlatform = 'discord';
      }

      setPlatform(detectedPlatform);
    }
  }, [setPlatform, setIsInIframe]);

  return (
    <ThemeProvider>
      <NotificationProvider>
        <SessionProvider refetchOnWindowFocus={false}>
          <QueryClientProvider client={queryClient}>
            <PasskeySessionGate>{children}</PasskeySessionGate>
          </QueryClientProvider>
        </SessionProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}
