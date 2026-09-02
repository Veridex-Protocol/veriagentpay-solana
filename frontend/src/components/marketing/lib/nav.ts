import {
  ArrowLeftRight,
  Fingerprint,
  Gift,
  Link2,
  Network,
  Repeat,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavLink {
  label: string;
  href: string;
  blurb: string;
  icon: LucideIcon;
  external?: boolean;
}

/** The official repository and community channels. */
export const REPO_URL = 'https://github.com/veridex-protocol';
export const TELEGRAM_URL = 'https://t.me/VeriAgentPayBot';
export const TELEGRAM_COMMUNITY_URL = 'https://t.me/VeriagentPay';
export const TWITTER_URL = 'https://x.com/veriagentpay';


/**
 * Every entry resolves to a route that exists in this application or to an
 * anchor that exists on this page. Nothing here is aspirational.
 */
export const PERSONAL_LINKS: NavLink[] = [
  {
    label: 'Send & Request',
    href: '/send',
    blurb: 'Send money or ask for payment in chat',
    icon: ArrowLeftRight,
  },
  { label: 'Auto-Save (Soon)', href: '/vaults', blurb: 'Grow your money safely on autopilot · Coming Soon', icon: Sparkles },
  { label: 'Group Pools', href: '/pools', blurb: 'Collect funds together for any goal', icon: Users },
  { label: 'Red Envelopes', href: '/envelopes', blurb: 'Send money gifts and lucky packets', icon: Gift },
  { label: 'Payment Links', href: '/pay', blurb: 'Get paid with a single shareable link', icon: Link2 },
  {
    label: 'Face ID Wallet',
    href: '/settings/security',
    blurb: 'Manage your devices and security keys',
    icon: Fingerprint,
  },
  { label: 'Security', href: '#security', blurb: 'See how your funds stay safe', icon: ShieldCheck },
  {
    label: 'Integrations',
    href: '#about',
    blurb: 'Telegram, WhatsApp, Discord & Slack',
    icon: Network,
  },
];

export const BUSINESS_LINKS: NavLink[] = [
  { label: 'Payment Links', href: '/pay', blurb: 'Instant checkout links with $0 gas fees', icon: Link2 },
  { label: 'Payment Requests', href: '/requests', blurb: 'Track invoices and see who paid', icon: ReceiptText },
  { label: 'Group Pools', href: '/pools', blurb: 'Collect from customers or teams', icon: Users },
  { label: 'Subscriptions', href: '/subscriptions', blurb: 'Easy recurring payments', icon: Repeat },
];

export interface MobileGroup {
  id: string;
  label: string;
  links: NavLink[];
}

export const MOBILE_GROUPS: MobileGroup[] = [
  { id: 'personal', label: 'Personal', links: PERSONAL_LINKS },
  { id: 'businesses', label: 'Businesses', links: BUSINESS_LINKS },
  {
    id: 'developers',
    label: 'Developers',
    links: [
      {
        label: 'Session Keys & APIs',
        href: '/keys',
        blurb: 'Manage programmatic session keys and limits',
        icon: Network,
      },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    links: [
      { label: 'How you are protected', href: '#security', blurb: 'Face ID, spending rules, live activity', icon: ShieldCheck },
      { label: 'Manage Devices', href: '/settings/security', blurb: 'Your passkeys and session access', icon: Fingerprint },
    ],
  },
  {
    id: 'about',
    label: 'About',
    links: [
      { label: 'What is VeriAgent Pay', href: '#about', blurb: 'Passkey-secured USDC on Solana', icon: Network },
      { label: 'Privacy Policy', href: '/privacy', blurb: 'How we keep your data safe and private', icon: ShieldCheck },
    ],
  },
];
