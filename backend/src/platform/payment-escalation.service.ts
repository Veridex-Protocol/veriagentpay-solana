import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { DEEPLINK_SECRET } from '../config/secrets';
import { getAppBaseUrl } from '../config/app-url.config';

/** How long an escalation link stays valid. */
const ESCALATION_TTL_MS = 15 * 60 * 1000;

/**
 * The query parameters covered by the signature.
 *
 * @dev Everything the destination screen acts on must be in here. `escalated`
 *      and `sig` are excluded by construction: one is presentation, the other
 *      is the signature itself.
 */
const SIGNED_FIELDS = ['amount', 'count', 'expires', 'note', 'to', 'token'] as const;

export interface EscalationVerification {
  valid: boolean;
  /** Machine-readable failure, for logging and for the client's copy. */
  reason?: 'missing_signature' | 'bad_signature' | 'expired' | 'malformed';
}

export type EscalationReason =
  | 'over_limit'
  | 'no_session_key'
  | 'session_expired'
  | 'biometrics_required';

/**
 * What the user was trying to do when they hit a limit.
 *
 * @dev Decides both the destination and the copy. A red envelope is not a
 *      transfer to a recipient — it is a pool split between N claimers — so
 *      sending it to `/send` would land the user on a form asking who to pay.
 */
export type EscalationAction = 'send' | 'envelope';

export interface EscalationPrompt {
  /** Chat-ready message. Markdown, safe for Telegram/Slack/Discord. */
  message: string;
  /** Signed deep link that opens the app with the action pre-filled. */
  link: string;
}

/**
 * Turns an over-limit chat payment into a one-tap passkey approval.
 *
 * A payment above the session-key allowance is the *expected* path for anything
 * large, not an error. The bots previously answered it by telling the user to
 * open the dashboard, revoke their session key, and enrol a new one with higher
 * limits — which asks them to permanently widen their exposure in order to make
 * a single payment, and is exactly backwards.
 *
 * The link carries the payment itself, so the user lands on a filled-in confirm
 * screen and approves with their passkey. Their limits are untouched: the
 * passkey path is exempt from the spending caps because it *is* the escalation
 * out of them.
 *
 * Parameters are HMAC-signed so the amount and recipient cannot be edited
 * between the chat message and the app. Without that, a link forwarded into a
 * group chat would be an editable payment request pointing at the sender's own
 * vault.
 */
@Injectable()
export class PaymentEscalationService {
  private readonly logger = new Logger(PaymentEscalationService.name);

  /**
   * Builds a signed approval link for a payment that exceeded its limit.
   *
   * @param params.reason Why the escalation happened, so copy can be specific
   *        rather than a generic failure.
   */
  buildPrompt(params: {
    to?: string;
    token: string;
    amount: number;
    note?: string;
    /** Claimer count. Envelope actions only. */
    count?: number;
    action?: EscalationAction;
    reason: EscalationReason;
  }): EscalationPrompt {
    const expires = Math.floor((Date.now() + ESCALATION_TTL_MS) / 1000);
    const action: EscalationAction = params.action ?? 'send';

    // Sorted, so the signature is computed over a canonical string and the
    // client cannot change the outcome by reordering query parameters.
    // Optional fields are omitted rather than sent empty, so the canonical
    // string a verifier rebuilds from the query matches this one exactly.
    const signable: Record<string, string> = {
      amount: String(params.amount),
      expires: String(expires),
      token: params.token,
    };
    if (params.to) signable.to = params.to;
    if (params.note) signable.note = params.note;
    if (params.count !== undefined) signable.count = String(params.count);

    const canonical = this.canonicalize(signable);
    const sig = this.sign(canonical);

    const link = `${getAppBaseUrl()}${this.pathFor(action, params.reason)}?${canonical}&sig=${sig}&escalated=1`;

    return { message: this.copyFor({ ...params, action }, link), link };
  }

  /**
   * Serialises the signed fields into the exact string the HMAC covers.
   *
   * @dev Sorted, and absent fields omitted rather than sent empty, so a
   *      verifier rebuilding this from a query string produces byte-identical
   *      input. Signing and verification share this function precisely so the
   *      two cannot drift — a mismatch here fails closed, but silently
   *      rejecting every legitimate link is its own outage.
   */
  private canonicalize(fields: Record<string, string>): string {
    const canonical = new URLSearchParams();
    Object.keys(fields)
      .filter((key) => (SIGNED_FIELDS as readonly string[]).includes(key))
      .sort()
      .forEach((key) => canonical.append(key, fields[key]));
    return canonical.toString();
  }

  private sign(canonical: string): string {
    return crypto.createHmac('sha256', DEEPLINK_SECRET).update(canonical).digest('hex');
  }

  /**
   * Checks that an escalation link's parameters are the ones this service
   * signed, and that it has not expired.
   *
   * @dev The link lands in a chat, which may be a group, and the destination
   *      screen prompts for a passkey on arrival. Without this check a
   *      forwarded link is an editable payment request: change `to` and
   *      `amount`, and the next person to tap it gets a biometric prompt for a
   *      payment to the attacker. The signature existed for exactly this and
   *      was never verified anywhere.
   *
   * @param query Raw query parameters as received by the client.
   */
  verify(query: Record<string, string | undefined>): EscalationVerification {
    const provided = query.sig;
    if (!provided) return { valid: false, reason: 'missing_signature' };

    const fields: Record<string, string> = {};
    for (const key of SIGNED_FIELDS) {
      const value = query[key];
      if (value !== undefined && value !== '') fields[key] = value;
    }

    if (!fields.amount || !fields.token || !fields.expires) {
      return { valid: false, reason: 'malformed' };
    }

    const expected = this.sign(this.canonicalize(fields));

    // Compare in constant time, and only after a length check — `timingSafeEqual`
    // throws on mismatched lengths rather than returning false.
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valid: false, reason: 'bad_signature' };
    }

    // Expiry is inside the signature, so it cannot be extended by editing the
    // query — but nothing enforced it until now, which made every link
    // permanent.
    const expiresAt = Number(fields.expires) * 1000;
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
      return { valid: false, reason: 'expired' };
    }

    return { valid: true };
  }

  /**
   * Where an escalation should land.
   *
   * @dev A transfer always goes to `/send`, which can complete the payment with
   *      a passkey on arrival. An envelope cannot: creating one is two
   *      `ACTION_EXECUTE` calls, and {@link PasskeyExecutionService} only
   *      prepares `transfer` and `session_grant`, so there is no one-tap
   *      passkey path for it. Sending the user to a prefilled envelope form
   *      would just fail against the same limit a second time.
   *
   *      So an envelope escalation goes where the problem is actually fixable —
   *      `/keys`, to grant or renew the session the creation needs. Only
   *      `over_limit` goes to the form, because there the useful next step is
   *      choosing a smaller amount.
   */
  private pathFor(action: EscalationAction, reason: EscalationReason): string {
    if (action !== 'envelope') return '/send';
    return reason === 'over_limit' ? '/envelopes' : '/keys';
  }

  /**
   * @dev Deliberately does not mention revoking or re-enrolling session keys.
   *      Approving one payment must not require widening the standing
   *      allowance — that would trade a one-off convenience for permanent
   *      exposure, and it is the behaviour this service replaces.
   */
  private copyFor(
    params: {
      to?: string;
      token: string;
      amount: number;
      count?: number;
      action: EscalationAction;
      reason: string;
    },
    link: string,
  ): string {
    // "50 USDC to @alice" for a transfer; "a 50 USDC envelope for 5 people" for
    // a drop, which has no single recipient to name.
    const subject =
      params.action === 'envelope'
        ? `a *${params.amount} ${params.token}* envelope${
            params.count ? ` for *${params.count}* people` : ''
          }`
        : `*${params.amount} ${params.token}* to *${params.to}*`;

    // An envelope cannot be completed by a passkey tap on arrival, so its copy
    // must not promise one. It says what will actually unblock the user.
    if (params.action === 'envelope') {
      switch (params.reason) {
        case 'over_limit':
          return (
            `🧧 *Envelope not sent*\n\n` +
            `${subject[0].toUpperCase()}${subject.slice(1)} is above your instant-payment limit.\n\n` +
            `👉 [Open it in the app](${link}) to send a smaller one, or raise your limit with your passkey.`
          );

        case 'session_expired':
          return (
            `🧧 *Envelope not sent*\n\n` +
            `Your instant-payment session has expired, so ${subject} could not be created.\n\n` +
            `👉 [Renew it with your passkey](${link}) — then send that again.`
          );

        case 'no_session_key':
          return (
            `🧧 *Envelope not sent*\n\n` +
            `Instant payments aren't set up yet, so ${subject} could not be created.\n\n` +
            `👉 [Set them up with your passkey](${link}) — then send that again.`
          );

        case 'biometrics_required':
        default:
          return (
            `🧧 *Envelope not sent*\n\n` +
            `You've asked for a passkey check on every payment, and envelopes cannot prompt for one in chat.\n\n` +
            `👉 [Confirm with your passkey](${link}) — then send that again.`
          );
      }
    }

    const verb = 'Approve';

    switch (params.reason) {
      case 'over_limit':
        return (
          `🔐 *Approval needed*\n\n` +
          `${subject[0].toUpperCase()}${subject.slice(1)} is above your instant-payment limit, so it needs your passkey.\n\n` +
          `👉 [${verb} with Face ID / fingerprint](${link})\n\n` +
          `_Your limits stay as they are — this approves this one only._`
        );

      case 'session_expired':
        return (
          `🔐 *Approval needed*\n\n` +
          `Your instant-payment session has expired. ${verb} ${subject} with your passkey.\n\n` +
          `👉 [${verb} with Face ID / fingerprint](${link})`
        );

      case 'no_session_key':
        return (
          `🔐 *Approval needed*\n\n` +
          `${verb} ${subject} with your passkey. You can enable instant payments afterwards so smaller amounts go through without a prompt.\n\n` +
          `👉 [${verb} with Face ID / fingerprint](${link})`
        );

      case 'biometrics_required':
      default:
        return (
          `🔐 *Approval needed*\n\n` +
          `You've asked for a passkey check on every payment. ${verb} ${subject}.\n\n` +
          `👉 [${verb} with Face ID / fingerprint](${link})`
        );
    }
  }

  /**
   * Classifies a failed chat payment.
   *
   * @returns The escalation reason, or `null` when the failure is something the
   *          user cannot fix by approving — an empty balance, an unknown
   *          recipient — where an approval prompt would only waste their time.
   */
  classify(error: unknown): EscalationReason | null {
    const err = error as { code?: string; message?: string };
    const code = err?.code ?? '';
    const message = err?.message ?? '';

    if (code === 'SESSION_KEY_REQUIRED' || /no active session key/i.test(message)) {
      return 'no_session_key';
    }
    if (code === 'SESSION_EXPIRED' || /expired|revoked/i.test(message)) {
      return 'session_expired';
    }
    if (code === 'SESSION_BYPASSED_BIOMETRICS_REQUIRED' || /biometric/i.test(message)) {
      return 'biometrics_required';
    }
    if (
      /exceeds|limit|DailyLimitExceeded|PER_TX_LIMIT|DAILY_LIMIT|POLICY_BLOCKED/i.test(message)
    ) {
      return 'over_limit';
    }

    // Insufficient funds, unknown recipient, chain errors: not fixable by
    // approving, so let the caller surface the real error.
    return null;
  }
}
