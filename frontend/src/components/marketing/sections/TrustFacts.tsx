import React from 'react';

/**
 * Only facts the product can stand behind. No customer counts, no volume, no
 * uptime, and no settlement-speed claims.
 */
const FACTS = [
  { value: '$0.00', label: 'Transaction fees', note: 'Every transfer is sponsored. You never need to buy or hold gas tokens.' },
  { value: 'Face ID', label: 'Easy sign-in', note: 'Confirm payments with your face, fingerprint, or screen lock. No passwords to forget.' },
  { value: '100% You', label: 'Your custody', note: 'Your money stays in your hands. Not even we can move your funds.' },
  { value: 'Instant', label: 'Supported networks', note: 'Lightning-fast settlement powered by BOTChain and Stellar.' },
];

export function TrustFacts() {
  return (
    <section className="va-band va-band--light" data-tone="light" aria-labelledby="va-facts-title">
      <div className="va-wrap">
        <h2 className="va-sr" id="va-facts-title">
          What VeriAgent Pay guarantees
        </h2>
        <div className="va-facts">
          {FACTS.map((fact) => (
            <div key={fact.label}>
              <b className="va-num">{fact.value}</b>
              <span>{fact.label}</span>
              <small>{fact.note}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
