'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';

const savingsData = {
  Steady: {
    apy: '4–6%',
    liquidity: 'Any time (Instant)',
    risk: 'Lower',
    copy: 'Prioritises stable, liquid yield strategies backed by real-time zkTLS attestation proofs.',
    source: 'Aave v3 USDT Core Pool',
    refHash: '0x71f89a209c24b11',
  },
  Balanced: {
    apy: '6–9%',
    liquidity: '1–2 days',
    risk: 'Moderate',
    copy: 'Balances instant liquidity access, multi-venue diversification, and verified variable rates.',
    source: 'Morpho Blue + Compound v3 Vault',
    refHash: '0x84a1b0289d814e3',
  },
  Opportunity: {
    apy: '9–12%',
    liquidity: '3–7 days',
    risk: 'Higher',
    copy: 'Explores higher-variable yield strategies within your strictly bounded permission limits.',
    source: 'Curve TriCrypto + Convex Vault',
    refHash: '0x99e3c114f0927c8',
  },
} as const;

type SavingsMode = keyof typeof savingsData;

export function SavingsSection() {
  const [mode, setMode] = useState<SavingsMode>('Balanced');
  const [depositAmount, setDepositAmount] = useState(1000);
  const [showProofPeel, setShowProofPeel] = useState(false);

  const current = savingsData[mode];
  const modeKeys = Object.keys(savingsData) as SavingsMode[];

  // Calculate annual return estimate
  const numericApy = parseInt(current.apy, 10);
  const annualEstimate = depositAmount * (numericApy / 100);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setMode(modeKeys[(index + 1) % modeKeys.length]);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setMode(modeKeys[(index - 1 + modeKeys.length) % modeKeys.length]);
    }
  };

  return (
    <section id="savings" className="vf-dark-band vf-savings-section">
      <div className="vf-section-heading">
        <p className="vf-kicker">Optional, bounded automation</p>
        <h2>Save automatically. Verify everything.</h2>
        <p>
          Choose how you want to balance access, variability, and risk. Yield rates are variable and never guaranteed.
        </p>
      </div>

      <div className="vf-savings-shell">
        {/* Strategy Selector Tabs */}
        <div className="vf-platform-tabs" role="tablist" aria-label="Savings strategy selector">
          {modeKeys.map((m, idx) => (
            <button
              key={m}
              role="tab"
              id={`${m.toLowerCase()}-savings-tab`}
              aria-selected={mode === m}
              aria-controls="savings-strategy-panel"
              tabIndex={mode === m ? 0 : -1}
              className={`vf-platform-tab ${mode === m ? 'active' : ''}`}
              onClick={() => setMode(m)}
              onKeyDown={e => handleKeyDown(e, idx)}
            >
              {m}
            </button>
          ))}
        </div>

        {/* 3D Proof Peel Container */}
        <div
          id="savings-strategy-panel"
          role="tabpanel"
          aria-labelledby={`${mode.toLowerCase()}-savings-tab`}
          className={`vf-strategy-card ${showProofPeel ? 'peel-flipped' : ''}`}
        >
          {/* Main Strategy View */}
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              className="vf-strategy-main-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="vf-strategy-top">
                <div>
                  <span className="vf-strategy-label">Expected variable APY</span>
                  <b className="financial-number vf-strategy-apy">{current.apy}</b>
                  <p className="vf-strategy-copy">{current.copy}</p>
                </div>

                <dl className="vf-strategy-metrics">
                  <div>
                    <dt>Liquidity access</dt>
                    <dd>{current.liquidity}</dd>
                  </div>
                  <div>
                    <dt>Risk profile</dt>
                    <dd>{current.risk}</dd>
                  </div>
                  <div>
                    <dt>Attestation check</dt>
                    <dd>4 minutes ago</dd>
                  </div>
                </dl>
              </div>

              {/* Interactive Return Preview Slider */}
              <div className="vf-strategy-slider-box">
                <div className="vf-slider-label">
                  <span>Preview deposit amount</span>
                  <b className="financial-number">${depositAmount.toLocaleString()} USDT</b>
                </div>

                <input
                  type="range"
                  min="100"
                  max="10000"
                  step="100"
                  value={depositAmount}
                  onChange={e => setDepositAmount(Number(e.target.value))}
                  aria-label="Preview deposit amount"
                  className="vf-range-input"
                />

                <div className="vf-estimate-row">
                  <span>Illustrative annual return estimate</span>
                  <b className="financial-number">${annualEstimate.toFixed(0)} USDT</b>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Proof Peel Back Card View */}
          <div className="vf-proof-peel-view">
            <div className="vf-proof-mark">
              <ShieldCheck size={28} />
            </div>
            <p className="vf-kicker">Veridex zkTLS Attestation</p>
            <h3>Rate source cryptographically verified</h3>

            <dl className="vf-proof-datalist">
              <div>
                <dt>Data source</dt>
                <dd>{current.source}</dd>
              </div>
              <div>
                <dt>Attested variable rate</dt>
                <dd>{current.apy} variable</dd>
              </div>
              <div>
                <dt>Verifier network</dt>
                <dd>Veridex Proof Node #04</dd>
              </div>
              <div>
                <dt>Proof reference hash</dt>
                <dd className="financial-number">{current.refHash}</dd>
              </div>
            </dl>
          </div>

          {/* Proof Peel Toggle Button */}
          <button
            className="vf-proof-toggle-btn"
            onClick={() => setShowProofPeel(v => !v)}
            aria-label={showProofPeel ? 'Return to strategy view' : 'View cryptographic proof'}
          >
            <Sparkles size={14} /> {showProofPeel ? 'Back to strategy' : 'View Proof Peel'} <ArrowRight size={14} />
          </button>
        </div>

        <p className="vf-savings-disclaimer">
          Yield rates fluctuate based on market conditions. Stablecoins can lose value. Past performance and illustrative estimates do not guarantee future returns.
        </p>
      </div>
    </section>
  );
}
