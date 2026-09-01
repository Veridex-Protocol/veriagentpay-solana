'use client';

import React, { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { MessageSquareText } from 'lucide-react';
import { PAYMENT, viewFor, type PaymentState } from '../lib/payment';
import { useReducedMotion } from '../lib/hooks';
import { PaymentObject } from '../scene/PaymentObject';
import { PasskeySheet } from '../scene/PasskeySheet';

const STEPS: Array<{ n: string; title: string; copy: string; state: PaymentState }> = [
  {
    n: '01',
    title: 'Say it',
    copy: 'Type what you want naturally, like "Send 20 USDT to Ella". The app reads your message and prepares the payment for you.',
    state: 'intent_parsed',
  },
  {
    n: '02',
    title: 'Review it',
    copy: 'See the exact amount, who gets it, and $0 fee before anything moves. Change any detail with a single tap.',
    state: 'reviewing',
  },
  {
    n: '03',
    title: 'Approve it',
    copy: 'Confirm with your face, fingerprint, or security key. Your biometric data never leaves your personal phone.',
    state: 'passkey_verified',
  },
  {
    n: '04',
    title: 'It arrives',
    copy: 'Money lands in seconds. Both you and your friend get an instant receipt right in your conversation.',
    state: 'received',
  },
];

/**
 * One sticky product canvas carries the whole explanation. The payment object
 * on screen is the same object from the hero; scrolling transforms it rather
 * than replacing it with four disconnected cards.
 */
export function IntentSteps() {
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start start', 'end end'],
  });

  useMotionValueEvent(scrollYProgress, 'change', (value) => {
    const next = Math.min(STEPS.length - 1, Math.max(0, Math.floor(value * STEPS.length)));
    setIndex((current) => (current === next ? current : next));
  });

  const select = useCallback(
    (next: number) => {
      setIndex(next);
      const track = trackRef.current;
      // Only steer the scroll position where the canvas is genuinely sticky.
      if (!track || window.innerWidth < 1024) return;
      const distance = track.offsetHeight - window.innerHeight;
      if (distance <= 0) return;
      window.scrollTo({
        top: track.offsetTop + ((next + 0.5) / STEPS.length) * distance,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    },
    [reducedMotion]
  );

  const step = STEPS[index];
  const view = viewFor(step.state);

  return (
    <section
      className="va-steps"
      id="how-it-works"
      data-tone="light"
      data-scrim="true"
      aria-labelledby="va-steps-title"
    >
      <div className="va-steps__track" ref={trackRef}>
        <div className="va-steps__sticky">
          <div>
            <p className="va-eyebrow">
              <i aria-hidden="true" />
              Easy as 1-2-3-4
            </p>
            <h2 className="va-display-xl" id="va-steps-title">
              Every payment follows the same simple path.
            </h2>

            <ol className="va-steps__list">
              {STEPS.map((entry, i) => (
                <li key={entry.n}>
                  <button
                    type="button"
                    className="va-steps__button"
                    aria-current={i === index}
                    onClick={() => select(i)}
                  >
                    <span className="va-num">{entry.n}</span>
                    <span>
                      <b>{entry.title}</b>
                      <p>{entry.copy}</p>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>

          <div className="va-steps__canvas">
            <div className="va-steps__object">
              <AnimatePresence initial={false} mode="wait">
                <motion.p
                  key={index === 0 ? 'command' : 'stage'}
                  className="va-steps__command"
                  initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reducedMotion ? 0 : 0.26 }}
                >
                  <MessageSquareText aria-hidden="true" />
                  {index === 0 ? `“${PAYMENT.command}”` : view.status}
                </motion.p>
              </AnimatePresence>

              <PaymentObject
                view={view}
                showActions={index < 2}
                reducedMotion={reducedMotion}
              />
            </div>

            <AnimatePresence>
              {index === 2 && (
                <PasskeySheet key="sheet" verified reducedMotion={reducedMotion} />
              )}
            </AnimatePresence>

            <div className="va-steps__progress" aria-hidden="true">
              {STEPS.map((entry, i) => (
                <i key={entry.n} data-on={i <= index} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
