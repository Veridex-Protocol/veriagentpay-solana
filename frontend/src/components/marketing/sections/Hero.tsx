'use client';
import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, MessageCircle, QrCode, RotateCcw, ShieldCheck, Sparkles, X } from 'lucide-react';
import { PAYMENT_PRESETS, type PaymentPreset } from '../lib/payment';
import { useMeaningfullyVisible, usePaymentSequence, useReducedMotion } from '../lib/hooks';
import { TELEGRAM_URL } from '../lib/nav';
import {
  PLATFORMS,
  PLATFORM_NAMES,
  PlatformScene,
  sceneTranscript,
  type Platform,
} from '../scene/PlatformScene';
import { PlatformTabs, usePanelProps } from '../scene/PlatformTabs';

const EASE = [0.16, 1, 0.3, 1] as const;

function rise(delay: number, reduced: boolean) {
  return {
    initial: reduced ? false : { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduced ? 0 : 0.62, delay: reduced ? 0 : delay, ease: EASE },
  };
}

export function Hero() {
  const [platform, setPlatform] = useState<Platform>('telegram');
  const [preset, setPreset] = useState<PaymentPreset>(PAYMENT_PRESETS[0]);
  const [showQr, setShowQr] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const visible = useMeaningfullyVisible(stageRef, 0.25);
  const sequence = usePaymentSequence(visible, reducedMotion);
  const panel = usePanelProps('va-hero-platform', platform);

  const typed = preset.command.slice(
    0,
    Math.round(preset.command.length * sequence.typedRatio)
  );

  const handleSelectPreset = (p: PaymentPreset) => {
    setPreset(p);
    sequence.replay();
  };

  return (
    <section
      className="va-hero"
      data-tone="dark"
      data-scrim="false"
      data-platform={platform}
      aria-labelledby="va-hero-title"
    >
      <div className="va-hero__copy">
        <motion.div {...rise(0, reducedMotion)}>
          <Link
            href="/activate"
            className="va-chip"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 9999,
              border: '1px solid rgba(242, 216, 39, 0.35)',
              background: 'rgba(242, 216, 39, 0.1)',
              color: '#F2D827',
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 16,
              textDecoration: 'none',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#F2D827',
                boxShadow: '0 0 8px #F2D827',
              }}
            />
            <span>Solana Devnet · Passkey Payments</span>
            <ArrowRight size={12} style={{ marginLeft: 2 }} />
          </Link>
        </motion.div>

        <motion.h1 className="va-display-xxl" id="va-hero-title" {...rise(0.08, reducedMotion)}>
          Send cash in chat.
        </motion.h1>

        <motion.p className="va-lede" {...rise(0.16, reducedMotion)}>
          Send USDC from Telegram or the web through a self-custodial Solana passkey vault.
          No seed phrase, with sponsored transaction fees.
        </motion.p>

        <motion.div className="va-actions" {...rise(0.24, reducedMotion)}>
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
            Try in Telegram
            <MessageCircle aria-hidden="true" />
          </a>
          <button
            type="button"
            className="va-btn va-btn--quiet"
            onClick={() => setShowQr(true)}
            title="Scan QR code to test on mobile"
          >
            <QrCode aria-hidden="true" />
            Scan to test
          </button>
        </motion.div>

        <motion.p className="va-hero__reassure" {...rise(0.3, reducedMotion)}>
          <ShieldCheck aria-hidden="true" />
          Only you control your money. Protected by Face ID or fingerprint. No seed phrase.
        </motion.p>
      </div>

      <div className="va-hero__stage" ref={stageRef}>
        <div className="va-stage">
          <div className="va-stage__tabs">
            <PlatformTabs
              values={PLATFORMS}
              active={platform}
              onChange={setPlatform}
              label="Messaging platform"
              idPrefix="va-hero-platform"
              reducedMotion={reducedMotion}
              labelFor={(value) => PLATFORM_NAMES[value]}
            />
          </div>

          <div {...panel}>
            <PlatformScene
              platform={platform}
              view={sequence}
              typed={typed}
              payment={preset}
              reducedMotion={reducedMotion}
            />
            <p className="va-sr">{sceneTranscript(platform)}</p>
          </div>

          {/* Interactive Preset Scenario Selector */}
          <div className="va-hero__presets" aria-label="Simulate payment scenarios">
            <span className="va-hero__presets-label">
              <Sparkles size={12} aria-hidden="true" /> Try scenarios:
            </span>
            <div className="va-hero__presets-chips">
              {PAYMENT_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="va-chip"
                  data-active={p.id === preset.id}
                  onClick={() => handleSelectPreset(p)}
                >
                  {p.chipLabel}
                </button>
              ))}
            </div>
          </div>

          <div className="va-stage__status">
            <b>
              <i aria-hidden="true" />
              <span aria-live="polite">{sequence.status}</span>
            </b>
            <button type="button" className="va-replay" onClick={sequence.replay}>
              <RotateCcw aria-hidden="true" />
              Replay payment
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showQr && (
          <motion.div
            className="va-dialog__backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setShowQr(false);
            }}
          >
            <motion.div
              className="va-dialog"
              role="dialog"
              aria-modal="true"
              initial={reducedMotion ? false : { opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
              transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <button
                type="button"
                onClick={() => setShowQr(false)}
                aria-label="Close QR code dialog"
              >
                <X aria-hidden="true" />
              </button>

              <h2>Scan to test on your phone</h2>
              <p>
                Scan this QR code with your phone camera to launch the live Telegram bot instantly.
              </p>

              <img
                src="/telegram-qr.svg"
                alt="QR code to open Telegram bot"
                width={200}
                height={200}
                style={{ margin: '16px auto', display: 'block', borderRadius: 12 }}
              />

              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noreferrer"
                className="va-btn va-btn--ink va-btn--block"
              >
                Open in Telegram App
              </a>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
