'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  CircleDollarSign,
  Fingerprint,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';
import { SharedPaymentObject } from './PlatformFrames';

export function StickyFlow() {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    {
      num: '01',
      title: 'Say it',
      copy: 'Write a payment like you would write a message in Telegram, WhatsApp, Discord, or Slack.',
      icon: MessageCircle,
      stage: 'typing' as const,
    },
    {
      num: '02',
      title: 'Review it',
      copy: 'See the person, amount, asset, network rail, and zero user fee before anything moves.',
      icon: CircleDollarSign,
      stage: 'reviewing' as const,
    },
    {
      num: '03',
      title: 'Approve it',
      copy: 'Your face, fingerprint, or security key becomes the P-256 signature attached to the transaction.',
      icon: Fingerprint,
      stage: 'waiting_for_passkey' as const,
    },
    {
      num: '04',
      title: 'It arrives',
      copy: 'Both sides receive a clear, cryptographic receipt verified directly inside the conversation.',
      icon: Check,
      stage: 'received' as const,
    },
  ];

  return (
    <section id="flow" className="vf-light-band vf-sticky-flow-section">
      <div className="vf-section-heading">
        <p className="vf-kicker">A clearer payment flow</p>
        <h2>One intent. Four calm steps.</h2>
        <p>
          Every payment follows the exact same visible path, so speed never comes at the cost of control.
        </p>
      </div>

      <div className="vf-sticky-flow-grid">
        {/* Step Items List */}
        <div className="vf-flow-steps-list">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isActive = activeStep === idx;

            return (
              <motion.div
                key={step.num}
                className={`vf-flow-step-card ${isActive ? 'active' : ''}`}
                onClick={() => setActiveStep(idx)}
                whileHover={{ x: 4 }}
                transition={{ duration: 0.2 }}
              >
                <div className="vf-step-num">{step.num}</div>
                <div className="vf-step-content">
                  <div className="vf-step-header">
                    <Icon size={22} className="vf-step-icon" />
                    <h3>{step.title}</h3>
                  </div>
                  <p>{step.copy}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Sticky Canvas Displaying Shared Payment Object */}
        <div className="vf-sticky-canvas-wrapper">
          <div className="vf-sticky-canvas">
            <div className="vf-canvas-header">
              <span className="vf-canvas-title">
                <ShieldCheck size={14} /> Shared Payment Canvas
              </span>
              <span className="vf-canvas-step-badge">
                Step {activeStep + 1} of 4
              </span>
            </div>

            <div className="vf-canvas-body">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeStep}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="vf-sticky-payment-frame"
                >
                  <SharedPaymentObject stage={steps[activeStep].stage} platform="Telegram" />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      <details className="vf-tech-note">
        <summary>View technical path specification</summary>
        <p>
          Natural-language parsing structures intent into typed parameters. P-256 WebAuthn passkeys sign payloads directly from device enclave. Sponsored execution removes gas token requirements, while BOTChain / Stellar provides final settlement.
        </p>
      </details>
    </section>
  );
}
