'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import type { NavLink } from '../lib/nav';

interface NavPanelProps {
  id: string;
  label: string;
  links: NavLink[];
  /** Horizontal offset of the trigger, so the panel reads as attached to it. */
  offset: number;
  onClose: () => void;
}

/**
 * A wide contextual panel anchored beneath the nav item that opened it. Focus
 * roves with the arrow keys; Escape and outside clicks are handled by the
 * header, which also restores focus to the trigger.
 */
export function NavPanel({ id, label, links, offset, onClose }: NavPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? []
    );
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLAnchorElement);

    const focus = (index: number) => {
      event.preventDefault();
      items[(index + items.length) % items.length].focus();
    };

    switch (event.key) {
      case 'ArrowDown':
        focus(current + 2);
        break;
      case 'ArrowUp':
        focus(current - 2);
        break;
      case 'ArrowRight':
        focus(current + 1);
        break;
      case 'ArrowLeft':
        focus(current - 1);
        break;
      case 'Home':
        focus(0);
        break;
      case 'End':
        focus(items.length - 1);
        break;
      default:
        break;
    }
  }, []);

  // Opening with a pointer should not steal focus; opening with a key should.
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    if (trigger?.dataset.keyboardOpened === 'true') {
      listRef.current?.querySelector<HTMLAnchorElement>('a[href]')?.focus();
    }
  }, []);

  return (
    <motion.div
      id={id}
      className="va-panel"
      style={{ ['--panel-x' as string]: `${offset}px` }}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <p className="va-panel__label">{label}</p>
      <div className="va-panel__grid" ref={listRef} onKeyDown={onKeyDown}>
        {links.map(({ label: name, href, blurb, icon: Icon, external }) => {
          const content = (
            <>
              <span className="va-panel__icon">
                <Icon aria-hidden="true" />
              </span>
              <span>
                <b>{name}</b>
                <span>{blurb}</span>
              </span>
            </>
          );

          return external ? (
            <a
              key={name}
              className="va-panel__item"
              href={href}
              target="_blank"
              rel="noreferrer"
              onClick={onClose}
            >
              {content}
            </a>
          ) : (
            <Link key={name} className="va-panel__item" href={href} onClick={onClose}>
              {content}
            </Link>
          );
        })}
      </div>
    </motion.div>
  );
}
