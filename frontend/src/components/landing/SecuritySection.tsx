'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Fingerprint, Network, ShieldCheck } from 'lucide-react';

const securityScenarios = {
  'If my phone is lost': {
    heading: 'Hardware loss & recovery policy',
    copy: 'Your account remains self-custodial. A replacement device must satisfy your configured recovery policy or multi-passkey threshold before it can sign payments.',
    highlightNode: 'passkey',
  },
  'If a session is compromised': {
    heading: 'Bounded session isolation',
    copy: 'Revoke the session immediately. Even while active, its strict amount ceiling, token restrictions, allowed destination list, and expiry limits protect your principal balance.',
    highlightNode: 'policy',
  },
  'If a payment is sent incorrectly': {
    heading: 'Explicit pre-flight review',
    copy: 'A settled direct payment cannot be reversed. The mandatory intent review screen makes the recipient name, address, amount, and fee explicit before biometric signing.',
    highlightNode: 'activity',
  },
  'If a recipient has not claimed': {
    heading: 'Claimable envelope cancellation',
    copy: 'Unclaimed payments and red envelopes remain visible in your pending ledger. Use the transaction details screen to reclaim funds once the configured expiry time passes.',
    highlightNode: 'activity',
  },
} as const;

type ScenarioKey = keyof typeof securityScenarios;

export function SecuritySection() {
  const [selectedScenario, setSelectedScenario] = useState<ScenarioKey>('If my phone is lost');

  const current = securityScenarios[selectedScenario];
  const scenarioKeys = Object.keys(securityScenarios) as ScenarioKey[];

  return (
    <section id="security" className="vf-light-band vf-security-section">
      <div className="vf-section-heading">
        <p className="vf-kicker">Inspectable by design</p>
        <h2>Security you can actually inspect.</h2>
        <p>
          Understand what protects you, what can be revoked, and where the trust boundaries lie.
        </p>
      </div>

      <div className="vf-security-layout">
        {/* Left Interactive Architecture Diagram */}
        <div className="vf-security-diagram">
          <div className={`vf-diagram-node ${current.highlightNode === 'passkey' ? 'active' : ''}`}>
            <div className="vf-node-icon-box">
              <Fingerprint size={24} />
            </div>
            <div>
              <b>Passkey Authenticator</b>
              <small>Local enclave authorizes transaction P-256 signatures</small>
            </div>
          </div>

          <div className="vf-diagram-flow-line" />

          <div className={`vf-diagram-node ${current.highlightNode === 'policy' ? 'active' : ''}`}>
            <div className="vf-node-icon-box">
              <ShieldCheck size={24} />
            </div>
            <div>
              <b>Spending Policy Vault</b>
              <small>Constrains maximum ceilings, allowed tokens, and expiries</small>
            </div>
          </div>

          <div className="vf-diagram-flow-line" />

          <div className={`vf-diagram-node ${current.highlightNode === 'activity' ? 'active' : ''}`}>
            <div className="vf-node-icon-box">
              <Network size={24} />
            </div>
            <div>
              <b>Verified Ledger Activity</b>
              <small>Records cryptographic receipts and zkTLS attestations</small>
            </div>
          </div>
        </div>

        {/* Right Risk Scenarios List & Explanatory Display Panel */}
        <div className="vf-security-content-panel">
          <div className="vf-security-options-list" role="tablist" aria-label="Security scenarios">
            {scenarioKeys.map((sc) => (
              <button
                key={sc}
                role="tab"
                aria-selected={selectedScenario === sc}
                className={`vf-security-option-btn ${selectedScenario === sc ? 'active' : ''}`}
                onClick={() => setSelectedScenario(sc)}
              >
                <span>{sc}</span>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={selectedScenario}
              className="vf-security-answer-box"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
            >
              <div className="vf-answer-header">
                <ShieldCheck size={20} className="vf-answer-icon" />
                <h3>{current.heading}</h3>
              </div>
              <p>{current.copy}</p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
