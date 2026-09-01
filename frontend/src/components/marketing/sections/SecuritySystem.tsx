'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronRight,
  Fingerprint,
  KeyRound,
  ScrollText,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { useReducedMotion, useRovingTabs } from '../lib/hooks';

type NodeId = 'passkey' | 'policy' | 'session' | 'record';

const NODES: Array<{ id: NodeId; title: string; role: string; icon: LucideIcon }> = [
  { id: 'passkey', title: 'Your Face ID / Passkey', role: 'Authorizes every transfer', icon: Fingerprint },
  { id: 'policy', title: 'Spending Rules', role: 'Caps daily amounts and destinations', icon: ShieldCheck },
  { id: 'session', title: 'Temporary Session Keys', role: 'Gives narrow, expiring permissions to helpers', icon: KeyRound },
  { id: 'record', title: 'Live Activity Log', role: 'Records every action in real time', icon: ScrollText },
];

const SCENARIOS = ['lost-phone', 'session', 'wrong-recipient', 'unclaimed'] as const;
type ScenarioId = (typeof SCENARIOS)[number];

const ANSWERS: Record<
  ScenarioId,
  { question: string; tag: string; live: NodeId[]; answer: string }
> = {
  'lost-phone': {
    question: 'What if I lose my phone?',
    tag: 'Account Recovery',
    live: ['passkey', 'record'],
    answer:
      'Your money stays completely safe. Because your key is tied to your biometrics, nobody who finds your phone can move your funds. When you set up your new phone, simply complete your recovery verification to restore full access.',
  },
  session: {
    question: 'What if an auto-save key is compromised?',
    tag: 'Instant Containment',
    live: ['session', 'policy'],
    answer:
      'It can only do what you specifically allowed: save up to your pre-set limit in verified pools. It cannot transfer money to anyone else, and it expires automatically. You can also cancel it with one tap in your settings.',
  },
  'wrong-recipient': {
    question: 'What if I send to the wrong person?',
    tag: 'Clear Confirmation',
    live: ['policy', 'record'],
    answer:
      "Direct payments on the blockchain are final. That's why we show you the exact person's handle, photo, amount, and currency on a clear confirmation screen before you ever scan your face.",
  },
  unclaimed: {
    question: "What if someone hasn't claimed their money?",
    tag: 'Pending Claims',
    live: ['record', 'passkey'],
    answer:
      "Unclaimed payments and red envelopes remain clearly marked as 'Pending'. If your friend doesn't claim the money within the time you chose, you can cancel it and return the funds to your balance.",
  },
};

/**
 * One system diagram rather than six equal cards. Choosing a scenario lights
 * the parts of the system that respond to it and rewrites a single panel.
 */
export function SecuritySystem() {
  const [scenario, setScenario] = useState<ScenarioId>('lost-phone');
  const reducedMotion = useReducedMotion();
  const tabs = useRovingTabs(SCENARIOS, scenario, setScenario, 'va-security');
  const current = ANSWERS[scenario];

  return (
    <section
      className="va-band va-band--light"
      id="security"
      data-tone="light"
      aria-labelledby="va-security-title"
    >
      <div className="va-wrap">
        <div className="va-heading-block">
          <p className="va-eyebrow">
            <i aria-hidden="true" />
            Honest, transparent safety
          </p>
          <h2 className="va-display-xl" id="va-security-title">
            Security you can actually understand.
          </h2>
          <p className="va-lede">
            Four simple layers protect your money every day. Pick a real-life situation
            below to see exactly how you are protected.
          </p>
        </div>

        <div className="va-security">
          <div className="va-diagram">
            <div className="va-diagram__grid">
              {NODES.map((node, index) => {
                const live = current.live.includes(node.id);
                return (
                  <React.Fragment key={node.id}>
                    {index > 0 && <span className="va-wire" data-live={live} aria-hidden="true" />}
                    <div className="va-node" data-live={live}>
                      <i aria-hidden="true">
                        <node.icon />
                      </i>
                      <span>
                        <b>{node.title}</b>
                        <small>{node.role}</small>
                      </span>
                      {live && <span className="va-node__badge">Responds</span>}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          <div>
            <div className="va-scenarios" role="tablist" aria-label="Security scenarios" aria-orientation="vertical">
              {SCENARIOS.map((id, index) => (
                <button key={id} type="button" {...tabs.props(id, index)}>
                  {ANSWERS[id].question}
                  <ChevronRight aria-hidden="true" />
                </button>
              ))}
            </div>

            <motion.div
              key={scenario}
              className="va-answer"
              {...tabs.panelProps}
              initial={reducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.36, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="va-answer__tag">
                <ShieldCheck aria-hidden="true" />
                {current.tag}
              </span>
              <h3>{current.question}</h3>
              <p>{current.answer}</p>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
