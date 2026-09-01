'use client';

import React from 'react';
import { ChevronLeft, MoreVertical, Phone } from 'lucide-react';
import { PAYMENT } from '../../lib/payment';
import { Arrive, SavingsSuggestion, Ticks, type FrameProps } from './shared';

/**
 * Telegram-inspired chrome: slate-blue bar over a cool dark canvas, circular
 * avatar with presence metadata, and tightly rounded bubbles with a single
 * clipped corner. All controls are drawn here, not copied.
 */
export function TelegramFrame({ view, typed, reducedMotion, payment = PAYMENT }: FrameProps) {
  return (
    <div className="va-frame" aria-hidden="true">
      <div className="va-frame__pattern" />

      <div className="va-frame__bar">
        <ChevronLeft className="va-frame__bar-icon" />
        <span className="va-frame__avatar">{payment.recipientInitials}</span>
        <span className="va-frame__who">
          <b>{payment.recipientName}</b>
          <span>online</span>
        </span>
        <span className="va-frame__bar-actions">
          <Phone />
          <MoreVertical />
        </span>
      </div>

      <div className="va-frame__thread">
        <div className="va-bubble">
          Lunch was perfect ✨
          <span className="va-bubble__meta">12:41</span>
        </div>

        {view.showCommand && (
          <div className="va-bubble va-bubble--out">
            {typed}
            {view.typing && <i className="va-caret" />}
            {!view.typing && (
              <span className="va-bubble__meta">
                {payment.sentAt}
                <Ticks />
              </span>
            )}
          </div>
        )}
      </div>

      {view.received && (
        <Arrive className="va-frame__reply" reducedMotion={reducedMotion}>
          <div className="va-bubble">
            {payment.received}! Thank you!
            <span className="va-bubble__meta">{payment.receivedAt}</span>
          </div>
        </Arrive>
      )}

      {view.suggested && <SavingsSuggestion reducedMotion={reducedMotion} />}
    </div>
  );
}
