'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';

interface StrategyOption {
  id: string;
  name: string;
  badge?: string;
  apy: number;
  apyLabel: string;
  desc: string;
}

const STRATEGIES: StrategyOption[] = [
  {
    id: 'liquid',
    name: 'Liquid',
    apy: 0.052,
    apyLabel: '5.2% APY',
    desc: 'Instant 1-tap withdrawals',
  },
  {
    id: 'balanced',
    name: 'Balanced',
    badge: 'Popular',
    apy: 0.084,
    apyLabel: '8.4% APY',
    desc: 'Optimized risk & return',
  },
  {
    id: 'growth',
    name: 'Max Growth',
    badge: 'High Yield',
    apy: 0.118,
    apyLabel: '11.8% APY',
    desc: 'Audited smart lending pools',
  },
];

const PRESETS = [1000, 5000, 10000, 25000];

export function SavingsScene() {
  const [selectedId, setSelectedId] = useState<string>('balanced');
  const [amount, setAmount] = useState<number>(5000);

  const strategy = STRATEGIES.find((s) => s.id === selectedId) || STRATEGIES[1];

  const yearlyEarnings = amount * strategy.apy;
  const monthlyEarnings = yearlyEarnings / 12;
  const dailyEarnings = yearlyEarnings / 365;

  return (
    <section
      className="va-savings"
      id="savings"
      data-tone="dark"
      data-scrim="true"
      aria-labelledby="va-savings-title"
    >
      <div className="va-wrap">
        <div className="va-savings-grid">
          {/* Left Column: Editorial & Value Proposition */}
          <div className="va-savings-left">
            <p className="va-eyebrow flex items-center gap-2">
              <i aria-hidden="true" />
              <span>Automated Yield</span>
              <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-mono font-semibold text-amber-400 border border-amber-500/30">
                Coming Soon
              </span>
            </p>
            <h2 className="va-display-xl" id="va-savings-title">
              Put your spare cash on autopilot.
            </h2>
            <p className="va-lede">
              Automated savings and cross-chain yield vaults are launching soon. Unspent USDT in your chat wallet will earn verified returns in the background, compounding daily with zero lockup.
            </p>

            {/* Clean Feature List */}
            <ul className="va-savings-checklist">
              <li>
                <CheckCircle2 size={18} className="va-savings-check-icon" />
                <div>
                  <strong>$0 Gas & Auto-Compounding</strong>
                  <span>Yield is reinvested daily without manual transactions or network fees.</span>
                </div>
              </li>
              <li>
                <CheckCircle2 size={18} className="va-savings-check-icon" />
                <div>
                  <strong>Instant 1-Tap Withdrawals</strong>
                  <span>Withdraw 100% of your funds anytime with zero delay or lockup penalty.</span>
                </div>
              </li>
              <li>
                <CheckCircle2 size={18} className="va-savings-check-icon" />
                <div>
                  <strong>zkTLS On-Chain Attestation</strong>
                  <span>Yield rates are cryptographically proven on BOTChain with zero blind trust.</span>
                </div>
              </li>
            </ul>

            <div className="va-savings-cta-row">
              <Link href="/vaults" className="va-btn va-btn--white opacity-90 hover:opacity-100 flex items-center gap-2">
                <span>Preview Vaults (Coming Soon)</span>
                <ArrowRight size={16} />
              </Link>
              <span className="va-savings-cta-hint">Non-custodial · Touch/Face ID</span>
            </div>
          </div>

          {/* Right Column: Sleek Interactive Simulator Card */}
          <div className="va-savings-right">
            <div className="va-yield-card">
              {/* Card Header */}
              <div className="va-yield-card__top">
                <div className="va-yield-card__status">
                  <span className="va-yield-card__pulse bg-amber-400" />
                  <span>Auto-Save Vault <span className="text-[10px] font-mono text-amber-400 ml-1">(Coming Soon)</span></span>
                </div>
                <span className="va-yield-card__network">BOTChain #968</span>
              </div>

              {/* Strategy Selector Tabs */}
              <div className="va-strat-pills" role="tablist" aria-label="Select Strategy">
                {STRATEGIES.map((s) => {
                  const active = s.id === selectedId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setSelectedId(s.id)}
                      className={`va-strat-pill ${active ? 'va-strat-pill--active' : ''}`}
                    >
                      <span className="va-strat-pill__name">{s.name}</span>
                      <span className="va-strat-pill__rate va-num">{s.apyLabel}</span>
                    </button>
                  );
                })}
              </div>

              {/* Deposit Balance Input */}
              <div className="va-yield-card__amount-box">
                <div className="va-yield-card__label-row">
                  <span className="va-yield-card__label">Simulated Balance</span>
                  <span className="va-yield-card__sublabel">{strategy.desc}</span>
                </div>

                <div className="va-yield-card__input-wrap">
                  <span className="va-yield-card__prefix">$</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                    className="va-yield-card__input va-num"
                    min={100}
                    max={100000}
                    step={500}
                    aria-label="Simulated balance in USDT"
                  />
                  <span className="va-yield-card__curr">USDT</span>
                </div>

                {/* Preset Chips */}
                <div className="va-yield-card__chips">
                  {PRESETS.map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setAmount(val)}
                      className={`va-yield-card__chip ${amount === val ? 'va-yield-card__chip--active' : ''}`}
                    >
                      ${val.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Returns Display Banner */}
              <div className="va-yield-card__return-banner">
                <div className="va-yield-card__return-head">
                  <span>Projected Returns</span>
                  <span className="va-yield-card__rate-badge va-num">{strategy.apyLabel}</span>
                </div>

                <div className="va-yield-card__return-val va-num">
                  +${yearlyEarnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <small>USDT / year</small>
                </div>

                <div className="va-yield-card__return-stats va-num">
                  <div>
                    <span>Monthly</span>
                    <b>+${monthlyEarnings.toFixed(2)}</b>
                  </div>
                  <div className="va-yield-card__stat-sep" />
                  <div>
                    <span>Daily</span>
                    <b>+${dailyEarnings.toFixed(2)}</b>
                  </div>
                  <div className="va-yield-card__stat-sep" />
                  <div>
                    <span>Penalty</span>
                    <b>$0.00</b>
                  </div>
                </div>
              </div>

              {/* Live Automation Telemetry */}
              <div className="va-yield-card__telemetry">
                <div className="va-yield-card__telemetry-item">
                  <Sparkles size={14} className="text-yellow-400" />
                  <span>Auto-compounded daily at 11:00 PM UTC</span>
                </div>
                <div className="va-yield-card__telemetry-item">
                  <ShieldCheck size={14} className="text-yellow-500" />
                  <span>Verified via Veridex zkTLS Oracle</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
