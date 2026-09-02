import './globals.css';
import React from 'react';
import type { Metadata } from 'next';
import { Providers } from './providers';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://veriagentpay.xyz';

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: 'VeriAgent Pay | Send Cash & Stablecoins in Chat with Zero Gas',
    template: '%s | VeriAgent Pay',
  },
  description:
    'Send USDC from Telegram and the web with Solana passkey vaults, zero seed phrases, and sponsored transaction fees.',
  keywords: [
    'social payments',
    'send USDC telegram',
    'send crypto in telegram',
    'gasless crypto wallet',
    'passkey crypto wallet',
    'WebAuthn crypto wallet',
    'Solana payments',
    'Solana passkey wallet',
    'USDC payments',
    'group money pools',
    'crypto red envelopes',
    'bill split stablecoins',
    'VeriAgent Pay',
  ],
  authors: [{ name: 'Veridex Protocol', url: 'https://veriagentpay.xyz' }],
  creator: 'Veridex Protocol',
  publisher: 'VeriAgent Pay',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'VeriAgent Pay | Send Cash & Stablecoins in Chat with Zero Gas',
    description:
      'Passkey-secured USDC payments on Solana with zero seed phrases and sponsored transaction fees.',
    url: baseUrl,
    siteName: 'VeriAgent Pay',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'VeriAgent Pay - Send Money in Chat with $0 Gas Fees',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VeriAgent Pay | Send Cash & Stablecoins in Chat with Zero Gas',
    description:
      'Passkey-secured USDC payments on Solana with zero seed phrases and sponsored transaction fees.',
    creator: '@veriagentpay',
    site: '@veriagentpay',
    images: ['/og.png'],
  },
  icons: {
    icon: '/favicon.ico',
  },
};

const jsonLdData = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'VeriAgent Pay',
    alternateName: 'Veridex VeriAgent Pay',
    url: 'https://veriagentpay.xyz',
    logo: `${baseUrl}/veriagent_logos/veriagent-mark.svg`,
    sameAs: [
      'https://x.com/veriagentpay',
      'https://t.me/VeriagentPay',
      'https://t.me/VeriAgentPayBot',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Support',
      url: 'https://t.me/VeriagentPay',
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'VeriAgent Pay',
    url: 'https://veriagentpay.xyz',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://veriagentpay.xyz/pay?recipient={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'VeriAgent Pay',
    operatingSystem: 'All (Web, iOS, Android, macOS, Windows, Linux)',
    applicationCategory: 'FinanceApplication',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    description:
      'Zero-gas social payment app for Telegram, WhatsApp, Discord, and Slack secured with biometric passkeys.',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is VeriAgent Pay?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'VeriAgent Pay is a self-custodial Solana payment app for sending and receiving USDC from the web and Telegram using natural language and passkeys.',
        },
      },
      {
        '@type': 'Question',
        name: 'Are there any gas fees?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No. VeriAgent Pay uses a dedicated Solana fee payer to sponsor supported USDC transactions.',
        },
      },
      {
        '@type': 'Question',
        name: 'How is my wallet secured?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'VeriAgent Pay uses WebAuthn P-256 biometric passkeys (Face ID, Touch ID, Android biometrics, Windows Hello). Your private biometric data never leaves your device; instead, an asymmetric cryptographic key pair proves your approval on-chain with zero seed phrases to remember.',
        },
      },
      {
        '@type': 'Question',
        name: 'Which blockchains and stablecoins are supported?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'This edition uses native Solana programs and devnet USDC. SOL is displayed as the vault network balance; USDC is the supported settlement asset.',
        },
      },
    ],
  },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Wallet/password browser extensions inject attributes and nodes into
  // <html>/<body> before React hydrates, which React reports as a hydration
  // mismatch. Suppressing here only silences that top-level attribute diff:
  // component trees are still hydration-checked normally.
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <meta name="color-scheme" content="dark light" />
        {/* Discovered in the initial HTML instead of after globals.css parses,
            so the display font is requested alongside the first paint. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Outfit:wght@400;500;600;700&display=swap"
        />
        {/* Runs before paint to prevent a flash of the wrong theme. A static
            file rather than dangerouslySetInnerHTML (see FE-H-04). */}
        <script src="/theme-init.js"></script>
        <link rel="manifest" href="/manifest.json" />
        <script src="https://telegram.org/js/telegram-web-app.js" async></script>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdData) }}
        />
      </head>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

