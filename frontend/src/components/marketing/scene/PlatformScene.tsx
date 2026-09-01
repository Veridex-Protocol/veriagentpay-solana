'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, Lock } from 'lucide-react';
import { PAYMENT, sceneDescription, type PaymentView } from '../lib/payment';
import { PaymentObject } from './PaymentObject';
import { PasskeySheet } from './PasskeySheet';
import { TelegramFrame } from './frames/TelegramFrame';
import { WhatsAppFrame } from './frames/WhatsAppFrame';
import { DiscordFrame } from './frames/DiscordFrame';
import { SlackFrame } from './frames/SlackFrame';
import type { FrameProps } from './frames/shared';

export const PLATFORMS = ['telegram', 'whatsapp', 'discord', 'slack'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_NAMES: Record<Platform, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  discord: 'Discord',
  slack: 'Slack',
};

const FRAMES: Record<Platform, React.ComponentType<FrameProps>> = {
  telegram: TelegramFrame,
  whatsapp: WhatsAppFrame,
  discord: DiscordFrame,
  slack: SlackFrame,
};

/** How the payment object is introduced inside each social environment. */
const ATTACHMENTS: Record<Platform, { icon: 'bot' | 'lock'; text: string; tag?: string; bar: boolean }> = {
  telegram: { icon: 'bot', text: 'VeriAgent Pay', tag: 'bot', bar: false },
  whatsapp: { icon: 'lock', text: 'Secure payment', bar: false },
  discord: { icon: 'bot', text: 'VeriAgent Pay', tag: 'app', bar: true },
  slack: { icon: 'bot', text: 'VeriAgent Pay', tag: 'app', bar: true },
};

interface PlatformSceneProps {
  platform: Platform;
  view: PaymentView;
  typed: string;
  reducedMotion: boolean;
  lens?: boolean;
  payment?: typeof PAYMENT;
}

/**
 * One scene, four wrappers.
 *
 * The chrome and the conversation belong to the platform and are crossfaded on
 * switch. The payment object, its attachment slot, and the passkey sheet are
 * rendered by the scene itself, outside the animated subtree, so the financial
 * object is never unmounted and never moves.
 */
export function PlatformScene({
  platform,
  view,
  typed,
  reducedMotion,
  lens = false,
  payment = PAYMENT,
}: PlatformSceneProps) {
  const Frame = FRAMES[platform];
  const attachment = ATTACHMENTS[platform];
  const name = PLATFORM_NAMES[platform];

  return (
    <div
      className="va-scene"
      data-platform={platform}
      data-received={view.received}
      data-state={view.state}
      role="img"
      aria-label={sceneDescription(name, view.status)}
    >
      <AnimatePresence initial={false} mode="sync">
        <motion.div
          key={platform}
          className="va-scene__layer"
          initial={reducedMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
          transition={{ duration: reducedMotion ? 0 : 0.52, ease: [0.16, 1, 0.3, 1] }}
        >
          <Frame view={view} typed={typed} reducedMotion={reducedMotion} payment={payment} />
        </motion.div>
      </AnimatePresence>

      {view.showObject && (
        <motion.div
          className="va-pay-slot"
          initial={reducedMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.span
              key={platform}
              className="va-attach"
              aria-hidden="true"
              initial={reducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.28 }}
            >
              {attachment.bar && <i className="va-attach__bar" />}
              {attachment.icon === 'bot' ? <Bot /> : <Lock />}
              {attachment.text}
              {attachment.tag && <b>{attachment.tag}</b>}
            </motion.span>
          </AnimatePresence>

          <PaymentObject view={view} payment={payment} lens={lens} reducedMotion={reducedMotion} />
        </motion.div>
      )}

      <AnimatePresence>
        {view.showSheet && (
          <PasskeySheet key="sheet" verified={view.verified} reducedMotion={reducedMotion} />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Text alternative for the whole story, used beside the scene. */
export function sceneTranscript(platform: Platform): string {
  return `In ${PLATFORM_NAMES[platform]}: a message reading "${PAYMENT.command}" is parsed into a payment of ${PAYMENT.amount} ${PAYMENT.asset} to ${PAYMENT.recipientName}, reviewed on ${PAYMENT.network} with a ${PAYMENT.fee} network fee, approved with a device passkey, and confirmed with a receipt.`;
}
