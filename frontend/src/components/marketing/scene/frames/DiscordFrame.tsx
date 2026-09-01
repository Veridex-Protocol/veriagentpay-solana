'use client';

import React from 'react';
import { Bell, Hash, Users } from 'lucide-react';
import { PAYMENT } from '../../lib/payment';
import { Arrive, SavingsSuggestion, type FrameProps } from './shared';

/**
 * Discord-inspired chrome: charcoal channel surface behind a near-black server
 * rail, a channel header, and flat message stacks with avatar, display name,
 * and timestamp. The command reads as a bot mention rather than a chat bubble.
 */
export function DiscordFrame({ view, typed, reducedMotion, payment = PAYMENT }: FrameProps) {
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
          <span>5 members</span>
        </span>
        <span className="va-frame__bar-actions">
          <Bell />
          <Users />
        </span>
      </div>

      <div className="va-frame__thread">
        <div className="va-post">
          <span className="va-post__avatar">{payment.recipientInitials}</span>
          <div>
            <div className="va-post__head">
              <b>{payment.recipientHandle.replace('@', '')}</b>
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
                <b>jordan</b>
                <time>{payment.sentAt}</time>
              </div>
              <div className="va-post__body">
                <span className="va-code">@VeriAgent</span> {typed}
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
                <b>{payment.recipientHandle.replace('@', '')}</b>
                <time>{payment.receivedAt}</time>
              </div>
              <div className="va-post__body">{payment.received}! Thank you!</div>
            </div>
          </div>
        </Arrive>
      )}

      {view.suggested && <SavingsSuggestion reducedMotion={reducedMotion} />}
    </div>
  );
}
