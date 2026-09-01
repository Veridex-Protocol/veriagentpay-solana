'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Check, Fingerprint } from 'lucide-react';
import { PAYMENT } from '../lib/payment';

/**
 * A depiction of the operating system's passkey sheet. It rises above the
 * conversation rather than inside it, because on a real device the approval
 * belongs to the platform authenticator and not to the messaging app.
 *
 * This never calls WebAuthn. The real credential flow lives in
 * `hooks/usePasskey.ts` and is untouched by the marketing page.
 */
export function PasskeySheet({
  verified,
  reducedMotion = false,
}: {
  verified: boolean;
  reducedMotion?: boolean;
}) {
  return (
    <motion.div
      className="va-sheet"
      data-verified={verified}
      aria-hidden="true"
      initial={reducedMotion ? false : { y: '100%' }}
      animate={{ y: 0 }}
      exit={reducedMotion ? undefined : { y: '100%' }}
      transition={{ duration: reducedMotion ? 0 : 0.42, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="va-sheet__grab" />
      <div className="va-sheet__glyph">
        {verified ? <Check /> : <Fingerprint />}
      </div>
      <h4>{verified ? 'Approved' : 'Use your passkey'}</h4>
      <p>
        {verified
          ? `Signed on this device for ${PAYMENT.amount} ${PAYMENT.asset} to ${PAYMENT.recipientShort}.`
          : `Confirm to send ${PAYMENT.amount} ${PAYMENT.asset} to ${PAYMENT.recipientShort}. Your biometric never leaves this device.`}
      </p>
      <div className="va-sheet__buttons">
        <span>Cancel</span>
        <span>{verified ? 'Done' : 'Continue'}</span>
      </div>
    </motion.div>
  );
}
