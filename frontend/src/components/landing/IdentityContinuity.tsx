'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, MessageCircle, ShieldCheck } from 'lucide-react';
import { PlatformType } from './PlatformFrames';
import { Wordmark } from './AdaptiveHeader';

export function IdentityContinuity() {
  const [activePlatform, setActivePlatform] = useState<PlatformType>('Telegram');

  const nodePositions = [
    { name: 'Telegram' as const, label: 'Telegram Bot', icon: MessageCircle, x: -180, y: -120 },
    { name: 'WhatsApp' as const, label: 'WhatsApp Agent', icon: MessageCircle, x: 180, y: -100 },
    { name: 'Discord' as const, label: 'Discord Bot', icon: MessageCircle, x: -190, y: 110 },
    { name: 'Slack' as const, label: 'Slack App', icon: MessageCircle, x: 180, y: 120 },
  ];

  return (
    <section className="vf-dark-band vf-identity-section">
      <div className="vf-section-heading">
        <p className="vf-kicker">Identity continuity</p>
        <h2>Your identity travels with you.</h2>
        <p>
          Your balance, receipt history, and vault permissions stay put while the conversation around them changes.
        </p>
      </div>

      <div className="vf-identity-stage">
        {/* Orbit Graphic Lines */}
        <div className="vf-orbit-system" aria-hidden="true">
          <div className="vf-orbit-ring ring-1" />
          <div className="vf-orbit-ring ring-2" />
          <div className="vf-orbit-ring ring-3" />
        </div>

        {/* Central Self-Custodial Account Object */}
        <motion.div
          className="vf-core-account"
          initial={{ scale: 0.9, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <Wordmark />
          <span className="financial-number">$1,248.20</span>
          <small>One self-custodial account</small>
          <span className="vf-passkey-verified-tag">
            <ShieldCheck size={12} /> Passkey protected
          </span>
        </motion.div>

        {/* Platform Nodes Orbiting Core */}
        {nodePositions.map((node) => {
          const isActive = activePlatform === node.name;
          const Icon = node.icon;

          return (
            <motion.button
              key={node.name}
              className={`vf-node-button ${isActive ? 'active' : ''}`}
              style={{
                transform: `translate(${node.x}px, ${node.y}px)`,
              }}
              onClick={() => setActivePlatform(node.name)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              aria-label={`Select ${node.name} wrapper`}
            >
              <div className="vf-node-icon">
                <Icon size={18} />
              </div>
              <div className="vf-node-text">
                <b>{node.name}</b>
                <small>{isActive ? 'Active wrapper' : 'Connected'}</small>
              </div>
              {isActive && (
                <span className="vf-active-check">
                  <Check size={14} />
                </span>
              )}
            </motion.button>
          );
        })}

        {/* Dynamic Cyan Verification Trace SVG */}
        <svg className="vf-cyan-proof-lines" aria-hidden="true">
          <motion.line
            x1="50%"
            y1="50%"
            x2={activePlatform === 'Telegram' || activePlatform === 'Discord' ? '30%' : '70%'}
            y2={activePlatform === 'Telegram' || activePlatform === 'WhatsApp' ? '30%' : '70%'}
            stroke="#22d3ee"
            strokeWidth="2"
            strokeDasharray="6 6"
            initial={{ strokeDashoffset: 40 }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
          />
        </svg>

        {/* Fixed Receipt in Space */}
        <motion.div
          className="vf-fixed-receipt"
          initial={{ y: 20, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
        >
          <div className="vf-fixed-receipt-check">
            <Check size={18} />
          </div>
          <div className="vf-fixed-receipt-info">
            <b>20.00 USDT to @ella</b>
            <small>Receipt verified on {activePlatform} · Tx signed via passkey</small>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
