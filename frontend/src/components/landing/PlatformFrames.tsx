'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  CircleDollarSign,
  Compass,
  CornerDownRight,
  Fingerprint,
  Hash,
  MessageSquare,
  MoreVertical,
  Phone,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

export type PlatformType = 'Telegram' | 'WhatsApp' | 'Discord' | 'Slack';
export type PaymentStage =
  | 'idle'
  | 'typing'
  | 'intent_parsed'
  | 'reviewing'
  | 'waiting_for_passkey'
  | 'passkey_verified'
  | 'transferring'
  | 'received'
  | 'savings_suggested';

export interface PaymentSceneProps {
  platform: PlatformType;
  stage: PaymentStage;
  onSavingsClick?: () => void;
}

// Shared Payment Object that stays stable across platforms
export function SharedPaymentObject({
  stage,
  platform,
  onSavingsClick,
}: {
  stage: PaymentStage;
  platform: PlatformType;
  onSavingsClick?: () => void;
}) {
  const showReview = !['idle', 'typing', 'intent_parsed'].includes(stage);
  const showPasskey = ['waiting_for_passkey', 'passkey_verified', 'transferring', 'received', 'savings_suggested'].includes(stage);
  const isPasskeyDone = ['passkey_verified', 'transferring', 'received', 'savings_suggested'].includes(stage);
  const isComplete = ['received', 'savings_suggested'].includes(stage);

  return (
    <div className="vf-payment-object-core">
      {/* Intent & Review Card */}
      {showReview && (
        <motion.div
          className="vf-intent-card"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="vf-intent-card-header">
            <span className="vf-intent-badge">
              <CircleDollarSign size={13} /> Payment Intent
            </span>
            <span className="vf-network-badge">
              <ShieldCheck size={11} /> BOTChain
            </span>
          </div>

          <div className="vf-intent-rows">
            <div className="vf-intent-row">
              <span>Send amount</span>
              <b className="financial-number">20.00 USDT</b>
            </div>
            <div className="vf-intent-row">
              <span>Recipient</span>
              <b>@ella · Ella Myo</b>
            </div>
            <div className="vf-intent-row">
              <span>User gas fee</span>
              <b className="vf-free-fee">$0.00 (Sponsored)</b>
            </div>
          </div>

          {/* Flowline Progress Visual */}
          <div className="vf-flowline">
            <i className="active" />
            <i className="active" />
            <i className={showPasskey ? 'active' : ''} />
            <i className={isComplete ? 'active' : ''} />
          </div>
          <div className="vf-flowline-labels">
            <span className="active">Intent</span>
            <span className="active">Review</span>
            <span className={showPasskey ? 'active' : ''}>Passkey</span>
            <span className={isComplete ? 'active' : ''}>Receipt</span>
          </div>
        </motion.div>
      )}

      {/* Simulated Passkey Authorization Sheet */}
      {showPasskey && (
        <motion.div
          className={`vf-passkey-card ${isPasskeyDone ? 'verified' : 'waiting'}`}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="vf-passkey-icon">
            <Fingerprint size={22} />
          </div>
          <div className="vf-passkey-text">
            <b>{stage === 'waiting_for_passkey' ? 'Touch ID / Face ID prompt' : 'Passkey signature verified'}</b>
            <small>{stage === 'waiting_for_passkey' ? 'Biometric key stays on device' : 'P-256 signature attached'}</small>
          </div>
          <div className="vf-passkey-status">
            {isPasskeyDone ? <Check size={16} /> : <div className="vf-spinner" />}
          </div>
        </motion.div>
      )}

      {/* Cyan Verified Receipt */}
      {isComplete && (
        <motion.div
          className="vf-receipt"
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="vf-receipt-check">
            <Check size={18} />
          </div>
          <div className="vf-receipt-details">
            <b>20.00 USDT received</b>
            <small>Receipt verified on {platform} · Tx 0x89f...3a12</small>
          </div>
          {stage === 'savings_suggested' && (
            <motion.button
              className="vf-savings-suggestion-btn"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={onSavingsClick}
            >
              <Sparkles size={13} /> Save automatically?
            </motion.button>
          )}
        </motion.div>
      )}
    </div>
  );
}

// Telegram Frame Component
export function TelegramFrame({ stage, onSavingsClick }: { stage: PaymentStage; onSavingsClick?: () => void }) {
  return (
    <div className="vf-frame-wrapper vf-telegram-wrapper">
      <div className="vf-tg-header">
        <div className="vf-tg-avatar">M</div>
        <div className="vf-tg-user-info">
          <b>Ella Myo</b>
          <small>online · @ella</small>
        </div>
        <div className="vf-tg-actions">
          <button aria-label="Call"><Phone size={17} /></button>
          <button aria-label="More options"><MoreVertical size={17} /></button>
        </div>
      </div>

      <div className="vf-tg-body">
        <div className="vf-tg-bubble vf-tg-in">
          <span>Lunch was perfect ✨</span>
          <small>12:41</small>
        </div>

        <div className="vf-tg-bubble vf-tg-out">
          <span>Send 20 USDT to @ella{stage === 'typing' && <i className="vf-caret" />}</span>
          <small>12:42 <span className="vf-checks">✓✓</span></small>
        </div>

        <SharedPaymentObject stage={stage} platform="Telegram" onSavingsClick={onSavingsClick} />
      </div>

      <div className="vf-tg-input-bar">
        <input type="text" readOnly value={stage === 'typing' ? 'Send 20 USDT to @ella...' : 'Message @ella...'} aria-label="Telegram message input" />
        <button aria-label="Send message"><Send size={16} /></button>
      </div>
    </div>
  );
}

// WhatsApp Frame Component
export function WhatsAppFrame({ stage, onSavingsClick }: { stage: PaymentStage; onSavingsClick?: () => void }) {
  return (
    <div className="vf-frame-wrapper vf-whatsapp-wrapper">
      <div className="vf-wa-header">
        <div className="vf-wa-avatar">M</div>
        <div className="vf-wa-user-info">
          <b>Ella Myo</b>
          <small>online</small>
        </div>
        <div className="vf-wa-actions">
          <button aria-label="Call"><Phone size={17} /></button>
          <button aria-label="More options"><MoreVertical size={17} /></button>
        </div>
      </div>

      <div className="vf-wa-body">
        <div className="vf-wa-doodle-bg" aria-hidden="true" />

        <div className="vf-wa-bubble vf-wa-in">
          <span>Lunch was perfect ✨</span>
          <small>12:41</small>
        </div>

        <div className="vf-wa-bubble vf-wa-out">
          <span>Send 20 USDT to @ella{stage === 'typing' && <i className="vf-caret" />}</span>
          <small>12:42 <span className="vf-checks">✓✓</span></small>
        </div>

        {stage !== 'idle' && stage !== 'typing' && (
          <div className="vf-wa-quoted">
            <CornerDownRight size={14} />
            <span>Replying to: "Send 20 USDT to @ella"</span>
          </div>
        )}

        <SharedPaymentObject stage={stage} platform="WhatsApp" onSavingsClick={onSavingsClick} />
      </div>

      <div className="vf-wa-input-bar">
        <input type="text" readOnly value="Message..." aria-label="WhatsApp message input" />
        <button aria-label="Send"><Send size={16} /></button>
      </div>
    </div>
  );
}

// Discord Frame Component
export function DiscordFrame({ stage, onSavingsClick }: { stage: PaymentStage; onSavingsClick?: () => void }) {
  return (
    <div className="vf-frame-wrapper vf-discord-wrapper">
      {/* Narrow Server Rail */}
      <div className="vf-discord-rail" aria-hidden="true">
        <div className="vf-discord-server active"><MessageSquare size={16} /></div>
        <div className="vf-discord-server"><Compass size={16} /></div>
      </div>

      <div className="vf-discord-main">
        <div className="vf-discord-header">
          <Hash size={18} />
          <b>maya-chen</b>
          <span className="vf-discord-badge">Direct Message</span>
        </div>

        <div className="vf-discord-body">
          <div className="vf-discord-msg-stack">
            <div className="vf-discord-avatar">M</div>
            <div className="vf-discord-msg-content">
              <div className="vf-discord-msg-meta">
                <b>maya-chen</b>
                <small>Today at 12:41 PM</small>
              </div>
              <p>Lunch was perfect ✨</p>
            </div>
          </div>

          <div className="vf-discord-msg-stack">
            <div className="vf-discord-avatar user">You</div>
            <div className="vf-discord-msg-content">
              <div className="vf-discord-msg-meta">
                <b>Alex</b>
                <small>Today at 12:42 PM</small>
              </div>
              <p className="vf-discord-slash-cmd">
                <code>/pay user:@ella amount:20 USDT</code>{stage === 'typing' && <i className="vf-caret" />}
              </p>
            </div>
          </div>

          {/* Discord Bot Rich Embed Container */}
          {stage !== 'idle' && stage !== 'typing' && (
            <div className="vf-discord-embed">
              <div className="vf-discord-embed-bar" />
              <div className="vf-discord-embed-inner">
                <div className="vf-discord-bot-tag">
                  <Sparkles size={12} /> VeriAgent Pay APP
                </div>
                <SharedPaymentObject stage={stage} platform="Discord" onSavingsClick={onSavingsClick} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Slack Frame Component
export function SlackFrame({ stage, onSavingsClick }: { stage: PaymentStage; onSavingsClick?: () => void }) {
  return (
    <div className="vf-frame-wrapper vf-slack-wrapper">
      <div className="vf-slack-header">
        <div className="vf-slack-title">
          <Hash size={16} />
          <b>weekend-plans</b>
          <small>5 members</small>
        </div>
      </div>

      <div className="vf-slack-body">
        <div className="vf-slack-msg">
          <div className="vf-slack-avatar">MC</div>
          <div>
            <div className="vf-slack-meta">
              <b>Ella Myo</b>
              <small>12:41 PM</small>
            </div>
            <p>Lunch was perfect ✨</p>
          </div>
        </div>

        <div className="vf-slack-msg">
          <div className="vf-slack-avatar user">A</div>
          <div>
            <div className="vf-slack-meta">
              <b>Alex</b>
              <small>12:42 PM</small>
            </div>
            <p>Send 20 USDT to @ella{stage === 'typing' && <i className="vf-caret" />}</p>
          </div>
        </div>

        {stage !== 'idle' && stage !== 'typing' && (
          <div className="vf-slack-block-kit">
            <div className="vf-slack-app-label">
              <Sparkles size={13} /> VeriAgent Pay App
            </div>
            <SharedPaymentObject stage={stage} platform="Slack" onSavingsClick={onSavingsClick} />
          </div>
        )}
      </div>
    </div>
  );
}

// Platform Switcher Tabs Component
export function PlatformTabs({
  current,
  onChange,
}: {
  current: PlatformType;
  onChange: (p: PlatformType) => void;
}) {
  const platforms: PlatformType[] = ['Telegram', 'WhatsApp', 'Discord', 'Slack'];

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      onChange(platforms[(index + 1) % platforms.length]);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onChange(platforms[(index - 1 + platforms.length) % platforms.length]);
    }
  };

  return (
    <div className="vf-platform-tabs" role="tablist" aria-label="Messaging platform selector">
      {platforms.map((p, idx) => (
        <button
          key={p}
          id={`${p.toLowerCase()}-tab`}
          role="tab"
          aria-selected={current === p}
          aria-controls="platform-scene-panel"
          tabIndex={current === p ? 0 : -1}
          className={`vf-platform-tab ${current === p ? 'active' : ''}`}
          onClick={() => onChange(p)}
          onKeyDown={e => handleKeyDown(e, idx)}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
