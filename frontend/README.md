# VeriAgent Pay – Full Next.js 14 Frontend

VeriAgent Pay is a production-grade, cross-platform social payments and AI-powered yield automation frontend built for **BOTChain L1**. It supports native execution within **Telegram Mini Apps (TMA)**, **WhatsApp PWA deep links**, **Discord Activity iframes**, and standalone mobile/desktop Progressive Web Applications (PWA).

---

## 🚀 Tech Stack

- **Framework:** Next.js 14 (App Router & Server Components)
- **Styling:** Tailwind CSS (Fintech Dark Aesthetic `#0A0F1F`, `#10B981` Emerald Accents)
- **State & Query Management:** TanStack React Query v5 & Zustand
- **Animations:** Framer Motion & Canvas Confetti
- **Blockchain / Account Abstraction:** `viem`, ERC-4337 Passkeys, and `@veridex/sdk`
- **Icons:** `lucide-react` & Custom Token SVG Mapping

---

## 📱 Platform Integrations

1. **Telegram Mini App (`/` or `?platform=telegram`)**
   - Automatically initializes Telegram Web App SDK (`window.Telegram.WebApp`).
   - Supports haptic feedback (`triggerHaptic`), safe areas, back button, and native biometric passkeys.

2. **WhatsApp PWA (`?platform=whatsapp`)**
   - Deep-linked transaction resolution from WhatsApp cloud bot messages.
   - PWA manifest installation support.

3. **Discord Activity (`?platform=discord`)**
   - Fits compact iframe layout boundaries.
   - Special `X-Frame-Options` headers and CSP rules allowing Discord Activity embedding.

---

## 🛠️ Project Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── (app)/
│   │   │   ├── dashboard/       # Main wallet balance, quick actions & recent activity
│   │   │   ├── send/            # P2P Send flow with passkey signing & confetti
│   │   │   ├── keys/            # Session key management & biometric override
│   │   │   ├── vaults/          # Yield vaults with zkTLS verified APY shield
│   │   │   ├── envelopes/       # Red Envelope packet creation
│   │   │   ├── claim/           # Red Envelope packet claiming
│   │   │   ├── splits/          # Group bill splitting & progress bars
│   │   │   ├── referral/        # Invite link & VERI reward tracking
│   │   │   ├── subscriptions/   # Recurring automated payments
│   │   │   └── settings/        # Connected messenger accounts & app preferences
│   │   ├── globals.css          # Dark theme utilities & glassmorphism
│   │   ├── layout.tsx           # Root HTML layout with font and metadata
│   │   ├── page.tsx             # Public marketing Landing Page
│   │   └── providers.tsx        # React Query & Platform providers wrapper
│   ├── components/
│   │   ├── layout/              # AppLayout & LandingLayout
│   │   ├── ui/                  # Button, Input, Card, Modal, BottomSheet, PasskeyPrompt, etc.
│   │   ├── BottomNav.tsx        # Mobile navigation bar
│   │   └── Sidebar.tsx          # Desktop navigation sidebar
│   ├── hooks/                   # useTelegram, usePlatform, usePasskey, useWalletBalance, etc.
│   ├── store/                   # useWalletStore, usePlatformStore (Zustand)
│   └── middleware.ts            # Platform detection headers
├── public/
│   └── manifest.json            # PWA manifest
├── tailwind.config.js           # Theme configuration & custom brand colors
└── next.config.mjs              # Security & iframe headers
```

---

## ⚡ Quick Start

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Open http://localhost:3000
```
