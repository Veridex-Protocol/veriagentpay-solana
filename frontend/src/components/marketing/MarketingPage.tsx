'use client';

import React from 'react';

import './styles/system.css';
import './styles/scene.css';
import './styles/sections.css';

import { SiteHeader } from './header/SiteHeader';
import { Hero } from './sections/Hero';
import { TrustFacts } from './sections/TrustFacts';
import { IntentSteps } from './sections/IntentSteps';
import { IdentityContinuity } from './sections/IdentityContinuity';
import { PasskeyApproval } from './sections/PasskeyApproval';
import { SavingsScene } from './sections/SavingsScene';
import { SocialMoney } from './sections/SocialMoney';
import { AgentControl } from './sections/AgentControl';
import { SecuritySystem } from './sections/SecuritySystem';
import { Ecosystem } from './sections/Ecosystem';
import { FinalCTA } from './sections/FinalCTA';
import { SiteFooter } from './sections/SiteFooter';

/**
 * The acquisition surface.
 *
 * Section order follows one argument: it happens in a conversation, it always
 * takes the same four steps, your identity travels with you, a passkey is the
 * signature, saving is optional and provable, money is social, the agent is
 * bounded, and the security model is inspectable.
 *
 * Nothing here touches the wallet store, the API client, passkey registration,
 * or the Telegram SDK. Every link resolves to a route that exists.
 */
export function MarketingPage() {
  return (
    <div className="va-root" suppressHydrationWarning>
      <a className="va-skip" href="#main" suppressHydrationWarning>
        Skip to content
      </a>

      <SiteHeader />

      <main id="main">
        <Hero />
        <TrustFacts />
        <IntentSteps />
        <IdentityContinuity />
        <PasskeyApproval />
        <SavingsScene />
        <SocialMoney />
        <AgentControl />
        <SecuritySystem />
        <Ecosystem />
        <FinalCTA />
      </main>

      <SiteFooter />
    </div>
  );
}
