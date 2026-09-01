import React from 'react';
import Link from 'next/link';
import { SiteHeader } from '../../components/marketing/header/SiteHeader';
import '../../components/marketing/styles/system.css';

export const metadata = {
  title: 'Privacy Policy | VeriAgent Pay',
  description: 'Comprehensive Privacy Policy for VeriAgent Pay covering biometric passkey security, multichain transaction processing, messaging bot interfaces, and regulatory compliance under GDPR, CCPA/CPRA, UK GDPR, PIPEDA, and LGPD.',
};

export default function PrivacyPolicyPage() {
  const sections = [
    { id: 'section-a', title: 'A. Introduction & Overview' },
    { id: 'section-b', title: 'B. Data We Collect' },
    { id: 'section-c', title: 'C. How We Collect Data' },
    { id: 'section-d', title: 'D. How We Use Your Data & Legal Bases' },
    { id: 'section-e', title: 'E. Biometric Passkey Data Guarantee' },
    { id: 'section-f', title: 'F. How We Share Your Data' },
    { id: 'section-g', title: 'G. Data Retention & Blockchain Storage' },
    { id: 'section-h', title: 'H. Your Legal Rights & Regional Choices' },
    { id: 'section-i', title: 'I. International Data Transfers' },
    { id: 'section-j', title: 'J. Cookies & Tracking Technologies' },
    { id: 'section-k', title: 'K. Childrens Privacy' },
    { id: 'section-l', title: 'L. Security Measures & Encryption' },
    { id: 'section-m', title: 'M. Changes to This Policy' },
    { id: 'section-n', title: 'N. Contact Us & Legal Disclaimers' },
  ];

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-200 font-sans selection:bg-emerald-500/30 selection:text-emerald-400">
      {/* Top Banner Navigation */}
      <SiteHeader />

      {/* Main Hero Container */}
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
        <div className="mb-12 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Global Compliance &amp; Data Protection Policy
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Privacy Policy
          </h1>
          <p className="mt-3 max-w-3xl text-sm sm:text-base text-slate-400">
            Learn how VeriAgent Pay protects your personal data, cryptographic credentials, and transaction records across our web platform and messaging bot integrations.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-400">
            <span className="rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1 font-mono">
              [Effective Date: August 1, 2026]
            </span>
            <span className="rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1 font-mono">
              [Last Updated: August 1, 2026]
            </span>
            <span className="rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1 font-mono text-emerald-400">
              Version 2.4.0
            </span>
          </div>
        </div>

        {/* Layout Grid: Sticky Nav Sidebar + Policy Content */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
          {/* Sidebar Table of Contents */}
          <aside className="lg:col-span-4">
            <div className="sticky top-24 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 backdrop-blur-xl">
              <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Table of Contents
              </h2>
              <nav className="mt-4 flex flex-col space-y-1" aria-label="Table of contents" role="doc-toc">
                {sections.map((sec) => (
                  <a
                    key={sec.id}
                    href={`#${sec.id}`}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-slate-800 hover:text-emerald-400"
                  >
                    {sec.title}
                  </a>
                ))}
              </nav>

              <div className="mt-6 border-t border-slate-800/80 pt-4 text-xs text-slate-500">
                Need data assistance? Contact our Data Protection Officer at{' '}
                <a
                  href="mailto:privacy@veriagent.pay"
                  className="font-medium text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
                >
                  privacy@veriagent.pay
                </a>
              </div>
            </div>
          </aside>

          {/* Main Legal Content Article */}
          <article className="space-y-12 lg:col-span-8">
            {/* Section A */}
            <section id="section-a" className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 sm:p-8 backdrop-blur-sm">
              <h2 className="text-xl font-bold text-white sm:text-2xl">
                A. Introduction &amp; Overview
              </h2>
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
                <p>
                  Welcome to <strong>VeriAgent Pay</strong> (operated by <strong>[Company Name / Veridex Protocol]</strong>, referred to as &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). VeriAgent Pay is a cross-platform social payment, yield automation, and peer-to-peer liquidity protocol that allows users to send gasless cryptocurrency payments, split bills, deposit into yield vaults, and manage group credit lines.
                </p>
                <p>
                  <strong>Scope of This Policy:</strong> This Privacy Policy applies to all services, products, tools, and interfaces provided by VeriAgent Pay, including our official Web Application (
                  <code className="text-xs text-emerald-400 font-mono">https://veriagentpay.xyz</code>), Telegram Mini App, Telegram Bot (<code className="text-xs text-emerald-400 font-mono">@VeriAgentPayBot</code>), WhatsApp Bot, Discord Bot, Slack Bot, and REST/WebSocket APIs (collectively, the &quot;Service&quot;).
                </p>
                <p>
                  We are committed to maintaining the highest global standards of privacy, security, and transparency under applicable data protection laws, including the European Union General Data Protection Regulation (<strong>GDPR</strong>), the California Consumer Privacy Act as amended by the California Privacy Rights Act (<strong>CCPA/CPRA</strong>), the UK Data Protection Act 2018 (<strong>UK GDPR</strong>), Canada’s Personal Information Protection and Electronic Documents Act (<strong>PIPEDA</strong>), and Brazil’s Lei Geral de Proteção de Dados (<strong>LGPD</strong>).
                </p>
              </div>
            </section>

            {/* Section B */}
            <section id="section-b" className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 sm:p-8 backdrop-blur-sm">
              <h2 className="text-xl font-bold text-white sm:text-2xl">
                B. Data We Collect
              </h2>
              <p className="mt-3 text-sm text-slate-400">
                We collect personal and technical data to deliver secure, non-custodial social payment workflows. Below is an exhaustive list of the data categories we process:
              </p>

              <div className="mt-6 space-y-6 text-sm leading-relaxed text-slate-300">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <h3 className="font-semibold text-emerald-400">1. Personal Identification Data</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Social messaging handles and platform IDs: Telegram username &amp; Telegram user ID, WhatsApp phone number, Discord user ID, Slack user ID, Google account email (if authenticating via OAuth), and counterfactual/deployed Smart Account wallet addresses.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <h3 className="font-semibold text-emerald-400">2. Biometric Data Credentials</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    WebAuthn / Passkey public key credentials (P-256 curve cryptographic public key material). <strong>Crucial Notice:</strong> We NEVER collect, receive, or store your raw fingerprint scans, Face ID data, or local device biometric templates. All raw biometric processing occurs exclusively within your local device’s Secure Enclave / Trusted Execution Environment (TEE).
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <h3 className="font-semibold text-emerald-400">3. Financial &amp; Transaction Data</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    On-chain transaction hashes, token transfer amounts, supported asset balances (BOT, USDC, USDT, ETH, SOL), counterparty wallet addresses, yield vault deposit/withdrawal records, peer credit pool loan proposals, voting activity, and red envelope claims.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <h3 className="font-semibold text-emerald-400">4. Technical &amp; Usage Data</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Internet Protocol (IP) address, device type, operating system version, browser type, Telegram Mini App viewport telemetry, API request timestamps, error trace logs, and web analytics.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <h3 className="font-semibold text-emerald-400">5. Communication &amp; AI Query Data</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Bot command text inputs (e.g. <code className="text-emerald-400">/pay 50 USDC @alice</code>), natural language payment queries processed via Google Gemini AI via <code className="text-emerald-400">@veridex/agents</code>, customer support tickets, and feedback form submissions.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <h3 className="font-semibold text-emerald-400">6. Contact List Data</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Frequent recipient social handles saved manually or automatically recorded following successful peer-to-peer transfers (accompanied by explicit in-chat notification during recipient auto-save).
                  </p>
                </div>
              </div>
            </section>

            {/* Section C */}
            <section id="section-c" className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 sm:p-8 backdrop-blur-sm">
              <h2 className="text-xl font-bold text-white sm:text-2xl">
                C. How We Collect Data
              </h2>
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
                <p>We collect information through three primary channels:</p>
                <ul className="list-disc space-y-2 pl-5 text-slate-300">
                  <li>
                    <strong>Direct Interactions:</strong> When you initiate commands in Telegram, WhatsApp, Discord, or Slack; authenticate via WebAuthn Passkey; or submit forms inside the Web Dashboard or Telegram Mini App.
                  </li>
                  <li>
                    <strong>Automated System Collection:</strong> Through our NestJS backend infrastructure, Prisma ORM logging layer, PostgreSQL database engines, and privacy-preserving analytics scripts.
                  </li>
                  <li>
                    <strong>Third-Party Integrations &amp; Blockchain RPCs:</strong> Via official OAuth/Webhook events provided by Telegram, WhatsApp Cloud API, Discord API, Slack API, and public blockchain RPC nodes (e.g. BOTChain RPC, Bohr RPC, Arbitrum, Base) when retrieving transaction confirmations.
                  </li>
                </ul>
              </div>
            </section>

            {/* Section D */}
            <section id="section-d" className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 sm:p-8 backdrop-blur-sm">
              <h2 className="text-xl font-bold text-white sm:text-2xl">
                D. How We Use Your Data &amp; Legal Bases
              </h2>
              <div className="mt-4 text-sm leading-relaxed text-slate-300">
                <p>Under GDPR and international privacy regulations, we process data based on defined legal grounds:</p>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300 border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950/80 text-emerald-400">
                        <th className="p-3">Processing Purpose</th>
                        <th className="p-3">Categories of Data</th>
                        <th className="p-3">Legal Basis (GDPR Art. 6)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      <tr>
                        <td className="p-3 font-medium text-white">Execute transactions &amp; smart contracts</td>
                        <td className="p-3">Wallet address, tx amount, token symbol, handles</td>
                        <td className="p-3 text-emerald-400">Contractual Necessity (Art. 6(1)(b))</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-medium text-white">Authenticate passkeys &amp; session keys</td>
                        <td className="p-3">P-256 public key, short-lived session hashes</td>
                        <td className="p-3 text-emerald-400">Contractual Necessity (Art. 6(1)(b))</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-medium text-white">Send bot notifications &amp; receipts</td>
                        <td className="p-3">Platform ID, handle, transaction status</td>
                        <td className="p-3 text-emerald-400">Legitimate Interest (Art. 6(1)(f))</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-medium text-white">Parse natural language intent via AI</td>
                        <td className="p-3">Raw text query (anonymized payload)</td>
                        <td className="p-3 text-emerald-400">Legitimate Interest (Art. 6(1)(f))</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-medium text-white">Fraud prevention &amp; system debugging</td>
                        <td className="p-3">IP address, request logs, device details</td>
                        <td className="p-3 text-emerald-400">Legitimate Interest (Art. 6(1)(f))</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-medium text-white">Legal &amp; regulatory compliance</td>
                        <td className="p-3">On-chain receipts, audit logs</td>
                        <td className="p-3 text-emerald-400">Legal Obligation (Art. 6(1)(c))</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* Section E */}
            <section id="section-e" className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 sm:p-8 backdrop-blur-sm">
              <h2 className="text-xl font-bold text-white sm:text-2xl">
                E. Biometric Passkey Data Guarantee
              </h2>
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
                <p>
                  VeriAgent Pay utilizes modern WebAuthn / FIDO2 standards to enable biometric passkey authentication (Touch ID, Face ID, Windows Hello, Android Biometrics).
                </p>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-xs text-emerald-300">
                  <strong>🔒 Technical Guarantee:</strong> When you register a biometric passkey with VeriAgent Pay, your device’s hardware security module generates an asymmetric key pair. Your raw biometric measurements <em>never leave your physical device</em>. VeriAgent Pay stores only the public key material used to verify WebAuthn assertion signatures during session key authorization.
                </div>
                <p>
                  It is mathematically impossible for VeriAgent Pay, third parties, or attackers to reconstruct your biometric data or access your device through stored passkey public keys.
                </p>
              </div>
            </section>

            {/* Section F */}
            <section id="section-f" className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 sm:p-8 backdrop-blur-sm">
              <h2 className="text-xl font-bold text-white sm:text-2xl">
                F. How We Share Your Data
              </h2>
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
                <p>We strictly limit third-party data sharing:</p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>
                    <strong>Counterparties:</strong> When you send a payment, split a bill, or issue a request, your social handle and truncated wallet address (<code className="text-xs text-emerald-400 font-mono">0x123...456</code>) are shared with the recipient to complete the transaction.
                  </li>
                  <li>
                    <strong>AI Service Providers (<code className="text-xs text-emerald-400 font-mono">@veridex/agents</code> / Gemini AI):</strong> Natural language queries entered into bot chats are processed by AI models to infer payment parameters (e.g. amount, token, intent). We transmit only the text string entered; no personal profile identifiers are attached unless explicitly typed by the user in the prompt.
                  </li>
                  <li>
                    <strong>Blockchain Network Nodes:</strong> Signed transaction payloads are broadcast to public blockchain RPC nodes (BOTChain, Bohr, Arbitrum, Base) to execute smart account transfers.
                  </li>
                  <li>
                    <strong>Legal Requirements:</strong> We disclose user information only when compelled by valid, binding law enforcement requests, court orders, or subpoenas.
                  </li>
                  <li>
                    <strong>No Data Sales:</strong> We do NOT sell, rent, trade, or monetize your personal data or contact lists to advertising networks or data brokers.
                  </li>
                </ul>
              </div>
            </section>

            {/* Section G */}
            <section id="section-g" className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 sm:p-8 backdrop-blur-sm">
              <h2 className="text-xl font-bold text-white sm:text-2xl">
                G. Data Retention &amp; Blockchain Storage
              </h2>
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
                <p>Data retention periods vary based on data category and technology constraints:</p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>
                    <strong>Blockchain Records (Immutable):</strong> Transactions broadcast to public blockchain networks (hashes, public wallet addresses, transfer amounts) are permanently recorded on-chain by network consensus and cannot be altered or deleted.
                  </li>
                  <li>
                    <strong>Account Profile &amp; Passkey Data:</strong> Retained in PostgreSQL while your account remains active. Off-chain user profile data can be anonymized or deleted upon request (Section H).
                  </li>
                  <li>
                    <strong>Bot Interaction &amp; Queue Logs:</strong> Retained in encrypted Redis/PostgreSQL storage for up to 12 months for service optimization and operational debugging, after which logs are scrubbed or anonymized.
                  </li>
                  <li>
                    <strong>Analytics Data:</strong> Retained for up to 26 months in aggregated, anonymized form.
                  </li>
                </ul>
              </div>
            </section>

            {/* Section H */}
            <section id="section-h" className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 sm:p-8 backdrop-blur-sm">
              <h2 className="text-xl font-bold text-white sm:text-2xl">
                H. Your Legal Rights &amp; Regional Choices
              </h2>
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
                <p>
                  Depending on your jurisdiction (GDPR, CCPA/CPRA, UK DPA, PIPEDA, LGPD), you enjoy the following privacy rights:
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                    <h3 className="font-semibold text-emerald-400">Right to Access</h3>
                    <p className="mt-1 text-xs text-slate-400">Request a complete copy of off-chain personal data we hold about you.</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                    <h3 className="font-semibold text-emerald-400">Right to Rectification</h3>
                    <p className="mt-1 text-xs text-slate-400">Correct inaccurate or incomplete social handles or profile links.</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                    <h3 className="font-semibold text-emerald-400">Right to Erasure (Forgotten)</h3>
                    <p className="mt-1 text-xs text-slate-400">Request deletion of off-chain profile data (excluding immutable blockchain records).</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                    <h3 className="font-semibold text-emerald-400">Right to Portability</h3>
                    <p className="mt-1 text-xs text-slate-400">Export transaction history and contact lists in machine-readable JSON format.</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  To exercise your rights, email your request to{' '}
                  <a href="mailto:privacy@veriagent.pay" className="text-emerald-400 underline">
                    privacy@veriagent.pay
                  </a>{' '}
                  or access Settings inside the Web Dashboard. We fulfill requests within 30 days without charge.
                </p>
              </div>
            </section>

            {/* Section I */}
            <section id="section-i" className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 sm:p-8 backdrop-blur-sm">
              <h2 className="text-xl font-bold text-white sm:text-2xl">
                I. International Data Transfers
              </h2>
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
                <p>
                  VeriAgent Pay operates globally. Your data may be processed on secure servers located in the United States, European Union, or other global jurisdictions.
                </p>
                <p>
                  When transferring personal data internationally from the European Economic Area (EEA), United Kingdom, or Switzerland, we rely on Standard Contractual Clauses (SCCs) approved by the European Commission, data processing agreements (DPAs), and strict technical encryption measures to ensure data protection equivalence.
                </p>
              </div>
            </section>

            {/* Section J */}
            <section id="section-j" className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 sm:p-8 backdrop-blur-sm">
              <h2 className="text-xl font-bold text-white sm:text-2xl">
                J. Cookies &amp; Tracking Technologies
              </h2>
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
                <p>
                  <strong>Web Dashboard:</strong> We use essential HTTP cookies and local storage tokens strictly required for user authentication, session key authorization, and security. We may use privacy-respecting analytics to evaluate page load metrics.
                </p>
                <p>
                  <strong>Messaging Bots &amp; Mini Apps:</strong> Telegram Mini Apps do not store browser cookies; user context is provided directly via Telegram’s secure initData HMAC signatures.
                </p>
              </div>
            </section>

            {/* Section K */}
            <section id="section-k" className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 sm:p-8 backdrop-blur-sm">
              <h2 className="text-xl font-bold text-white sm:text-2xl">
                K. Children’s Privacy
              </h2>
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
                <p>
                  VeriAgent Pay is not directed to or intended for children under the age of 16 (or 13 in certain US jurisdictions). We do not knowingly collect personal information from minors. If we discover that a minor under 16 has established an account, we will immediately delete their off-chain profile data.
                </p>
              </div>
            </section>

            {/* Section L */}
            <section id="section-l" className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 sm:p-8 backdrop-blur-sm">
              <h2 className="text-xl font-bold text-white sm:text-2xl">
                L. Security Measures &amp; Encryption
              </h2>
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
                <p>We deploy defense-in-depth security infrastructure to protect user assets and privacy:</p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>
                    <strong>End-to-End Transport Security:</strong> HTTPS/TLS 1.3 encryption for all Web API endpoints and Webhook payloads.
                  </li>
                  <li>
                    <strong>Session Key Vault Security:</strong> Active Smart Account Session Keys are encrypted at rest using AES-256-GCM authenticated encryption.
                  </li>
                  <li>
                    <strong>Strict Access Control &amp; Rate Limiting:</strong> NestJS throttler guards, IP rate limits, and zero public exposure of sensitive database infrastructure.
                  </li>
                </ul>
              </div>
            </section>

            {/* Section M */}
            <section id="section-m" className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 sm:p-8 backdrop-blur-sm">
              <h2 className="text-xl font-bold text-white sm:text-2xl">
                M. Changes to This Policy
              </h2>
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
                <p>
                  We may update this Privacy Policy from time to time to reflect protocol changes, regulatory updates, or new platform integrations. When material updates occur, we will notify users via in-chat bot broadcasts or prominent Web App notices. Your continued use of VeriAgent Pay following notice indicates acceptance of the updated policy.
                </p>
              </div>
            </section>

            {/* Section N & Disclaimers */}
            <section id="section-n" className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 sm:p-8 backdrop-blur-sm">
              <h2 className="text-xl font-bold text-white sm:text-2xl">
                N. Contact Us &amp; Legal Disclaimers
              </h2>
              <div className="mt-4 space-y-4 text-sm leading-relaxed text-slate-300">
                <p>
                  If you have questions, concerns, or legal inquiries regarding this Privacy Policy or your personal data, contact our compliance team:
                </p>
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-xs font-mono text-slate-300">
                  <p><strong>Entity:</strong> [Company Name / Veridex Protocol]</p>
                  <p><strong>Email:</strong> <a href="mailto:privacy@veriagent.pay" className="text-emerald-400 underline">privacy@veriagent.pay</a></p>
                  <p><strong>Telegram:</strong> @VeriAgentPayBot</p>
                  <p><strong>Address:</strong> [100 Blockchain Plaza, Suite 400, San Francisco, CA 94105, USA]</p>
                </div>

                <div className="mt-6 border-t border-slate-800/80 pt-6 text-xs text-slate-400 space-y-3">
                  <p className="font-semibold text-amber-400">
                    ⚠️ Legal Notice &amp; Disclaimer:
                  </p>
                  <p className="italic">
                    This privacy policy is provided for informational purposes and does not constitute formal legal advice. VeriAgent Pay makes no warranties regarding the completeness or accuracy of this document. Users should consult their own legal counsel for specific regulatory compliance concerns.
                  </p>
                  <p className="italic">
                    In the event of any inconsistency or discrepancy between this English version and any translated version of this Privacy Policy, the English version shall prevail.
                  </p>
                </div>
              </div>
            </section>
          </article>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-slate-800/80 bg-slate-950 py-8 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 VeriAgent Pay (Veridex Protocol). All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:text-emerald-400 transition">Home</Link>
            <Link href="/dashboard" className="hover:text-emerald-400 transition">Dashboard</Link>
            <Link href="/privacy" className="text-emerald-400 font-semibold">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
