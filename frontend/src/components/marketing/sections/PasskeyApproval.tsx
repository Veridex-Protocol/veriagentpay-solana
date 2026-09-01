'use client';

import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Fingerprint, ShieldCheck } from 'lucide-react';
import { viewFor } from '../lib/payment';
import { useReducedMotion } from '../lib/hooks';
import { PaymentObject } from '../scene/PaymentObject';
import { PasskeySheet } from '../scene/PasskeySheet';

const REVIEWED = viewFor('reviewing');
const APPROVED = viewFor('passkey_verified');

/**
 * The human moment. A light canvas, a large device, and a depiction of the
 * operating system's own passkey sheet. The Trust Lens quiets everything that
 * is not part of what you are authorizing.
 */
export function PasskeyApproval() {
  const [lens, setLens] = useState(false);
  const [approving, setApproving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const reducedMotion = useReducedMotion();

  const handleSimulateFaceId = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      setApproving(true);
    }, 900);
  };

  return (
    <section
      className="va-band va-band--light"
      id="passkeys"
      data-tone="light"
      aria-labelledby="va-approve-title"
    >
      <div className="va-wrap va-approve">
        <div>
          <p className="va-eyebrow">
            <i aria-hidden="true" />
            Biometric protection
          </p>
          <h2 className="va-display-xl" id="va-approve-title">
            Your face or fingerprint is your signature.
          </h2>
          <p className="va-lede">
            No 12-word seed phrases to write down on paper. No confusing browser extensions.
            Your secure key is created directly on your phone and stays inside your device's
            secure chip.
          </p>

          <div className="va-approve__lensbar">
            <button
              type="button"
              aria-pressed={lens}
              onClick={() => setLens((value) => !value)}
            >
              {lens ? 'Trust Lens on' : 'Tap to see what you are approving'}
            </button>
            <button
              type="button"
              className="va-btn--faceid"
              onClick={handleSimulateFaceId}
              disabled={isScanning}
            >
              <Fingerprint size={15} />
              {isScanning ? 'Scanning Face ID...' : 'Simulate Face ID'}
            </button>
            <button
              type="button"
              aria-pressed={approving}
              onClick={() => setApproving((value) => !value)}
            >
              {approving ? 'Hide phone screen' : 'Show phone screen'}
            </button>
          </div>

          <p className="va-caption" style={{ marginTop: 16, maxWidth: '52ch' }}>
            The Trust Lens dims everything extra so you see only the 5 things that matter:
            who gets it, how much, which currency, $0 fee, and your daily limit.
          </p>

          <p className="va-caption" style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <ShieldCheck size={15} aria-hidden="true" />
            Interactive preview only. Nothing on this page can move real funds.
          </p>
        </div>

        <div className="va-device">
          <span className="va-device__notch" aria-hidden="true" />

          {/* Biometric Scanning Line Overlay */}
          {isScanning && (
            <div className="va-device__scanner" aria-hidden="true">
              <span className="va-device__scan-bar" />
              <Fingerprint size={48} className="va-device__scan-icon" />
            </div>
          )}

          <div className="va-device__screen">
            <p className="va-device__app">
              <i aria-hidden="true">
                <Fingerprint />
              </i>
              VeriAgent Pay · Review
            </p>

            <PaymentObject
              view={approving ? APPROVED : REVIEWED}
              lens={lens}
              showActions={!approving}
              reducedMotion={reducedMotion}
            />

            <AnimatePresence>
              {approving && (
                <PasskeySheet key="sheet" verified reducedMotion={reducedMotion} />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
