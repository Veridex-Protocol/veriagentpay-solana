'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import type { PaymentPreset, PaymentView } from '../../lib/payment';

export const FRAME_EASE = [0.16, 1, 0.3, 1] as const;

export interface FrameProps {
  view: PaymentView;
  /** The command as it is being typed into the composer. */
  typed: string;
  reducedMotion: boolean;
  payment?: PaymentPreset;
}

/** Delivered-and-read ticks, drawn rather than borrowed. */
export function Ticks({ read = true }: { read?: boolean }) {
  return (
    <svg viewBox="0 0 20 14" fill="none" aria-hidden="true">
      <path
        d="M1 7.6 4.4 11 11 3.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {read && (
        <path
          d="M8.4 7.6 11.8 11 18.4 3.2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/** Entrance used by every message that arrives mid-story. */
export function Arrive({
  children,
  reducedMotion,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  reducedMotion: boolean;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.36, delay: reducedMotion ? 0 : delay, ease: FRAME_EASE }}
    >
      {children}
    </motion.div>
  );
}

/** The quiet savings prompt. Identical wording in every platform. */
export function SavingsSuggestion({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <motion.div
      className="va-frame__suggest"
      aria-hidden="true"
      initial={reducedMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.4, ease: FRAME_EASE }}
    >
      <Sparkles />
      <span>Save this automatically?</span>
      <b>Not now</b>
    </motion.div>
  );
}
