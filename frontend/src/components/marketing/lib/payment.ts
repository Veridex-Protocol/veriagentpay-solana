/**
 * The hero payment sequence is a finite-state model, not a scattering of
 * timeouts. Every scene in the page reads its visual state from here, so the
 * story stays identical across the four platform frames, the sticky
 * four-step canvas, and the passkey approval device.
 *
 * Nothing in this module touches WebAuthn, the wallet store, or the API. It is
 * a marketing simulation of the product's real Intent → Review → Passkey →
 * Receipt grammar.
 */

export const PAYMENT_STATES = [
  'idle',
  'typing',
  'intent_parsed',
  'reviewing',
  'waiting_for_passkey',
  'passkey_verified',
  'transferring',
  'received',
  'savings_suggested',
] as const;

export type PaymentState = (typeof PAYMENT_STATES)[number];

/** Cue sheet in milliseconds from the moment the scene becomes visible. */
export const PAYMENT_TIMELINE: ReadonlyArray<{ state: PaymentState; at: number }> = [
  { state: 'typing', at: 600 },
  { state: 'intent_parsed', at: 1500 },
  { state: 'reviewing', at: 2300 },
  { state: 'waiting_for_passkey', at: 2600 },
  { state: 'passkey_verified', at: 3300 },
  { state: 'transferring', at: 3800 },
  { state: 'received', at: 4900 },
  { state: 'savings_suggested', at: 5400 },
];

export const TYPING_DURATION = 900;

export interface PaymentPreset {
  id: string;
  chipLabel: string;
  command: string;
  amount: string;
  asset: string;
  recipientName: string;
  recipientShort?: string;
  recipientHandle: string;
  recipientInitials: string;
  network: string;
  fee: string;
  authorization: string;
  limit: string;
  received: string;
  sentAt: string;
  receivedAt: string;
  reference: string;
}

export const PAYMENT_PRESETS: PaymentPreset[] = [
  {
    id: 'lunch',
    chipLabel: '⚡ Split dinner ($20)',
    command: 'Send 20 USDC to @ella for dinner',
    amount: '20.00',
    asset: 'USDC',
    recipientName: 'Ella Myo',
    recipientShort: 'Maya',
    recipientHandle: '@ella',
    recipientInitials: 'MC',
    network: 'Solana Devnet',
    fee: '$0.00',
    authorization: 'One-time payment',
    limit: '100 USDC per day',
    received: '20 USDC received',
    sentAt: '12:42',
    receivedAt: '12:42',
    reference: '5Nqf…x8K2',
  },
  {
    id: 'freelance',
    chipLabel: '🎨 Design work ($250)',
    command: 'Pay 250 USDC to @alex for logo design',
    amount: '250.00',
    asset: 'USDC',
    recipientName: 'Alex Chen',
    recipientShort: 'Alex',
    recipientHandle: '@alex',
    recipientInitials: 'AC',
    network: 'Solana Devnet',
    fee: '$0.00',
    authorization: 'Milestone payout',
    limit: '500 USDC per day',
    received: '250 USDC received',
    sentAt: '14:15',
    receivedAt: '14:15',
    reference: '3a81…5ef1',
  },
  {
    id: 'coffee',
    chipLabel: '☕ Morning coffee ($5)',
    command: 'Send 5 USDC to @sara for latte',
    amount: '5.00',
    asset: 'USDC',
    recipientName: 'Sara Connor',
    recipientShort: 'Sara',
    recipientHandle: '@sara',
    recipientInitials: 'SC',
    network: 'Solana Devnet',
    fee: '$0.00',
    authorization: 'Instant payment',
    limit: '50 USDC per day',
    received: '5 USDC received',
    sentAt: '09:30',
    receivedAt: '09:30',
    reference: '8e42…12b0',
  },
  {
    id: 'split',
    chipLabel: '🍕 Share rent ($600)',
    command: 'Send 600 USDC to @tomas for rent',
    amount: '600.00',
    asset: 'USDC',
    recipientName: 'Tomas Alva',
    recipientShort: 'Tomas',
    recipientHandle: '@tomas',
    recipientInitials: 'TA',
    network: 'Solana Devnet',
    fee: '$0.00',
    authorization: 'Passkey payment',
    limit: '1000 USDC per day',
    received: '600 USDC received',
    sentAt: '18:04',
    receivedAt: '18:04',
    reference: '99c4…77d1',
  },
];

/** The single financial object every scene shares by default. */
export const PAYMENT = PAYMENT_PRESETS[0];

export interface SequenceState {
  /** -1 is idle; otherwise an index into PAYMENT_TIMELINE. */
  index: number;
  state: PaymentState;
}

export type SequenceAction =
  | { type: 'advance' }
  | { type: 'reset' }
  | { type: 'complete' };

export const INITIAL_SEQUENCE: SequenceState = { index: -1, state: 'idle' };

export function sequenceReducer(state: SequenceState, action: SequenceAction): SequenceState {
  switch (action.type) {
    case 'advance': {
      const index = Math.min(state.index + 1, PAYMENT_TIMELINE.length - 1);
      return { index, state: PAYMENT_TIMELINE[index].state };
    }
    case 'complete': {
      const index = PAYMENT_TIMELINE.length - 1;
      return { index, state: PAYMENT_TIMELINE[index].state };
    }
    case 'reset':
      return INITIAL_SEQUENCE;
    default:
      return state;
  }
}

const ORDER = new Map<PaymentState, number>(PAYMENT_STATES.map((s, i) => [s, i]));

/** True once the sequence has reached `target`. */
export function reached(state: PaymentState, target: PaymentState): boolean {
  return (ORDER.get(state) ?? 0) >= (ORDER.get(target) ?? 0);
}

export interface PaymentView {
  state: PaymentState;
  /** Progress across Intent → Review → Passkey → Receipt. */
  marks: [boolean, boolean, boolean, boolean];
  typing: boolean;
  showCommand: boolean;
  showObject: boolean;
  showReview: boolean;
  showSheet: boolean;
  verified: boolean;
  transferring: boolean;
  received: boolean;
  suggested: boolean;
  /** Plain-language stage, announced politely, never colour alone. */
  status: string;
}

const STATUS: Record<PaymentState, string> = {
  idle: 'Conversation ready',
  typing: 'Reading your message',
  intent_parsed: 'Intent understood',
  reviewing: 'Review before approval',
  waiting_for_passkey: 'Waiting for your passkey',
  passkey_verified: 'Passkey verified',
  transferring: 'Sending payment',
  received: 'Receipt confirmed',
  savings_suggested: 'Optional savings suggestion',
};

export function viewFor(state: PaymentState): PaymentView {
  return {
    state,
    marks: [
      reached(state, 'intent_parsed'),
      reached(state, 'reviewing'),
      reached(state, 'passkey_verified'),
      reached(state, 'received'),
    ],
    typing: state === 'typing',
    showCommand: reached(state, 'typing'),
    showObject: reached(state, 'intent_parsed'),
    showReview: reached(state, 'reviewing'),
    showSheet: state === 'waiting_for_passkey' || state === 'passkey_verified',
    verified: reached(state, 'passkey_verified'),
    transferring: state === 'transferring',
    received: reached(state, 'received'),
    suggested: reached(state, 'savings_suggested'),
    status: STATUS[state],
  };
}

/** Accessible description of the whole scene, per platform. */
export function sceneDescription(platformName: string, status: string): string {
  return `${platformName} conversation showing a ${PAYMENT.amount} ${PAYMENT.asset} payment to ${PAYMENT.recipientName}. Current stage: ${status}.`;
}
