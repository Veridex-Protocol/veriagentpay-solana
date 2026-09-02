import React from 'react';
import type { Metadata } from 'next';
import { MarketingPage } from '../components/marketing/MarketingPage';

export const metadata: Metadata = {
  title: 'VeriAgent Pay | Send Cash & Stablecoins in Chat with Zero Gas',
  description:
    'Send USDC from Telegram and the web using Solana passkey vaults, with no seed phrase and sponsored transaction fees.',
  openGraph: {
    title: 'VeriAgent Pay | Send Cash & Stablecoins in Chat with Zero Gas',
    description:
      'Passkey-secured social payments across Telegram, WhatsApp, Discord, and Slack. Every payment is reviewed before it is approved.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VeriAgent Pay | Send Cash & Stablecoins in Chat with Zero Gas',
    description:
      'Send, split, and save stablecoins inside Telegram, WhatsApp, Discord, and Slack. No seed phrases, $0 gas fees.',
    site: '@veriagentpay',
    creator: '@veriagentpay',
  },
};

export default function LandingPage() {
  return <MarketingPage />;
}

