'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useRovingTabs } from '../lib/hooks';

interface PlatformTabsProps<T extends string> {
  values: readonly T[];
  active: T;
  onChange: (value: T) => void;
  label: string;
  idPrefix: string;
  variant?: 'dark' | 'light';
  reducedMotion?: boolean;
  labelFor?: (value: T) => string;
}

/**
 * A tablist whose selection pill travels between tabs. Click, Enter, Space,
 * arrow keys, Home, and End all move selection; the panel id is wired through
 * `aria-controls` so the relationship survives screen-reader navigation.
 */
export function PlatformTabs<T extends string>({
  values,
  active,
  onChange,
  label,
  idPrefix,
  variant = 'dark',
  reducedMotion = false,
  labelFor,
}: PlatformTabsProps<T>) {
  const tabs = useRovingTabs(values, active, onChange, idPrefix);

  return (
    <div
      className={variant === 'light' ? 'va-tabs va-tabs--light' : 'va-tabs'}
      role="tablist"
      aria-label={label}
    >
      {values.map((value, index) => (
        <button key={value} type="button" {...tabs.props(value, index)}>
          {value === active && (
            <motion.span
              className="va-tabs__pill"
              layoutId={`${idPrefix}-pill`}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 420, damping: 38, mass: 0.7 }
              }
            />
          )}
          {labelFor ? labelFor(value) : value}
        </button>
      ))}
    </div>
  );
}

/** Panel props for the element the tablist controls. */
export function usePanelProps(idPrefix: string, active: string) {
  return {
    role: 'tabpanel' as const,
    id: `${idPrefix}-panel`,
    'aria-labelledby': `${idPrefix}-tab-${active}`,
    tabIndex: 0,
  };
}
