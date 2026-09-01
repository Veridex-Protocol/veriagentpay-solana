'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Check, Hash, Phone, Send } from 'lucide-react';
import { PAYMENT } from '../lib/payment';
import { useEnteredView, useReducedMotion, useRovingTabs } from '../lib/hooks';
import { PLATFORMS, PLATFORM_NAMES, type Platform } from '../scene/PlatformScene';

const PLATFORM_ICONS: Record<Platform, React.ComponentType<{ className?: string }>> = {
  telegram: Send,
  whatsapp: Phone,
  discord: Bot,
  slack: Hash,
};

/**
 * One account, four wrappers, one receipt that never moves. The cyan proof
 * line is measured from the live layout so it stays correct at every
 * breakpoint, and it draws exactly once per selection.
 */
export function IdentityContinuity() {
  const [active, setActive] = useState<Platform>('telegram');
  const [proofPath, setProofPath] = useState('');
  const stageRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<Platform, HTMLButtonElement>());
  const reducedMotion = useReducedMotion();
  const entered = useEnteredView(stageRef, 0.15);

  const tabs = useRovingTabs(PLATFORMS, active, setActive, 'va-identity');

  const measure = useCallback(() => {
    const stage = stageRef.current;
    const core = coreRef.current;
    const node = nodeRefs.current.get(active);
    if (!stage || !core || !node) return;

    const base = stage.getBoundingClientRect();
    const coreBox = core.getBoundingClientRect();
    const nodeBox = node.getBoundingClientRect();

    const x1 = coreBox.left + coreBox.width / 2 - base.left;
    const y1 = coreBox.top + coreBox.height / 2 - base.top;
    const x2 = nodeBox.left + nodeBox.width / 2 - base.left;
    const y2 = nodeBox.top + nodeBox.height / 2 - base.top;

    // Bow the line away from the straight path so it reads as a trace.
    const cx = (x1 + x2) / 2 + (y2 - y1) * 0.12;
    const cy = (y1 + y2) / 2 - (x2 - x1) * 0.12;

    setProofPath(`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`);
  }, [active]);

  useLayoutEffect(() => {
    measure();
  }, [measure, entered]);

  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, [measure]);

  return (
    <section className="va-identity" data-tone="dark" data-scrim="true" aria-labelledby="va-identity-title">
      <div className="va-wrap">
        <div className="va-heading-block">
          <p className="va-eyebrow">
            <i aria-hidden="true" />
            One wallet everywhere
          </p>
          <h2 className="va-display-xl" id="va-identity-title">
            One account across every chat app.
          </h2>
          <p className="va-lede">
            Your balance, transaction history, and receipts stay in sync whether you're
            on Telegram, WhatsApp, Discord, or Slack. Switch apps anytime: your money
            is always right there.
          </p>
        </div>

        <div className="va-identity__stage" ref={stageRef}>
          <div className="va-identity__orbit" aria-hidden="true">
            <i />
            <i />
          </div>

          <svg className="va-identity__proof" aria-hidden="true">
            {proofPath && entered && (
              <motion.path
                key={active}
                d={proofPath}
                initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: reducedMotion ? 0 : 0.7, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
          </svg>

          <div className="va-identity__core" ref={coreRef}>
            <span>Your Balance</span>
            <b className="va-num">$1,248.20</b>
            <small>Safe, self-custodial, and unlocked only by you</small>
          </div>

          <div className="va-identity__nodes" role="tablist" aria-label="Connected platforms" aria-orientation="vertical">
            {PLATFORMS.map((platform, index) => {
              const props = tabs.props(platform, index);
              const Icon = PLATFORM_ICONS[platform];
              return (
                <button
                  key={platform}
                  type="button"
                  className="va-identity__node"
                  {...props}
                  ref={(node) => {
                    props.ref(node);
                    if (node) nodeRefs.current.set(platform, node);
                    else nodeRefs.current.delete(platform);
                  }}
                >
                  <i aria-hidden="true">
                    <Icon />
                  </i>
                  <span>
                    <b>{PLATFORM_NAMES[platform]}</b>
                    <small>{platform === active ? 'Active now' : 'Connected'}</small>
                  </span>
                  {platform === active && <Check aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          <div className="va-identity__receipt" {...tabs.panelProps}>
            <i aria-hidden="true">
              <Check />
            </i>
            <span>
              <b>
                {PAYMENT.amount} {PAYMENT.asset} sent to {PAYMENT.recipientShort}
              </b>
              <small>Verified receipt, instantly visible in {PLATFORM_NAMES[active]}</small>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
