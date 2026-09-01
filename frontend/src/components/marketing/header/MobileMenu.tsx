'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowUpRight, ChevronRight, X } from 'lucide-react';
import { MOBILE_GROUPS, TELEGRAM_URL } from '../lib/nav';
import { useFocusTrap, useRovingTabs, useScrollLock } from '../lib/hooks';
import { Wordmark } from './Wordmark';

/**
 * Mobile navigation is its own composition, not a collapsed desktop menu: a
 * full-height surface with a scrollable category rail, the selected group
 * revealed beneath it, and the primary action anchored above the safe area.
 */
export function MobileMenu({
  open,
  onClose,
  reducedMotion,
}: {
  open: boolean;
  onClose: () => void;
  reducedMotion: boolean;
}) {
  const [group, setGroup] = useState(MOBILE_GROUPS[0].id);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const ids = MOBILE_GROUPS.map((entry) => entry.id);

  useScrollLock(open);
  useFocusTrap(open, surfaceRef, onClose);

  const tabs = useRovingTabs(ids, group, setGroup, 'va-mobile');
  const active = MOBILE_GROUPS.find((entry) => entry.id === group) ?? MOBILE_GROUPS[0];

  return (
    <motion.div
      id="va-mobile-menu"
      className="va-mobile"
      ref={surfaceRef}
      role="dialog"
      aria-modal="true"
      aria-label="Site navigation"
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
      transition={{ duration: reducedMotion ? 0.01 : 0.34, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="va-mobile__top">
        <Wordmark className="va-brand" />
        <button type="button" onClick={onClose} aria-label="Close navigation">
          <X aria-hidden="true" />
        </button>
      </div>

      <div className="va-mobile__rail" role="tablist" aria-label="Navigation categories">
        {MOBILE_GROUPS.map((entry, index) => (
          <button key={entry.id} type="button" {...tabs.props(entry.id, index)}>
            {entry.label}
          </button>
        ))}
      </div>

      <div className="va-mobile__groups" {...tabs.panelProps}>
        <div className="va-mobile__group">
          <h3>{active.label}</h3>
          {active.links.map(({ label, href, blurb, external }) =>
            external ? (
              <a
                key={label}
                className="va-mobile__link"
                href={href}
                target="_blank"
                rel="noreferrer"
                onClick={onClose}
              >
                <span>
                  {label}
                  <small>{blurb}</small>
                </span>
                <ArrowUpRight aria-hidden="true" />
              </a>
            ) : (
              <Link key={label} className="va-mobile__link" href={href} onClick={onClose}>
                <span>
                  {label}
                  <small>{blurb}</small>
                </span>
                <ChevronRight aria-hidden="true" />
              </Link>
            )
          )}
        </div>
      </div>

      <div className="va-mobile__foot">
        <Link className="va-btn va-btn--white va-btn--block" href="/auth" onClick={onClose}>
          Open VeriAgent Pay
        </Link>
        <a
          className="va-btn va-btn--outline-dark va-btn--block"
          href={TELEGRAM_URL}
          target="_blank"
          rel="noreferrer"
          onClick={onClose}
        >
          Try it in Telegram
        </a>
        <Link className="va-btn va-btn--quiet va-btn--block" href="/login" onClick={onClose}>
          Log in
        </Link>
      </div>
    </motion.div>
  );
}
