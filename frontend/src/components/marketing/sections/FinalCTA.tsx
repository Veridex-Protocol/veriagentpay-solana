'use client';

import React, { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, Copy, QrCode, X } from 'lucide-react';
import { TELEGRAM_URL } from '../lib/nav';
import { useCopy, useFocusTrap, useReducedMotion, useScrollLock } from '../lib/hooks';

/** True-black closing band with an accessible QR dialog. */
export function FinalCTA() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const [copied, copy] = useCopy();

  const close = useCallback(() => setOpen(false), []);
  useScrollLock(open);
  useFocusTrap(open, dialogRef, close);

  return (
    <section className="va-final" data-tone="dark" aria-labelledby="va-final-title">
      <div className="va-final__inner">
        <p className="va-eyebrow">
          <i aria-hidden="true" />
          Ready in 30 seconds
        </p>
        <h2 id="va-final-title">
          Send money in your next message.
        </h2>
        <p className="va-lede">
          Zero seed phrases. $0 gas fees. Instant settlement right inside your chats.
        </p>

        <div className="va-actions">
          <Link href="/auth" className="va-btn va-btn--white">
            Open VeriAgent Pay
            <ArrowRight aria-hidden="true" />
          </Link>
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noreferrer"
            className="va-btn va-btn--outline-dark"
          >
            Open in Telegram
          </a>
          <button type="button" className="va-btn va-btn--quiet" onClick={() => setOpen(true)}>
            <QrCode aria-hidden="true" />
            Scan QR code
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="va-dialog__backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) close();
            }}
          >
            <motion.div
              className="va-dialog"
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="va-qr-title"
              aria-describedby="va-qr-desc"
              initial={reducedMotion ? false : { opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
              transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <button type="button" onClick={close} aria-label="Close QR code dialog">
                <X aria-hidden="true" />
              </button>

              <h2 id="va-qr-title">Open in Telegram</h2>
              <p id="va-qr-desc">
                Scan this QR code with your phone camera to start chatting with the
                VeriAgent Pay bot, or copy the link below.
              </p>

              <img
                src="/telegram-qr.svg"
                alt="QR code that opens the VeriAgent Pay bot on Telegram"
                width={212}
                height={212}
              />

              <a href={TELEGRAM_URL} target="_blank" rel="noreferrer" className="va-btn va-btn--ink va-btn--block">
                Open Telegram App
              </a>

              <button
                type="button"
                className="va-copy"
                data-copied={copied}
                onClick={() => copy(TELEGRAM_URL)}
                style={{ marginTop: 8 }}
              >
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied ? 'Copied!' : 'Copy bot link'}
              </button>
              <span className="va-sr" role="status">
                {copied ? 'Link copied to clipboard' : ''}
              </span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
