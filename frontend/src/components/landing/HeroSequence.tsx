'use client';

import React, { useEffect, useReducer, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, MessageCircle, RotateCcw, ShieldCheck } from 'lucide-react';
import {
  DiscordFrame,
  PaymentStage,
  PlatformTabs,
  PlatformType,
  SlackFrame,
  TelegramFrame,
  WhatsAppFrame,
} from './PlatformFrames';

const sequenceSteps: Array<[PaymentStage, number]> = [
  ['typing', 600],
  ['intent_parsed', 1500],
  ['reviewing', 2300],
  ['waiting_for_passkey', 3000],
  ['passkey_verified', 3500],
  ['transferring', 3900],
  ['received', 5000],
  ['savings_suggested', 5500],
];

const stageLabels: Record<PaymentStage, string> = {
  idle: 'Conversation ready',
  typing: 'Reading natural command',
  intent_parsed: 'Intent understood',
  reviewing: 'Review payload before approval',
  waiting_for_passkey: 'Touch ID / Passkey prompt',
  passkey_verified: 'Passkey signature verified',
  transferring: 'Transferring 20 USDT',
  received: 'Receipt confirmed',
  savings_suggested: 'Optional savings suggestion',
};

function paymentStageReducer(_: PaymentStage, next: PaymentStage): PaymentStage {
  return next;
}

export function HeroSequence() {
  const [platform, setPlatform] = useState<PlatformType>('Telegram');
  const [stage, dispatch] = useReducer(paymentStageReducer, 'idle');
  const [isVisible, setIsVisible] = useState(false);
  const [replayCount, setReplayCount] = useState(0);

  const reducedMotion = useReducedMotion();
  const heroProductRef = useRef<HTMLDivElement>(null);

  // Pause timeline when offscreen (< 25% visible)
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.intersectionRatio >= 0.25);
      },
      { threshold: [0.25] }
    );

    if (heroProductRef.current) {
      observer.observe(heroProductRef.current);
    }
    return () => observer.disconnect();
  }, []);

  // Motion story state machine execution
  useEffect(() => {
    if (reducedMotion) {
      dispatch('savings_suggested');
      return;
    }

    if (!isVisible) return;

    dispatch('idle');
    const timers = sequenceSteps.map(([nextStage, ms]) =>
      window.setTimeout(() => dispatch(nextStage), ms)
    );

    return () => {
      timers.forEach(window.clearTimeout);
    };
  }, [isVisible, replayCount, reducedMotion]);

  const handleSavingsClick = () => {
    const savingsEl = document.getElementById('savings');
    if (savingsEl) {
      savingsEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="vf-hero-section">
      <div className="vf-hero-container">
        {/* Left Copy Column */}
        <motion.div
          className="vf-hero-copy"
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="vf-eyebrow">
            <span className="vf-eyebrow-pulse" /> Passkey-secured social payments
          </div>

          <h1>
            Money that moves<br />like a message.
          </h1>

          <p className="vf-hero-lede">
            Send, save, and coordinate stablecoins through the conversations you already use without seed phrases or gas-fee friction.
          </p>

          <div className="vf-hero-actions">
            <Link href="/auth" className="vf-pill vf-pill-primary">
              Open VeriAgent Pay <ArrowRight size={18} />
            </Link>
            <a
              href="https://t.me/VeriAgentPayBot"
              target="_blank"
              rel="noopener noreferrer"
              className="vf-pill vf-pill-outline"
            >
              Try it in Telegram <MessageCircle size={18} />
            </a>
          </div>

          <div className="vf-reassurance">
            <ShieldCheck size={16} /> Self-custodial. Passkey-secured. No seed phrase.
          </div>
        </motion.div>

        {/* Right Interactive Product Demonstration */}
        <motion.div
          ref={heroProductRef}
          className="vf-hero-product"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <PlatformTabs current={platform} onChange={setPlatform} />

          <div
            id="platform-scene-panel"
            role="tabpanel"
            aria-labelledby={`${platform.toLowerCase()}-tab`}
            className="vf-scene-container"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={platform}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              >
                {platform === 'Telegram' && <TelegramFrame stage={stage} onSavingsClick={handleSavingsClick} />}
                {platform === 'WhatsApp' && <WhatsAppFrame stage={stage} onSavingsClick={handleSavingsClick} />}
                {platform === 'Discord' && <DiscordFrame stage={stage} onSavingsClick={handleSavingsClick} />}
                {platform === 'Slack' && <SlackFrame stage={stage} onSavingsClick={handleSavingsClick} />}
              </motion.div>
            </AnimatePresence>

            <div className="vf-hero-scene-footer">
              <span className="vf-stage-indicator" aria-live="polite">
                {stageLabels[stage]}
              </span>
              <button
                className="vf-replay-btn"
                aria-label="Replay hero payment sequence"
                onClick={() => setReplayCount(v => v + 1)}
              >
                <RotateCcw size={13} /> Replay story
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
