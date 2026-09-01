'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';

const socialScenes = {
  Split: {
    title: 'Dinner, settled without the group chat chase.',
    copy: 'Four friends, one clear request. Everyone sees what is paid and what is left in real time.',
    amount: '84.00 USDT',
    status: '3 of 4 paid',
    pct: '75%',
    actionLabel: 'Explore bill splits',
    href: '/splits',
    avatars: ['MC', 'TA', 'JL', 'AK'],
    paidCount: 3,
  },
  Pool: {
    title: 'Reach a shared goal, together.',
    copy: 'Contribute stablecoins, watch target progress grow, and set release conditions in plain language.',
    amount: '1,680.00 USDT',
    status: '84% funded',
    pct: '84%',
    actionLabel: 'Explore group pools',
    href: '/pools',
    avatars: ['MC', 'TA', 'JL', 'AK', 'VR'],
    paidCount: 5,
  },
  Envelope: {
    title: 'Turn a payment into a moment.',
    copy: 'Send a social money drop across Telegram or WhatsApp and let every claim resolve into a clear receipt.',
    amount: '100.00 USDT',
    status: '4 of 5 opened',
    pct: '80%',
    actionLabel: 'Explore red envelopes',
    href: '/envelopes',
    avatars: ['MC', 'TA', 'JL', 'AK', 'SF'],
    paidCount: 4,
  },
} as const;

type SocialSceneKey = keyof typeof socialScenes;

export function SocialMoneySection() {
  const [scene, setScene] = useState<SocialSceneKey>('Split');
  const data = socialScenes[scene];
  const sceneKeys = Object.keys(socialScenes) as SocialSceneKey[];

  const handleCelebrate = () => {
    confetti({
      particleCount: 60,
      spread: 70,
      origin: { y: 0.7 },
      colors: ['#eab308', '#facc15', '#ffffff'],
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setScene(sceneKeys[(index + 1) % sceneKeys.length]);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setScene(sceneKeys[(index - 1 + sceneKeys.length) % sceneKeys.length]);
    }
  };

  return (
    <section id="social" className="vf-light-band vf-social-section">
      <div className="vf-section-heading">
        <p className="vf-kicker">Money is social</p>
        <h2>More than sending.</h2>
        <p>Coordinate expenses, pooled goals, and celebratory gifts inside your chats.</p>
      </div>

      <div className="vf-social-layout">
        {/* Left Tabs & Content */}
        <div className="vf-social-info">
          <div className="vf-social-tabs" role="tablist" aria-label="Social payment features">
            {sceneKeys.map((s, idx) => (
              <button
                key={s}
                role="tab"
                id={`${s.toLowerCase()}-social-tab`}
                aria-selected={scene === s}
                aria-controls="social-feature-panel"
                tabIndex={scene === s ? 0 : -1}
                className={`vf-social-tab-btn ${scene === s ? 'active' : ''}`}
                onClick={() => setScene(s)}
                onKeyDown={e => handleKeyDown(e, idx)}
              >
                {s}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={scene}
              id="social-feature-panel"
              role="tabpanel"
              aria-labelledby={`${scene.toLowerCase()}-social-tab`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <h3>{data.title}</h3>
              <p>{data.copy}</p>

              <div className="vf-social-actions">
                <Link href={data.href} className="vf-text-link">
                  {data.actionLabel} <ArrowRight size={16} />
                </Link>
                <button className="vf-celebrate-btn" onClick={handleCelebrate}>
                  <Sparkles size={14} /> Celebrate completion
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right Interactive Product Card */}
        <div className="vf-social-card-wrapper">
          <motion.div
            key={scene}
            className="vf-social-card"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <div className="vf-social-avatars-row">
              {data.avatars.map((av, idx) => (
                <div
                  key={av}
                  className={`vf-avatar-circle ${idx < data.paidCount ? 'paid' : 'pending'}`}
                >
                  {av}
                  {idx < data.paidCount && <Check size={11} className="vf-avatar-check" />}
                </div>
              ))}
            </div>

            <div className="vf-social-meta">
              <span className="vf-social-badge">{scene} in progress</span>
              <b className="financial-number vf-social-amount">{data.amount}</b>
            </div>

            <div className="vf-progress-bar-track">
              <motion.div
                className="vf-progress-bar-fill"
                initial={{ width: 0 }}
                animate={{ width: data.pct }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>

            <div className="vf-social-status-row">
              <span className="vf-social-status-tag">
                <Check size={14} /> {data.status}
              </span>
              <small>Verified on BOTChain</small>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
