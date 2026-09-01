import React from 'react';

/**
 * Legacy Vite entry point. The product dashboard is served by Next at
 * `/dashboard`; keeping this shell prevents the standalone entry point from
 * displaying a simulated wallet if it is opened directly.
 */
export default function Dashboard() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ maxWidth: 440, padding: 32, textAlign: 'center' }}>
        <h1>VeriAgent Pay</h1>
        <p>Your wallet data is available only in the authenticated dashboard.</p>
        <a href="/dashboard" style={{ color: '#10b981', fontWeight: 700 }}>Open dashboard</a>
      </section>
    </main>
  );
}
