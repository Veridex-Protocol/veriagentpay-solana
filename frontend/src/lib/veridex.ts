import { PasskeyManager } from '@veridex/sdk';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { useWalletStore } from '../store/useWalletStore';

const apiBase = process.env.NEXT_PUBLIC_API_URL || '';

async function postJSON(path: string, body: unknown, opts?: { anonymous?: boolean }) {
  // `anonymous` deliberately withholds any stored session. A claim recipient is
  // a different person from whoever last used this browser, and sending their
  // token would route registration onto that account instead of creating one
  // for the recipient.
  const token = !opts?.anonymous ? useWalletStore.getState().token : null;
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMsg =
      (typeof data?.message === 'string' ? data.message : Array.isArray(data?.message) ? data.message.join(', ') : '') ||
      data?.error ||
      `Passkey request failed (${response.status} ${response.statusText || 'Error'})`;
    throw new Error(errorMsg);
  }
  return data;
}

/**
 * Detect if running inside Telegram's in-app WebView (which has limited WebAuthn support)
 */
export function isTelegramWebView(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(
    (window as any).TelegramWebviewProxy ||
    (window as any).Telegram?.WebApp?.initData ||
    navigator.userAgent.includes('TelegramBot') ||
    document.querySelector('script[src*="telegram-web-app"]')
  );
}

/**
 * Check if WebAuthn/Passkey is supported in the current environment
 */
export function isWebAuthnSupported(): boolean {
  if (typeof window === 'undefined') return false;

  // Check for PublicKeyCredential support
  if (!window.PublicKeyCredential) {
    console.warn('[WebAuthn] PublicKeyCredential not available');
    return false;
  }

  // Check for navigator.credentials
  if (!navigator.credentials || !navigator.credentials.create) {
    console.warn('[WebAuthn] navigator.credentials not available');
    return false;
  }

  return true;
}

/**
 * Check if platform authenticator (Face ID, Touch ID, Windows Hello) is available
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;

  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return available;
  } catch (err) {
    console.warn('[WebAuthn] Error checking platform authenticator:', err);
    return false;
  }
}

export const passkeyManager = new PasskeyManager({
  rpName: 'VeriAgent Pay',
  // NEXT_PUBLIC_RP_ID first, and only then the serving host.
  //
  // A credential is scoped to the rpId it was created under, and registration
  // uses the *backend's* ceremony options, which carry RP_ID. On testnet that
  // is "testnet.veriagentpay.xyz" while the app is served from
  // "app.testnet.veriagentpay.xyz", so reading window.location.hostname here
  // asked the authenticator for a relying party no credential was ever
  // registered against. It returned nothing and the prompt failed with
  // NotAllowedError, which reads to the user as "passkey not found".
  //
  // The host stays as the fallback for local development, where
  // NEXT_PUBLIC_RP_ID is unset and origin and rpId coincide.
  rpId: process.env.NEXT_PUBLIC_RP_ID
    || (typeof window !== 'undefined'
      ? window.location.hostname
      : (process.env.NEXT_PUBLIC_APP_DOMAIN || 'localhost')),
  // Allow both platform and cross-platform authenticators for passkey sync
  authenticatorAttachment: undefined, // undefined = allow both platform and roaming authenticators
  userVerification: 'required',
  relayerUrl: process.env.NEXT_PUBLIC_API_URL || '',
});

/**
 * Stable, low-entropy device signature used solely to block self-referral
 * rings (one person referring themselves from the same device).
 *
 * Deliberately coarse: it combines only user agent, screen geometry and
 * platform, so it cannot single out an individual across sites.
 */
export function computeDeviceFingerprint(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const parts = [
      navigator.userAgent,
      `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`,
      navigator.platform || '',
      String(new Date().getTimezoneOffset()),
    ].join('|');

    // Non-cryptographic FNV-1a: collisions are acceptable here and the value
    // is never used for authentication.
    let hash = 0x811c9dc5;
    for (let i = 0; i < parts.length; i++) {
      hash ^= parts.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `fp_${hash.toString(16).padStart(8, '0')}`;
  } catch {
    return undefined;
  }
}

/**
 * Waits for the document to regain focus before a WebAuthn ceremony.
 *
 * Browsers refuse `navigator.credentials.*` from an unfocused document, and
 * the browser's own passkey UI is one of the things that takes focus away:
 * right after a credential is created, Chrome's "Passkey saved" bubble holds
 * it until dismissed. A synchronous `document.hasFocus()` check therefore fails
 * exactly when the user has just done everything right, and told them to click
 * the page and start over.
 *
 * Focus almost always comes back within a moment, so wait for it. If it does
 * not, the ceremony is attempted anyway: the browser is the authority on
 * whether it may run, and its refusal is translated into the same advice
 * further down. Waiting here never blocks a ceremony that would have worked.
 */
export async function awaitDocumentFocus(timeoutMs = 2500): Promise<boolean> {
  if (typeof document === 'undefined' || document.hasFocus()) return true;

  // A no-op in most browsers, but free, and it does work in a few.
  try {
    window.focus();
  } catch {
    /* not focusable from script here */
  }
  if (document.hasFocus()) return true;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (focused: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onFocus);
      clearInterval(poll);
      clearTimeout(timer);
      resolve(focused);
    };
    const onFocus = () => finish(true);

    window.addEventListener('focus', onFocus);
    // Dismissing a browser-chrome popover does not always fire `focus` on the
    // window, so poll as well rather than hanging until the timeout.
    const poll = setInterval(() => {
      if (document.hasFocus()) finish(true);
    }, 100);
    const timer = setTimeout(() => finish(false), timeoutMs);
  });
}

/**
 * Perform biometrics-backed hardware registration (WebAuthn / P-256)
 */
export async function registerBiometricPasskey(username: string, context?: {
  platform: 'telegram' | 'whatsapp' | 'slack' | 'discord' | 'web';
  platformId: string;
  chatId?: string;
  label?: string;
  expires?: string;
  sig?: string;
  claimCode?: string;
  /** Referral + campaign attribution carried through from the entry link. */
  referralCode?: string;
  src?: string;
  campaign?: string;
  partner?: string;
  channel?: string;
}) {
  // Check WebAuthn support
  if (!isWebAuthnSupported()) {
    throw new Error(
      'WebAuthn not supported in this environment. ' +
      'Please open this page in your device browser (Safari/Chrome) instead of the Telegram in-app browser.'
    );
  }

  // The ceremony does not pin authenticatorAttachment, so a roaming
  // authenticator (phone over QR, security key) is just as valid as Touch ID.
  // Probe the platform authenticator for error-message quality only: failing
  // the flow here would reject cross-device passkeys the server accepts.
  const hasPlatformAuth = await isPlatformAuthenticatorAvailable();

  // A claim code or signed onboarding link authorizes this registration on its
  // own; any session already in this browser belongs to someone else and must not
  // be presented.
  const anonymous = Boolean(context?.claimCode || (context?.sig && context?.expires));

  try {
    const ceremony = await postJSON(
      '/api/webauthn/registration/options',
      { ...context, username, deviceFingerprint: computeDeviceFingerprint() },
      { anonymous },
    );

    await awaitDocumentFocus();

    const response = await startRegistration(ceremony.options);
    const registrationResponse = await postJSON(
      '/api/webauthn/registration/verify',
      { challengeId: ceremony.challengeId, response },
      { anonymous },
    );

    const credential = passkeyManager.createCredentialFromPublicKey(
      registrationResponse.credentialId,
      BigInt(registrationResponse.publicKeyX),
      BigInt(registrationResponse.publicKeyY),
    );

    // Save credential to localStorage for future use
    passkeyManager.saveToLocalStorage();

    return {
      ...registrationResponse,
      credentialId: credential.credentialId,
      publicKeyX: credential.publicKeyX.toString(),
      publicKeyY: credential.publicKeyY.toString(),
      keyHash: credential.keyHash,
    };
  } catch (err: any) {
    // Provide specific error messages
    if (err.name === 'NotSupportedError') {
      throw new Error('WebAuthn not supported in this browser. Please use Safari, Chrome, or Edge.');
    }
    if (err.name === 'NotAllowedError') {
      const lostFocus = /focus/i.test(err.message || '') || /focus/i.test(err.cause?.message || '');
      if (lostFocus) {
        throw new Error(
          'The passkey prompt requires this page to be focused. Click the page, then try again.'
        );
      }

      // Without a platform authenticator this is usually a device capability
      // gap rather than a deliberate cancel, so point at the way out.
      throw new Error(
        hasPlatformAuth
          ? 'Biometric authentication was cancelled or denied.'
          : 'No biometric sensor is available on this device. Choose "Use a phone or tablet" '
            + 'in the passkey prompt to scan the QR code with your phone, or enable Touch ID / '
            + 'Windows Hello and try again.'
      );
    }
    if (err.name === 'InvalidStateError') {
      throw new Error('A passkey already exists for this account.');
    }

    throw new Error(err.message || 'Biometric authentication failed or was cancelled by user.');
  }
}

/**
 * Authenticate using a synced/discoverable passkey (cross-device login).
 * Uses WebAuthn discoverable credentials: the device shows all available
 * passkeys for this RP (synced via Google Password Manager, iCloud Keychain, etc).
 */
export async function authenticateWithPasskey() {
  try {
    const ceremony = await postJSON('/api/webauthn/authentication/options', {});
    console.log('[WebAuthn] Authentication options received, rpId expected:', ceremony.options?.rpId || 'not specified');
    await awaitDocumentFocus();
    const response = await startAuthentication(ceremony.options);
    const result = await postJSON('/api/webauthn/authentication/verify', {
      challengeId: ceremony.challengeId,
      response,
    });
    const credential = passkeyManager.createCredentialFromPublicKey(
      result.credential.credentialId,
      BigInt(result.credential.publicKeyX),
      BigInt(result.credential.publicKeyY),
    );

    // Save credential locally so future operations don't require re-auth
    passkeyManager.setCredential(credential);
    passkeyManager.saveToLocalStorage();

    return {
      credentialId: credential.credentialId,
      publicKeyX: credential.publicKeyX.toString(),
      publicKeyY: credential.publicKeyY.toString(),
      keyHash: credential.keyHash,
      accessToken: result.accessToken,
      walletAddress: result.walletAddress,
    };
  } catch (err: any) {
    console.error('Passkey authentication failed:', err);
    if (err.name === 'NotAllowedError' || err.message?.includes('timed out or was not allowed')) {
      const hostname = typeof window !== 'undefined' ? window.location.hostname : 'unknown';
      throw new Error(
        `Passkey not found for this site (${hostname}). ` +
        'Ensure your passkey was registered for this exact domain. ' +
        'If you registered on mobile, open this URL in Chrome/Safari (not an in-app browser) to access synced passkeys.'
      );
    }
    throw new Error(err.message || 'Passkey authentication failed or was cancelled by user.');
  }
}

/**
 * Sign UserOps using WebAuthn Passkey Assertion
 */
export async function signWithBiometrics(challenge: Uint8Array) {
  try {
    // First, try to load credential from localStorage if not already set
    if (!passkeyManager.getCredential()) {
      const loadedCredential = passkeyManager.loadFromLocalStorage();
      if (!loadedCredential) {
        console.log('[WebAuthn] No local credential found, attempting discoverable passkey authentication...');
        await authenticateWithPasskey();

        if (!passkeyManager.getCredential()) {
          throw new Error('No passkey found. Please complete onboarding first.');
        }
      }
    }

    const assertion = await passkeyManager.sign(challenge);
    return {
      authenticatorData: assertion.authenticatorData,
      clientDataJSON: assertion.clientDataJSON,
      challengeIndex: assertion.challengeIndex,
      typeIndex: assertion.typeIndex,
      r: assertion.r.toString(),
      s: assertion.s.toString(),
    };
  } catch (err: any) {
    console.error('Biometric signature failed:', err.message);
    throw new Error(err.message || 'Biometric authentication failed. Please verify your device supports passkeys and try again.');
  }
}

// `relayUserOperation` was removed. It took a `sessionPrivateKey` as a
// parameter, which put raw key material into the production JavaScript bundle
// and into the argument list of a function any future caller (or any
// fetch-intercepting extension) could reach. It had no callers.
//
// Session-key operations belong in `passkey-actions.ts`, which keeps the key
// server-side and authorizes with the user's passkey instead.
//
// @see docs/security-remediation-plan.md (FE-C-03)
