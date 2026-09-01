import React from 'react';
import { OfficialWordmark } from '../../ui/OfficialBrand';

/**
 * Official VeriAgent Pay wordmark.
 * Uses the canonical Volt Yellow (#F2D827) & Carbon Black (#070A11) logo signature.
 */
export function Wordmark({ className }: { className?: string }) {
  return <OfficialWordmark className={className} width={174} />;
}
