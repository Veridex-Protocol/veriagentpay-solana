'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getAuthState } from '../../lib/auth';
import { VeriAgentLoader } from '../ui/VeriAgentLoader';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean; // If true, redirect unauthenticated users
  requirePasskey?: boolean; // If true, redirect users without passkey to onboard
}

/**
 * AuthGuard Component
 *
 * Protects routes by checking authentication state.
 * Automatically redirects based on configuration.
 *
 * Usage:
 * - Wrap protected pages with <AuthGuard requireAuth>
 * - Wrap pages that need passkey with <AuthGuard requirePasskey>
 */
export function AuthGuard({
  children,
  requireAuth = false,
  requirePasskey = false,
}: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const authState = getAuthState();

      // Check requirements
      if (requireAuth && !authState.isAuthenticated) {
        // Redirect to auth router
        const redirectUrl = `/auth?redirect=${encodeURIComponent(pathname)}`;
        router.push(redirectUrl);
        return;
      }

      if (requirePasskey && !authState.hasPasskey) {
        // Redirect to onboard
        router.push('/onboard');
        return;
      }

      // Authorized
      setIsAuthorized(true);
      setIsChecking(false);
    };

    checkAuth();
  }, [pathname, requireAuth, requirePasskey, router]);

  // Show loading state while checking
  if (isChecking) {
    return (
      <VeriAgentLoader
        variant="fullscreen"
        size="lg"
        text="Verifying Session"
        subtext="Authenticating your decentralized passkey credentials..."
        showProgress={true}
      />
    );
  }

  // Render children if authorized
  if (isAuthorized) {
    return <>{children}</>;
  }

  // Fallback (shouldn't reach here due to redirects)
  return null;
}
