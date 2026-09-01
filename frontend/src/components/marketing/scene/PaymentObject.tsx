'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ShieldCheck } from 'lucide-react';
import { PAYMENT, type PaymentPreset, type PaymentView } from '../lib/payment';

const EASE = [0.16, 1, 0.3, 1] as const;

const STEP_LABELS = ['Intent', 'Review', 'Passkey', 'Receipt'] as const;

export interface PaymentRow {
  key: string;
  label: string;
  value: string;
  /** Rows without this stay dim under the Trust Lens. */
  authorized?: boolean;
}

export function getReviewRows(p: PaymentPreset = PAYMENT): PaymentRow[] {
  return [
    { key: 'network', label: 'Network', value: p.network, authorized: true },
    { key: 'fee', label: 'Network fee', value: `${p.fee} · sponsored`, authorized: true },
    { key: 'limit', label: 'Spending limit', value: p.limit, authorized: true },
    { key: 'scope', label: 'Authorization', value: p.authorization, authorized: true },
    { key: 'session', label: 'Signing key', value: 'Device passkey' },
  ];
}

export const REVIEW_ROWS: PaymentRow[] = getReviewRows(PAYMENT);

interface PaymentObjectProps {
  view: PaymentView;
  payment?: PaymentPreset;
  /** Dims decorative data so the authorized facts read first. */
  lens?: boolean;
  /** The simulated inline action row belongs to conversation scenes only. */
  showActions?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

/**
 * The one financial object in the page. It is rendered once by the scene and
 * is never unmounted when the surrounding platform changes, so the recipient,
 * amount, status, and receipt survive every switch.
 */
export function PaymentObject({
  view,
  payment = PAYMENT,
  lens = false,
  showActions = true,
  reducedMotion = false,
  className,
}: PaymentObjectProps) {
  const duration = reducedMotion ? 0 : 0.42;
  const rows = React.useMemo(() => getReviewRows(payment), [payment]);

  return (
    <div className={className ? `va-pay ${className}` : 'va-pay'} data-lens={lens}>
      <div className="va-pay__head">
        <ShieldCheck aria-hidden="true" />
        VeriAgent Pay
        <span>{view.received ? 'Receipt' : 'Payment review'}</span>
      </div>

      {/* Amount above recipient rather than beside it: the pair has to stay on
          one line each at every scene width, including the 328px mobile card. */}
      <div className="va-pay__amount">
        <b className="va-num">
          {payment.amount} {payment.asset}
        </b>
        <p className="va-pay__to">
          <span>To {payment.recipientName}</span>
          <Check aria-hidden="true" />
          <span>{payment.recipientHandle} · verified</span>
        </p>
      </div>

      <AnimatePresence initial={false}>
        {view.showReview && (
          <motion.dl
            className="va-pay__rows"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration, ease: EASE }}
          >
            {rows.map((row) => (
              <div key={row.key} data-key={row.authorized ? row.key : undefined}>
                <dt>{row.label}</dt>
                <dd className={row.key === 'fee' ? 'va-num' : undefined}>{row.value}</dd>
              </div>
            ))}
          </motion.dl>
        )}
      </AnimatePresence>

      <div className="va-pay__rail" aria-hidden="true">
        {view.marks.map((on, index) => (
          <i key={STEP_LABELS[index]} data-on={on} />
        ))}
      </div>
      <div className="va-pay__steps" aria-hidden="true">
        {STEP_LABELS.map((label, index) => (
          <span key={label} data-on={view.marks[index]}>
            {label}
          </span>
        ))}
      </div>

      {showActions && !view.verified && (
        <div className="va-pay__actions" aria-hidden="true">
          <span>Approve with passkey</span>
          <span>Edit</span>
        </div>
      )}

      <AnimatePresence initial={false}>
        {view.transferring && (
          <motion.div
            key="pending"
            className="va-pay__pending"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration, ease: EASE }}
          >
            <i aria-hidden="true" />
            Submitting to {payment.network}
          </motion.div>
        )}

        {view.received && (
          <motion.div
            key="receipt"
            className="va-pay__receipt"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration, ease: EASE }}
          >
            <span className="va-pay__trace">
              <VerificationTrace reducedMotion={reducedMotion} />
            </span>
            <span>
              <b>{payment.received}</b>
              <small className="va-num">Reference {payment.reference}</small>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** One cyan trace, drawn once. It never pulses and never repeats. */
export function VerificationTrace({ reducedMotion = false }: { reducedMotion?: boolean }) {
  return (
    <svg viewBox="0 0 30 30" fill="none" aria-hidden="true">
      <motion.circle
        cx="15"
        cy="15"
        r="10.5"
        stroke="currentColor"
        strokeWidth="1.5"
        initial={reducedMotion ? false : { pathLength: 0, opacity: 0.4 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: reducedMotion ? 0 : 0.5, ease: 'easeOut' }}
      />
      <motion.path
        d="M10.5 15.2 13.7 18.4 19.6 12"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reducedMotion ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reducedMotion ? 0 : 0.34, delay: reducedMotion ? 0 : 0.3, ease: 'easeOut' }}
      />
    </svg>
  );
}
