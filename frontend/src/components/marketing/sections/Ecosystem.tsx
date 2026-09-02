'use client';

import React from 'react';
import Image from 'next/image';

interface EcosystemEntry {
  name: string;
  logo: string;
  alt: string;
  width?: number;
  height?: number;
  isWide?: boolean;
}

interface EcosystemGroup {
  label: string;
  items: EcosystemEntry[];
}

const GROUPS: EcosystemGroup[] = [
  {
    label: 'Fast settlement',
    items: [
      { name: 'Solana', logo: '/chains/solana.svg', alt: 'Solana Fast Settlement', width: 20, height: 18 },
    ],
  },
  {
    label: 'Supported currency',
    items: [
      { name: 'USDT', logo: '/chains/usdt.svg', alt: 'USDT 1:1 USD Tether Stablecoin', width: 18, height: 18 },
    ],
  },
  {
    label: 'Chat apps',
    items: [
      { name: 'Telegram', logo: '/chains/telegram.svg', alt: 'Telegram Messenger Bot', width: 18, height: 18 },
      { name: 'WhatsApp', logo: '/chains/whatsapp.svg', alt: 'WhatsApp Business Messaging', width: 18, height: 18 },
      { name: 'Discord', logo: '/chains/discord.svg', alt: 'Discord Social Gateway', width: 18, height: 18 },
      { name: 'Slack', logo: '/chains/slack.svg', alt: 'Slack Enterprise App', width: 18, height: 18 },
    ],
  },
  {
    label: 'Cryptographic proof',
    items: [
      { name: 'Veridex zkTLS', logo: '/chains/veridex.svg', alt: 'Veridex zkTLS Yield Attestation', isWide: true, width: 88, height: 20 },
    ],
  },
];

/** The plain statement of what this product is and what it runs on. */
export function Ecosystem() {
  return (
    <section className="va-eco" id="about" data-tone="light" aria-label="What VeriAgent Pay runs on">
      {GROUPS.map((group, groupIndex) => (
        <React.Fragment key={group.label}>
          {groupIndex > 0 && <i aria-hidden="true" className="va-eco__divider" />}
          <p className="va-eco__label">{group.label}</p>
          <div className="va-eco__items">
            {group.items.map((item) => (
              <div key={item.name} className="va-eco__chip" title={item.alt}>
                <div className="va-eco__icon-wrap">
                  <Image
                    src={item.logo}
                    alt={item.alt}
                    width={item.width || 20}
                    height={item.height || 20}
                    className={`va-eco__logo ${item.isWide ? 'va-eco__logo--wide' : ''}`}
                    unoptimized
                  />
                </div>
                {!item.isWide && <b className="va-eco__name">{item.name}</b>}
              </div>
            ))}
          </div>
        </React.Fragment>
      ))}
    </section>
  );
}
