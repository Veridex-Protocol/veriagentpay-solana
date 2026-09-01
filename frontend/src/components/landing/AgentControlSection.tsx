'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, ChevronDown, ShieldAlert, ShieldCheck } from 'lucide-react';

export function AgentControlSection() {
  const [expanded, setExpanded] = useState(false);
  const [revoked, setRevoked] = useState(false);

  return (
    <section className="vf-dark-band vf-agent-section">
      <div className="vf-section-heading">
        <p className="vf-kicker violet">Permission, not magic</p>
        <h2>Control the agent.</h2>
        <p>
          Give VeriAgent a narrow job, a clear spending ceiling, and an expiry date. Revoke it whenever you want with one click.
        </p>
      </div>

      <div className="vf-permission-card-wrapper">
        <div className="vf-permission-card">
          {/* Left Permission Horizon Arc Visual */}
          <div
            className="vf-horizon-visual"
            onClick={() => setExpanded(v => !v)}
            role="button"
            tabIndex={0}
            aria-expanded={expanded}
            aria-label="Toggle plain-language permission breakdown"
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setExpanded(v => !v);
              }
            }}
          >
            <svg viewBox="0 0 220 120" className="vf-horizon-svg" aria-hidden="true">
              <path d="M 20 105 A 90 90 0 0 1 200 105" className="vf-horizon-bg" />
              <motion.path
                d="M 20 105 A 90 90 0 0 1 165 38"
                className="vf-horizon-fill"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              />
            </svg>

            <div className="vf-horizon-text">
              <b className="financial-number">{revoked ? '0%' : '68%'}</b>
              <small>{revoked ? 'Permission revoked' : 'allowance remaining'}</small>
            </div>
          </div>

          {/* Right Parameter List & Plain-Language Sentence */}
          <div className="vf-permission-details">
            <div className="vf-permission-header">
              <span className="vf-violet-tag">
                <Bot size={15} /> AI Savings Agent Rule #04
              </span>
              <span className="vf-status-pill">
                {revoked ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
                {revoked ? 'Revoked' : 'Active bounded policy'}
              </span>
            </div>

            <h3>Move spare USDT into approved liquid strategies.</h3>

            <dl className="vf-permission-datalist">
              <div>
                <dt>Maximum ceiling</dt>
                <dd className="financial-number">100.00 USDT</dd>
              </div>
              <div>
                <dt>Allowed token</dt>
                <dd>USDT only</dd>
              </div>
              <div>
                <dt>Allowed destination</dt>
                <dd>Verified yield strategies</dd>
              </div>
              <div>
                <dt>Policy expiry</dt>
                <dd>Friday, 18:00 UTC</dd>
              </div>
            </dl>

            {/* Expandable Plain-Language Sentence */}
            <div className="vf-plain-lang-toggle">
              <button
                className="vf-expand-copy-btn"
                onClick={() => setExpanded(v => !v)}
                aria-expanded={expanded}
              >
                Plain-language sentence breakdown <ChevronDown size={14} className={`vf-chevron ${expanded ? 'open' : ''}`} />
              </button>

              <AnimatePresence>
                {expanded && (
                  <motion.p
                    className="vf-permission-copy"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    VeriAgent may move up to 100 USDT into approved savings strategies until Friday at 18:00. It cannot send funds to another person or exceed the 100 USDT ceiling.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Interactive Revoke Button */}
            <div className="vf-permission-footer">
              <button
                className={`vf-revoke-btn ${revoked ? 'revoked' : ''}`}
                onClick={() => setRevoked(v => !v)}
              >
                {revoked ? 'Policy Revoked · Restore policy' : 'Revoke permission now'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
