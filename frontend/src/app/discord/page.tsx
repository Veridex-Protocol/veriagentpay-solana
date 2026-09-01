'use client';

// Fix: P1-9 Discord WebAuthn Fallback & Auth Handover Token
import React, { useState, useEffect } from 'react';
import { ShieldCheck, ExternalLink } from 'lucide-react';

export default function DiscordActivityPage() {
  const [isIframe, setIsIframe] = useState<boolean>(false);
  const [webAuthnSupported, setWebAuthnSupported] = useState<boolean>(true);
  const [_loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    setIsIframe(window.self !== window.top);

    if (typeof window !== 'undefined' && !window.PublicKeyCredential) {
      setWebAuthnSupported(false);
    }
  }, []);

  const handleOpenExternalBrowser = async () => {
    setLoading(true);
    try {
      // Do not manufacture a wallet or handover token in an embedded client.
      // The primary browser restores the user's HttpOnly session and prompts
      // for a passkey if it needs to establish one.
      window.open(`${window.location.origin}/dashboard?returnTo=discord`, '_blank');
    } catch (err) {
      window.open(window.location.origin + '/dashboard', '_blank');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="va-auth-shell px-5 py-10">
      <section className="va-auth-card w-full max-w-md p-6">
        <div className="mb-3 flex items-center gap-2.5">
          <ShieldCheck size={24} className="text-indigo-500" />
          <h1 className="text-lg font-semibold tracking-tight">Discord Activity | VeriAgent Pay</h1>
        </div>

        <p className="mb-5 text-sm text-[var(--va-app-muted)]">
          Secure social payment wallet embedded in Discord.
        </p>

        {!webAuthnSupported || isIframe ? (
          <div className="va-product-panel p-4">
            <h2 className="mb-2 text-sm font-semibold">WebAuthn iframe notice</h2>
            <p className="mb-4 text-sm text-[var(--va-app-muted)]">
              If your Discord client blocks biometric WebAuthn prompt inside embedded activity iframes, click below to authorize in your primary browser.
            </p>
            <button className="va-product-action va-product-action--primary w-full justify-center" onClick={handleOpenExternalBrowser}>
              Open in Secure Browser <ExternalLink size={16} />
            </button>
          </div>
        ) : (
          <div className="va-product-status p-3 text-center text-sm font-semibold">
            WebAuthn biometrics are active inside Discord.
          </div>
        )}
      </section>
    </main>
  );
}
