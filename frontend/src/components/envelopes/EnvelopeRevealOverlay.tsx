'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Gift, ArrowRight } from 'lucide-react';

export interface EnvelopeRevealOverlayProps {
  open: boolean;
  amount: number | string;
  token: string;
  /** Optional "pay it forward" call to action shown after the reveal. */
  payItForward?: {
    prompt: string;
    suggestedAmount: number;
    deepLink: string;
  } | null;
  onClose: () => void;
}

type Stage = 'sealed' | 'opening' | 'revealed';

/**
 * Three-beat reveal for a claimed Red Envelope:
 * sealed + shaking → burst → amount with confetti.
 *
 * The amount is already claimed on-chain before this renders; the animation is
 * purely presentational and can be skipped by tapping through.
 */
export const EnvelopeRevealOverlay: React.FC<EnvelopeRevealOverlayProps> = ({
  open,
  amount,
  token,
  payItForward,
  onClose,
}) => {
  const [stage, setStage] = useState<Stage>('sealed');
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  // Reset whenever the overlay is re-opened for a new claim.
  useEffect(() => {
    if (open) setStage('sealed');
  }, [open]);

  // Respect reduced-motion by jumping straight to the payoff.
  useEffect(() => {
    if (open && reduceMotion) setStage('revealed');
  }, [open, reduceMotion]);

  useEffect(() => {
    if (stage !== 'revealed') return;
    confetti({ particleCount: 140, spread: 90, origin: { y: 0.6 } });
  }, [stage]);

  const handleOpen = () => {
    if (stage !== 'sealed') return;
    setStage('opening');
    window.setTimeout(() => setStage('revealed'), 900);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 px-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Red envelope reveal"
        >
          <div className="w-full max-w-sm text-center">
            {stage !== 'revealed' && (
              <motion.button
                type="button"
                onClick={handleOpen}
                aria-label="Tap to open your red envelope"
                className="mx-auto flex h-56 w-44 flex-col items-center justify-center rounded-3xl border-2 border-amber-400/60 bg-gradient-to-b from-red-600 to-red-800 shadow-2xl"
                animate={
                  stage === 'sealed'
                    ? { rotate: [0, -3, 3, -3, 3, 0] }
                    : { scale: [1, 1.15, 0.2], opacity: [1, 1, 0] }
                }
                transition={
                  stage === 'sealed'
                    ? { duration: 0.6, repeat: Infinity, repeatDelay: 0.5 }
                    : { duration: 0.9, ease: 'easeIn' }
                }
              >
                <Gift className="h-14 w-14 text-amber-300" />
                <span className="mt-4 px-4 text-sm font-semibold text-amber-100">
                  Tap to open
                </span>
              </motion.button>
            )}

            {stage === 'revealed' && (
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 220, damping: 16 }}
                className="space-y-6"
              >
                <div>
                  <p className="text-sm font-medium uppercase tracking-wider text-amber-300">
                    You received
                  </p>
                  <p className="mt-2 text-5xl font-extrabold text-white">
                    {amount}{' '}
                    <span className="text-3xl font-bold text-amber-300">{token}</span>
                  </p>
                </div>

                {payItForward && (
                  <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
                    <p className="text-sm text-amber-100">{payItForward.prompt}</p>
                    <a
                      href={payItForward.deepLink}
                      className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-300"
                    >
                      <span>Create Your Own ({payItForward.suggestedAmount} {token})</span>
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </div>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800/60 hover:text-white"
                >
                  Done
                </button>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
