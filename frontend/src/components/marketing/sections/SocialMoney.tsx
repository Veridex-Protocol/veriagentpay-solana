'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Clock, Gift } from 'lucide-react';
import { useReducedMotion } from '../lib/hooks';
import { PlatformTabs, usePanelProps } from '../scene/PlatformTabs';

const SCENES = ['Split', 'Pool', 'Envelope'] as const;
type SceneName = (typeof SCENES)[number];

interface SocialScene {
  headline: string;
  copy: string;
  cta: { label: string; href: string };
  label: string;
  amount: string;
  progress: number;
  status: string;
  people: Array<{ initials: string; settled: boolean }>;
  bg: string;
  fg: string;
  accent: string;
  claims?: Array<{ name: string; value: string }>;
}

const DATA: Record<SceneName, SocialScene> = {
  Split: {
    headline: 'Share dinner without awkward group chats.',
    copy: 'Send one request into your group. Everyone pays their own share with one tap. You see live checkmarks as each friend pays.',
    cta: { label: 'Try bill splitting', href: '/splits' },
    label: 'Dinner with friends · 84 USDT',
    amount: '84 USDT',
    progress: 0.75,
    status: '3 of 4 friends paid',
    people: [
      { initials: 'MC', settled: true },
      { initials: 'TA', settled: true },
      { initials: 'JD', settled: true },
      { initials: 'RK', settled: false },
    ],
    bg: '#fbfbfa',
    fg: '#0f172a',
    accent: '#F2D827',
  },
  Pool: {
    headline: 'Save together for trips, gifts, and projects.',
    copy: 'Set a goal and share the link. Money gathers safely in the pool and unlocks only when your group reaches the target.',
    cta: { label: 'Create a group pool', href: '/pools' },
    label: 'Trip to Tokyo · 1,680 USDT',
    amount: '1,680 USDT',
    progress: 0.84,
    status: '84% of 2,000 USDT goal reached',
    people: [
      { initials: 'MC', settled: true },
      { initials: 'TA', settled: true },
      { initials: 'JD', settled: true },
      { initials: 'RK', settled: true },
      { initials: '+2', settled: true },
    ],
    bg: '#f8fafc',
    fg: '#0f172a',
    accent: '#F2D827',
  },
  Envelope: {
    headline: 'Send lucky money and gifts in chat.',
    copy: 'Drop a digital red envelope into any chat. Friends open it to claim lucky packets that go straight into their balance.',
    cta: { label: 'Send a red envelope', href: '/envelopes' },
    label: 'Lunar New Year envelope · 100 USDT',
    amount: '100 USDT',
    progress: 0.8,
    status: '4 of 5 envelopes opened',
    people: [
      { initials: 'MC', settled: true },
      { initials: 'TA', settled: true },
      { initials: 'JD', settled: true },
      { initials: 'RK', settled: true },
      { initials: 'SO', settled: false },
    ],
    bg: '#fffdf7',
    fg: '#0f172a',
    accent: '#F2D827',
    claims: [
      { name: 'Maya claimed', value: '24 USDT' },
      { name: 'Tomas claimed', value: '31 USDT' },
      { name: 'Jordan claimed', value: '18 USDT' },
    ],
  },
};

/**
 * Each tab replaces the whole scene: headline, explanation, action,
 * participants, progress, and the canvas colour that belongs to it.
 */
export function SocialMoney() {
  const [scene, setScene] = useState<SceneName>('Split');
  const reducedMotion = useReducedMotion();
  const panel = usePanelProps('va-social', scene);
  const data = DATA[scene];

  return (
    <section
      className="va-band va-band--light"
      id="social"
      data-tone="light"
      data-scrim="true"
      aria-labelledby="va-social-title"
    >
      <div className="va-wrap">
        <div className="va-heading-block">
          <p className="va-eyebrow">
            <i aria-hidden="true" />
            Built for social life
          </p>
          <h2 className="va-display-xl" id="va-social-title">
            Money is better together.
          </h2>
        </div>

        <div style={{ marginTop: 28 }}>
          <PlatformTabs
            values={SCENES}
            active={scene}
            onChange={setScene}
            label="Social features"
            idPrefix="va-social"
            variant="light"
            reducedMotion={reducedMotion}
          />
        </div>

        <div className="va-social" {...panel}>
          <motion.div
            key={`${scene}-copy`}
            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <h3 className="va-display-lg">{data.headline}</h3>
            <p className="va-lede">{data.copy}</p>
            <p className="va-actions">
              <Link className="va-textlink" href={data.cta.href}>
                {data.cta.label}
                <ArrowRight aria-hidden="true" />
              </Link>
            </p>
          </motion.div>

          <motion.div
            key={`${scene}-canvas`}
            className="va-social__canvas"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reducedMotion ? 0 : 0.55, ease: [0.16, 1, 0.3, 1] }}
            style={
              {
                ['--canvas-bg' as string]: data.bg,
                ['--canvas-fg' as string]: data.fg,
                ['--canvas-accent' as string]: data.accent,
              } as React.CSSProperties
            }
          >
            <p className="va-social__label">{data.label}</p>
            <p className="va-social__amount va-num">{data.amount}</p>

            <div className="va-social__people" aria-hidden="true">
              {data.people.map((person, index) => (
                <span key={`${person.initials}-${index}`} data-settled={person.settled}>
                  {person.initials}
                </span>
              ))}
            </div>

            {data.claims && (
              <div className="va-social__claims">
                {data.claims.map((claim) => (
                  <div key={claim.name}>
                    <span>
                      <Gift size={14} aria-hidden="true" /> {claim.name}
                    </span>
                    <b className="va-num">{claim.value}</b>
                  </div>
                ))}
              </div>
            )}

            <div className="va-social__meter">
              <i aria-hidden="true">
                <motion.b
                  initial={reducedMotion ? false : { scaleX: 0 }}
                  animate={{ scaleX: data.progress }}
                  transition={{ duration: reducedMotion ? 0 : 0.8, ease: [0.16, 1, 0.3, 1] }}
                  style={{ width: '100%' }}
                />
              </i>
              <p>
                {data.progress === 1 ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <Clock size={16} aria-hidden="true" />
                )}
                {data.status}
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
