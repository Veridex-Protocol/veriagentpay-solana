/**
 * Authentication utilities for VeriAgent Pay
 * Handles JWT tokens, passkey detection, and authentication state
 */
import { useWalletStore } from '../store/useWalletStore';

export interface AuthState {
  isAuthenticated: boolean;
  hasPasskey: boolean;
  hasValidToken: boolean;
  walletAddress: string | null;
  userId: string | null;
}

/**
 * Check if JWT token is valid and not expired
 */
export function isTokenValid(token: string | null): boolean {
  if (!token) return false;

  try {
    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    // Decode payload (base64url)
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    );

    // Check expiration
    if (!payload.exp) return false;

    const now = Math.floor(Date.now() / 1000);
    return payload.exp > now;
  } catch (err) {
    console.warn('[Auth] Token validation failed:', err);
    return false;
  }
}

/**
 * Check if user has a registered passkey
 */
/**
 * Whether this device has completed passkey onboarding.
 *
 * A *UI hint only*: it decides which screen to show first, never whether an
 * action is permitted. Both values it reads are user-writable, so treating it
 * as authentication state meant anyone could set a localStorage key and be
 * rendered as onboarded. Authorisation lives on the server, which verifies the
 * WebAuthn assertion; the honest name for this is "probably onboarded".
 *
 * @see docs/security-remediation-plan.md (FE-H-06)
 */
export function hasLikelyOnboardedOnThisDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const passkeyFlag = localStorage.getItem('veriagent_passkey_registered');
  if (passkeyFlag === 'true') return true;

  const walletAddress = localStorage.getItem('veriagent_wallet_address');
  return !!walletAddress;
}

/** @deprecated Renamed to {@link hasLikelyOnboardedOnThisDevice}. */
export const hasRegisteredPasskey = hasLikelyOnboardedOnThisDevice;

/**
 * Get current authentication state
 */
export function getAuthState(): AuthState {
  if (typeof window === 'undefined') {
    return {
      isAuthenticated: false,
      hasPasskey: false,
      hasValidToken: false,
      walletAddress: null,
      userId: null,
    };
  }

  const token = useWalletStore.getState().token;
  const hasValidToken = isTokenValid(token);
  const hasPasskey = hasRegisteredPasskey();
  const walletAddress = localStorage.getItem('veriagent_wallet_address');

  // Extract userId from token if valid
  let userId: string | null = null;
  if (hasValidToken && token) {
    try {
      const payload = JSON.parse(
        atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
      );
      userId = payload.userId || null;
    } catch (err) {
      console.warn('[Auth] Failed to extract userId from token');
    }
  }

  return {
    isAuthenticated: hasValidToken && hasPasskey,
    hasPasskey,
    hasValidToken,
    walletAddress,
    userId,
  };
}

/**
 * Clear authentication state (logout)
 */
export function clearAuth(): void {
  if (typeof window === 'undefined') return;

  useWalletStore.getState().setToken(null);
  localStorage.removeItem('veriagent_wallet_address');
  localStorage.removeItem('veriagent_passkey_registered');
}

/**
 * Determine where to redirect user based on auth state
 */
export function getAuthRedirectPath(state?: AuthState): string {
  const authState = state || getAuthState();

  // Fully authenticated → dashboard
  if (authState.isAuthenticated) {
    return '/dashboard';
  }

  // Has passkey but expired token → login
  if (authState.hasPasskey && !authState.hasValidToken) {
    return '/login';
  }

  // No passkey → onboard
  return '/onboard';
}

/**
 * Check authentication and redirect if needed
 * Returns true if user is authenticated, false otherwise
 */
export function requireAuth(): boolean {
  const state = getAuthState();

  if (!state.isAuthenticated) {
    // Clear expired/invalid tokens
    if (!state.hasValidToken) useWalletStore.getState().setToken(null);
    return false;
  }

  return true;
}

/**
 * Refresh authentication state from API
 */
export async function refreshAuthState(): Promise<AuthState> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
  const token = useWalletStore.getState().token;

  if (!token || !isTokenValid(token)) {
    return getAuthState();
  }

  try {
    // Verify token with backend
    const response = await fetch(`${apiBase}/api/auth/verify`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      // Token invalid or expired
      clearAuth();
      return getAuthState();
    }

    const data = await response.json();

    // Update localStorage with fresh data
    if (data.walletAddress) {
      localStorage.setItem('veriagent_wallet_address', data.walletAddress);
    }

    return getAuthState();
  } catch (err) {
    console.error('[Auth] Failed to refresh auth state:', err);
    return getAuthState();
  }
}
