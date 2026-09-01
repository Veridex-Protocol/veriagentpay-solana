'use client';

import React, { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence } from 'framer-motion';
import { ChevronDown, Menu } from 'lucide-react';
import { BUSINESS_LINKS, PERSONAL_LINKS } from '../lib/nav';
import { useDismissable, useReducedMotion, useHeaderState } from '../lib/hooks';
import { Wordmark } from './Wordmark';
import { NavPanel } from './NavPanel';
import { MobileMenu } from './MobileMenu';

type PanelId = 'personal' | 'businesses' | null;

const PANELS = {
  personal: { label: 'Move money', links: PERSONAL_LINKS },
  businesses: { label: 'Get paid', links: BUSINESS_LINKS },
} as const;

/**
 * The header is transparent at rest and reads its foreground from whichever
 * section sits beneath it, so it never flashes between light and dark. It
 * translates out of the way on downward scroll and returns on the first
 * upward movement.
 */
export function SiteHeader() {
  const [panel, setPanel] = useState<PanelId>(null);
  const [offset, setOffset] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const { hidden, tone, scrim } = useHeaderState();

  const innerRef = useRef<HTMLDivElement>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const burgerRef = useRef<HTMLButtonElement>(null);

  const closePanel = useCallback(() => {
    if (!panel) return;
    const trigger = triggers.current.get(panel);
    setPanel(null);
    trigger?.focus();
  }, [panel]);

  useDismissable(panel !== null, innerRef, closePanel);

  const togglePanel = (id: Exclude<PanelId, null>, event: React.MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    const inner = innerRef.current;
    if (inner) {
      // Anchor the panel to the trigger so it feels attached to the nav.
      const left = button.getBoundingClientRect().left - inner.getBoundingClientRect().left;
      setOffset(Math.max(0, left - 14));
    }
    setPanel((current) => (current === id ? null : id));
  };

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
    burgerRef.current?.focus();
  }, []);

  const registerTrigger = (id: string) => (node: HTMLButtonElement | null) => {
    if (node) triggers.current.set(id, node);
    else triggers.current.delete(id);
  };

  return (
    <>
      <header
        className="va-header"
        data-tone={tone}
        data-hidden={hidden && !panel}
        data-scrim={scrim || panel !== null}
      >
        <div className="va-header__inner" ref={innerRef}>
          <Link href="/" className="va-brand" aria-label="VeriAgent Pay home">
            <Wordmark />
          </Link>

          <nav className="va-nav" aria-label="Primary">
            {(Object.keys(PANELS) as Array<Exclude<PanelId, null>>).map((id) => (
              <button
                key={id}
                type="button"
                className="va-nav__item"
                ref={registerTrigger(id)}
                aria-expanded={panel === id}
                aria-controls={`va-panel-${id}`}
                onClick={(event) => togglePanel(id, event)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' && panel !== id) {
                    event.currentTarget.dataset.keyboardOpened = 'true';
                  }
                }}
              >
                {id === 'personal' ? 'Personal' : 'Businesses'}
                <ChevronDown aria-hidden="true" />
              </button>
            ))}
            <Link className="va-nav__item" href="/keys">
              Developers
            </Link>
            <a className="va-nav__item" href="#security">
              Security
            </a>
            <a className="va-nav__item" href="#about">
              About
            </a>
          </nav>

          <div className="va-header__actions">
            <Link href="/login" className="va-header__login">
              Log in
            </Link>
            <Link href="/auth" className="va-btn va-btn--white">
              Open VeriAgent Pay
            </Link>
          </div>

          <button
            type="button"
            className="va-burger"
            ref={burgerRef}
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            aria-controls="va-mobile-menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu aria-hidden="true" />
          </button>

          <AnimatePresence>
            {panel && (
              <NavPanel
                key={panel}
                id={`va-panel-${panel}`}
                label={PANELS[panel].label}
                links={[...PANELS[panel].links]}
                offset={offset}
                onClose={() => setPanel(null)}
              />
            )}
          </AnimatePresence>
        </div>
      </header>

      <AnimatePresence>
        {mobileOpen && (
          <MobileMenu key="mobile" open={mobileOpen} onClose={closeMobile} reducedMotion={reducedMotion} />
        )}
      </AnimatePresence>
    </>
  );
}
