'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { VeriAgentLoader } from '../../components/ui/VeriAgentLoader';

/**
 * Compatibility route for Telegram buttons issued before session-key setup
 * moved into the main application shell.
 *
 * Payment links keep their original behavior. Wallet and session-key links
 * now land on `/keys`, which uses AppLayout, the shared navigation, and the
 * current on-chain passkey grant flow.
 */
export default function TelegramMiniAppRedirect() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const to = params.get('to');
    const amount = params.get('amount');

    if ((action === 'pay' || action === 'claim') && (to || amount)) {
      const paymentParams = new URLSearchParams({
        action: 'claim',
        from: params.get('from') || '',
        to: to || '',
        amount: amount || '50',
        token: params.get('token') || 'USDT',
        platform: 'telegram',
      });
      router.replace(`/pay?${paymentParams.toString()}`);
      return;
    }

    router.replace(`/keys${params.size ? `?${params.toString()}` : ''}`);
  }, [router]);

  return (
    <VeriAgentLoader
      variant="fullscreen"
      size="md"
      text="Telegram Session"
      subtext="Routing to your secure wallet..."
      showProgress={true}
    />
  );
}

