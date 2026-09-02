import React from 'react';
import Link from 'next/link';
import { TELEGRAM_COMMUNITY_URL, TELEGRAM_URL, TWITTER_URL } from '../lib/nav';
import { Wordmark } from '../header/Wordmark';

const GROUPS: Array<{ title: string; links: Array<[string, string]> }> = [
  {
    title: 'Product',
    links: [
      ['Dashboard', '/dashboard'],
      ['Send Money', '/send'],
      ['Request Money', '/request'],
      ['Auto-Save (Soon)', '/vaults'],
    ],
  },
  {
    title: 'Social Features',
    links: [
      ['Group Pools', '/pools'],
      ['Bill Splits', '/splits'],
      ['Red Envelopes', '/envelopes'],
      ['Payment Links', '/pay'],
    ],
  },
  {
    title: 'Community & Socials',
    links: [
      ['Twitter / X (@veriagentpay)', TWITTER_URL],
      ['Telegram Community', TELEGRAM_COMMUNITY_URL],
      ['Telegram Bot', TELEGRAM_URL],
    ],
  },
  {
    title: 'Safety & Trust',
    links: [
      ['Security Settings', '/settings/security'],
      ['Activity Log', '/activity'],
      ['Privacy Policy', '/privacy'],
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="va-footer" data-tone="dark">
      <div className="va-footer__brand">
        <Link href="/" className="va-brand">
          <Wordmark />
        </Link>
        <p>Send cash in chat.</p>
        <small>Passkey-secured USDC settlement on Solana.</small>
      </div>

      {GROUPS.map((group) => (
        <nav key={group.title} className="va-footer__group" aria-labelledby={`va-foot-${group.title}`}>
          <h2 id={`va-foot-${group.title}`}>{group.title}</h2>
          {group.links.map(([label, href]) =>
            href.startsWith('http') ? (
              <a key={label} href={href} target="_blank" rel="noreferrer">
                {label}
              </a>
            ) : (
              <Link key={label} href={href}>
                {label}
              </Link>
            )
          )}
        </nav>
      ))}

      <p className="va-footer__legal">
        VeriAgent Pay is self-custodial software. Stablecoins are digital assets whose values
        can fluctuate. Auto-Save rates are variable, involve risk, and are not guaranteed.
        Always review transfer details before approving with Face ID or fingerprint.
      </p>
    </footer>
  );
}
