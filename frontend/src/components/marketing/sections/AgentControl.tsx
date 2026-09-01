'use client';

import React from 'react';
import Link from 'next/link';
import { Lock, ShieldCheck, Clock, ArrowRight } from 'lucide-react';

interface PermissionItem {
  label: string;
  value: string;
  subvalue: string;
  icon: React.ElementType;
  badge?: string;
}

const PERMISSIONS: PermissionItem[] = [
  {
    label: 'Authorized Scope',
    value: 'Auto-allocate unspent balance into verified yield',
    subvalue: 'Monitors idle USDT and optimizes compounding return.',
    icon: Lock,
    badge: 'On-Chain Limit',
  },
  {
    label: 'Allowed Destination',
    value: 'Verified Yield Vault (AgentVaultV2) Only',
    subvalue: 'Strictly whitelisted: cannot send to third parties or arbitrary wallets.',
    icon: ShieldCheck,
    badge: 'Whitelisted Only',
  },
  {
    label: 'Key Expiration',
    value: 'Friday at 6:00 PM (4 days remaining)',
    subvalue: 'Becomes inert automatically without explicit passkey re-authorization.',
    icon: Clock,
  },
];

export function AgentControl() {
  return (
    <section
      className="va-band va-agent"
      id="agent"
      data-tone="dark"
      aria-labelledby="va-agent-title"
    >
      <div className="va-wrap">
        {/* Heading Block */}
        <div className="va-heading-block">
          <p className="va-eyebrow">
            <i aria-hidden="true" />
            Bounded Autonomy
          </p>
          <h2 className="va-display-xl" id="va-agent-title">
            Your auto-saving helper only does what you allow.
          </h2>
          <p className="va-lede">
            Your AI assistant operates within strict, immutable rules: an exact destination, a hard spending cap,
            and an auto-expiring passkey grant. When any limit is reached, it stops instantly.
          </p>
        </div>

        {/* Cohesive Panel Component */}
        <div className="va-agent__panel">
          {/* Top Bar Status */}
          <div className="va-agent__topbar">
            <div className="va-agent__status-badge">
              <span className="va-agent__pulse" />
              <span>SESSION KEY #SK-9420 · ENFORCED ON-CHAIN</span>
            </div>
            <div className="va-agent__network-badge">
              <ShieldCheck size={13} />
              <span>Hardware P-256 Verified</span>
            </div>
          </div>

          <div className="va-agent__grid">
            {/* Left Column: Allowance Tracker */}
            <div className="va-agent__gauge-wrap">
              <div className="va-agent__allowance-header">
                <span className="va-agent__allowance-tag">Weekly Spending Cap</span>
                <div className="va-agent__allowance-val va-num">
                  $100.00 <span className="va-agent__allowance-curr">USDT</span>
                </div>
              </div>

              <div className="va-agent__meter-box">
                <div className="va-agent__meter-bar">
                  <div className="va-agent__meter-fill" style={{ width: '32%' }} />
                </div>
                <div className="va-agent__meter-labels va-num">
                  <span>$32.00 deployed</span>
                  <span className="va-agent__meter-avail">$68.00 remaining</span>
                </div>
              </div>

              <div className="va-agent__gauge-specs">
                <div className="va-agent__spec-row">
                  <span>Reset Interval</span>
                  <b>Every 7 Days</b>
                </div>
                <div className="va-agent__spec-row">
                  <span>Auto-Expiry</span>
                  <b>Friday 6:00 PM</b>
                </div>
                <div className="va-agent__spec-row">
                  <span>On-Chain Status</span>
                  <b className="va-agent__spec-active">Active · Enforced</b>
                </div>
              </div>
            </div>

            {/* Right Column: Permission Stack */}
            <div className="va-agent__details">
              <div className="va-agent__cards">
                {PERMISSIONS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="va-perm-card">
                      <div className="va-perm-card__icon">
                        <Icon size={16} />
                      </div>
                      <div className="va-perm-card__content">
                        <div className="va-perm-card__header">
                          <span className="va-perm-card__label">{item.label}</span>
                          {item.badge && <span className="va-perm-card__badge">{item.badge}</span>}
                        </div>
                        <div className="va-perm-card__value">{item.value}</div>
                        <div className="va-perm-card__sub">{item.subvalue}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="va-agent__foot">
                <span className="va-agent__foot-note">
                  Secured by non-custodial smart contracts on BOTChain.
                </span>
                <Link className="va-btn va-btn--outline-dark" href="/settings/security">
                  Manage Permissions
                  <ArrowRight size={14} style={{ marginLeft: 6 }} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

