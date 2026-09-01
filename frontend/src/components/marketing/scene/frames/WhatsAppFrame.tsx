'use client';

import React from 'react';
import { ChevronLeft, MoreVertical, Video } from 'lucide-react';
import { PAYMENT } from '../../lib/payment';
import { Arrive, SavingsSuggestion, Ticks, type FrameProps } from './shared';

/**
 * WhatsApp-inspired chrome: deep green bar, asymmetric bubbles with tails, and
 * an original hairline chat pattern authored for this page rather than the
 * proprietary wallpaper. The receipt arrives as a quoted reply.
 */
export function WhatsAppFrame({ view, typed, reducedMotion, payment = PAYMENT }: FrameProps) {
  return (
    <div className="va-frame" aria-hidden="true">
      <div className="va-frame__pattern" />

      <div className="va-frame__bar">
        <ChevronLeft className="va-frame__bar-icon" />
        <span className="va-frame__avatar">{payment.recipientInitials}</span>
        <span className="va-frame__who">
          <b>{payment.recipientName}</b>
          <span>last seen today at 12:38</span>
        </span>
        <span className="va-frame__bar-actions">
          <Video />
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
            <div className="va-quote">
              <b>VeriAgent Pay</b>
              {payment.amount} {payment.asset} · secure payment
            </div>
            {payment.received}! Thank you!
            <span className="va-bubble__meta">{payment.receivedAt}</span>
          </div>
        </Arrive>
      )}

      {view.suggested && <SavingsSuggestion reducedMotion={reducedMotion} />}
    </div>
  );
}
