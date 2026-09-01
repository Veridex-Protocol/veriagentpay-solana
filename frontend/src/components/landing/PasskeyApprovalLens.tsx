'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Eye, Fingerprint, ShieldCheck, X } from 'lucide-react';

export function PasskeyApprovalLens() {
  const [showSheet, setShowSheet] = useState(false);
  const [lensMode, setLensMode] = useState(false);

  return (
    <section className={`vf-light-band vf-approval-section ${lensMode ? 'trust-lens-active' : ''}`}>
      <div className="vf-approval-container">
        {/* Left Explanation Column */}
        <div className="vf-approval-copy">
          <p className="vf-kicker">Human authorization</p>
          <h2>Your face, fingerprint, or security key is the signature.</h2>
          <p>
            Review the payment parameters first. Then approve it with a credential that never leaves your local hardware enclave.
          </p>

          <div className="vf-approval-actions">
            <button
              className="vf-pill vf-pill-dark"
              onClick={() => setShowSheet(true)}
            >
              Preview approval <Fingerprint size={18} />
            </button>
            <button
              className={`vf-lens-toggle-btn ${lensMode ? 'active' : ''}`}
              onClick={() => setLensMode(v => !v)}
              aria-pressed={lensMode}
            >
              <Eye size={16} /> {lensMode ? 'Disable Trust Lens' : 'Enable Trust Lens'}
            </button>
          </div>

          <p className="vf-lens-hint">
            {lensMode
              ? 'Trust Lens active: Non-critical metadata dimmed so verified parameters stand out.'
              : 'Toggle Trust Lens to see how VeriAgent Pay isolates verified transaction parameters.'}
          </p>
        </div>

        {/* Right Device Visual */}
        <div className="vf-approval-device-wrapper">
          <div className="vf-device-frame">
            <div className="vf-device-notch" />

            {/* Payment Review Card */}
            <div className="vf-device-review-card">
              <div className="vf-review-header">
                <span>Payment authorization review</span>
                <span className="vf-review-secure-tag">
                  <ShieldCheck size={13} /> P-256 Auth
                </span>
              </div>

              <h3 className="financial-number">20.00 USDT</h3>

              <dl className="vf-review-datalist">
                <div className="vf-review-item highlight">
                  <dt>Recipient</dt>
                  <dd>Ella Myo · @ella</dd>
                </div>
                <div className="vf-review-item highlight">
                  <dt>Network</dt>
                  <dd>BOTChain Mainnet</dd>
                </div>
                <div className="vf-review-item decorative">
                  <dt>Client ID</dt>
                  <dd>veridex-relayer-prod-09</dd>
                </div>
                <div className="vf-review-item highlight">
                  <dt>Relayer Fee</dt>
                  <dd className="vf-free-fee">$0.00 (Sponsored)</dd>
                </div>
                <div className="vf-review-item highlight">
                  <dt>Spending limit</dt>
                  <dd className="financial-number">100.00 USDT max</dd>
                </div>
                <div className="vf-review-item highlight">
                  <dt>Authorization scope</dt>
                  <dd>One-time transaction</dd>
                </div>
              </dl>
            </div>

            {/* Simulated OS Passkey Prompt Sheet Overlay */}
            <AnimatePresence>
              {showSheet && (
                <motion.div
                  className="vf-simulated-os-sheet"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Passkey authorization prompt"
                  initial={{ y: 60, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 40, opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                >
                  <button
                    className="vf-sheet-close-btn"
                    aria-label="Close passkey sheet"
                    onClick={() => setShowSheet(false)}
                  >
                    <X size={18} />
                  </button>

                  <div className="vf-sheet-fp-badge">
                    <Fingerprint size={38} />
                  </div>

                  <h3>Approve VeriAgent Pay</h3>
                  <p>Do you want to sign 20.00 USDT payment to @ella using Touch ID?</p>

                  <div className="vf-sheet-status">
                    <Check size={16} /> Biometric credential verified
                  </div>

                  <button
                    className="vf-pill vf-pill-dark vf-sheet-confirm-btn"
                    onClick={() => setShowSheet(false)}
                  >
                    Confirm with Passkey
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
