'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, QrCode, X } from 'lucide-react';
import { Wordmark } from './AdaptiveHeader';

export function FinalCTASection() {
  const [showQr, setShowQr] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus trap & Escape listener for QR modal dialog
  useEffect(() => {
    if (!showQr) return;

    // Focus close button initially
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowQr(false);
        triggerRef.current?.focus();
        return;
      }

      if (e.key !== 'Tab' || !dialogRef.current) return;

      const focusableItems = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      );

      if (focusableItems.length === 0) return;

      const first = focusableItems[0];
      const last = focusableItems[focusableItems.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showQr]);

  const dismissDialog = () => {
    setShowQr(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <section className="vf-final-section">
        <div className="vf-final-content">
          <p className="vf-kicker">Start with one message</p>
          <h2>Send your first payment in a conversation.</h2>
          <p>
            No seed phrase. No gas token. You stay in total control of your money and permissions.
          </p>

          <div className="vf-final-actions">
            <Link href="/auth" className="vf-pill vf-pill-primary">
              Open VeriAgent Pay <ArrowRight size={18} />
            </Link>
            <a
              href="https://t.me/VeriAgentPayBot"
              target="_blank"
              rel="noopener noreferrer"
              className="vf-pill vf-pill-outline"
            >
              Continue in Telegram
            </a>
            <button
              ref={triggerRef}
              className="vf-qr-trigger-btn"
              onClick={() => setShowQr(true)}
              aria-label="Show Telegram QR Code"
            >
              <QrCode size={18} /> Show QR
            </button>
          </div>
        </div>
      </section>

      {/* Accessible QR Dialog */}
      <AnimatePresence>
        {showQr && (
          <motion.div
            className="vf-dialog-backdrop"
            role="presentation"
            onMouseDown={e => e.target === e.currentTarget && dismissDialog()}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              ref={dialogRef}
              className="vf-qr-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="qr-dialog-title"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <button
                ref={closeButtonRef}
                className="vf-dialog-close-btn"
                aria-label="Close QR code dialog"
                onClick={dismissDialog}
              >
                <X size={20} />
              </button>

              <h3 id="qr-dialog-title">Continue in Telegram</h3>
              <p>Scan with your mobile phone camera to open @VeriAgentPayBot instantly.</p>

              <div className="vf-qr-code-wrapper">
                {/* Clean SVG QR Code Representation */}
                <svg viewBox="0 0 200 200" className="vf-qr-svg" aria-label="QR code for @VeriAgentPayBot">
                  <rect width="200" height="200" fill="#ffffff" rx="16" />
                  <path
                    d="M20 20h50v50H20V20zm10 10v30h30V30H30zm100-10h50v50h-50V20zm10 10v30h30V30h-30zM20 130h50v50H20v-50zm10 10v30h30v-30H30zm70-40h20v20h-20v-20zm30 0h20v20h-20v-20zm-30 30h20v20h-20v-20zm30 0h30v30h-30v-30zm-30 30h20v20h-20v-20zm50 0h20v20h-20v-20z"
                    fill="#0a0a0a"
                  />
                  <circle cx="100" cy="100" r="18" fill="#10b981" />
                </svg>
              </div>

              <a
                href="https://t.me/VeriAgentPayBot"
                target="_blank"
                rel="noopener noreferrer"
                className="vf-pill vf-pill-dark vf-dialog-direct-link"
              >
                Open @VeriAgentPayBot
              </a>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function EcosystemStrip() {
  return (
    <section id="integrations" className="vf-ecosystem-strip">
      <div className="vf-ecosystem-content">
        <span className="vf-strip-label">Supported Rails</span>
        <b>BOTChain</b>
        <b>Stellar</b>
        <i className="vf-divider" />
        <span className="vf-strip-label">Assets</span>
        <b>USDT</b>
        <i className="vf-divider" />
        <span className="vf-strip-label">Messaging</span>
        <b>Telegram</b>
        <b>WhatsApp</b>
        <b>Discord</b>
        <b>Slack</b>
        <i className="vf-divider" />
        <span className="vf-strip-label">Attestation</span>
        <b>Veridex zkTLS</b>
      </div>
    </section>
  );
}

export function SiteFooter() {
  const linkGroups = {
    Product: [
      ['Dashboard', '/dashboard'],
      ['Send & Request', '/send'],
      ['Payment Links', '/pay'],
      ['AI Savings (Soon)', '/vaults'],
    ],
    Social: [
      ['Group Pools', '/pools'],
      ['Bill Splits', '/splits'],
      ['Red Envelopes', '/envelopes'],
      ['Telegram Bot', 'https://t.me/VeriAgentPayBot'],
    ],
    Trust: [
      ['Security Settings', '/settings/security'],
      ['Privacy Policy', '/privacy'],
      ['Activity Ledger', '/activity'],
    ],
  };

  return (
    <footer className="vf-footer">
      <div className="vf-footer-grid">
        <div className="vf-footer-brand-col">
          <Wordmark />
          <p>Money that moves like a message.</p>
          <small>Supported networks: BOTChain · Stellar</small>
        </div>

        {Object.entries(linkGroups).map(([groupTitle, links]) => (
          <div key={groupTitle} className="vf-footer-col">
            <h3>{groupTitle}</h3>
            {links.map(([label, href]) => (
              <Link key={label} href={href}>
                {label}
              </Link>
            ))}
          </div>
        ))}
      </div>

      <div className="vf-disclosure-bar">
        <p>
          Stablecoins can lose value. Yield strategies involve risk, rate variability, and are not guaranteed. VeriAgent Pay is self-custodial software; always review transaction parameters before authorizing them with your passkey credential.
        </p>
      </div>
    </footer>
  );
}
