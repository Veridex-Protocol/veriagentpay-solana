'use client';

import React from 'react';
import { Hash, Info, Star } from 'lucide-react';
import { PAYMENT } from '../../lib/payment';
import { Arrive, SavingsSuggestion, type FrameProps } from './shared';

/**
 * Slack-inspired chrome: aubergine workspace rail and channel header above a
 * light canvas: the only light frame in the set, which makes it readable at a
 * glance without its name. Replies land in a thread rather than the channel.
 */
export function SlackFrame({ view, typed, reducedMotion, payment = PAYMENT }: FrameProps) {
  return (
    <div className="va-frame" aria-hidden="true">
      <div className="va-frame__rail">
        <i />
        <i />
        <i />
      </div>

      <div className="va-frame__bar">
        <Hash className="va-frame__bar-icon" />
        <span className="va-frame__who">
          <b>weekend-plans</b>
          <span>5 members · 2 pinned</span>
        </span>
        <span className="va-frame__bar-actions">
          <Star />
          <Info />
        </span>
      </div>

      <div className="va-frame__thread">
        <div className="va-post">
          <span className="va-post__avatar">{payment.recipientInitials}</span>
          <div>
            <div className="va-post__head">
              <b>{payment.recipientName}</b>
              <time>12:41</time>
            </div>
            <div className="va-post__body">Lunch was perfect ✨</div>
          </div>
        </div>

        {view.showCommand && (
          <div className="va-post">
            <span className="va-post__avatar">JD</span>
            <div>
              <div className="va-post__head">
                <b>Jordan Diallo</b>
                <time>{payment.sentAt}</time>
              </div>
              <div className="va-post__body">
                <span className="va-code">/veriagent</span> {typed}
                {view.typing && <i className="va-caret" />}
              </div>
            </div>
          </div>
        )}
      </div>

      {view.received && (
        <Arrive className="va-frame__reply" reducedMotion={reducedMotion}>
          <div className="va-post">
            <span className="va-post__avatar">{payment.recipientInitials}</span>
            <div>
              <div className="va-post__head">
                <b>{payment.recipientName}</b>
                <time>{payment.receivedAt}</time>
              </div>
              <div className="va-post__body">{payment.received}! Thank you!</div>
              <div className="va-thread-note">1 reply · Last reply just now</div>
            </div>
          </div>
        </Arrive>
      )}

      {view.suggested && <SavingsSuggestion reducedMotion={reducedMotion} />}
    </div>
  );
}
