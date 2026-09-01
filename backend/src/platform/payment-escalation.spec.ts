/**
 * Covers the signature on chat escalation links.
 *
 * These links land in chats that may be groups, and the destination screen
 * fires a passkey prompt on arrival with no further interaction. The signature
 * is the only thing standing between that and a forwarded, edited link — so
 * the tampering cases are asserted directly rather than inferred from a
 * round-trip passing.
 */

const REQUIRED_ENV: Record<string, string> = {
  JWT_SECRET: 'a'.repeat(48),
  ADMIN_JWT_SECRET: 'b'.repeat(48),
  DEEPLINK_SECRET: 'c'.repeat(48),
  INTERACTIVE_ACTION_SECRET: 'd'.repeat(48),
  GOOGLE_OAUTH_CLIENT_ID: 'e'.repeat(48),
  RELAYER_PRIVATE_KEY: '0x' + 'f'.repeat(64),
  SESSION_KEY_MASTER_SECRET: '9'.repeat(64),
};

for (const [key, value] of Object.entries(REQUIRED_ENV)) {
  process.env[key] = process.env[key] ?? value;
}

// The runner may have loaded a .env, so the effective secret is whatever ended
// up in the environment — not necessarily the literal above. Re-signing below
// has to use the same key the service does.
const EFFECTIVE_DEEPLINK_SECRET = process.env.DEEPLINK_SECRET!;

let service: any;

/** Pulls the signed query off a built link, as the browser would receive it. */
function queryOf(link: string): Record<string, string> {
  const params = new URLSearchParams(link.split('?')[1]);
  return Object.fromEntries(params.entries());
}

beforeAll(async () => {
  const { PaymentEscalationService } = await import('./payment-escalation.service');
  service = new PaymentEscalationService();
});

describe('escalation link signing', () => {
  const payment = {
    to: '@alice',
    token: 'USDC',
    amount: 50,
    reason: 'over_limit' as const,
  };

  it('accepts a link it just produced', () => {
    const { link } = service.buildPrompt(payment);
    expect(service.verify(queryOf(link))).toEqual({ valid: true });
  });

  it('rejects an edited recipient', () => {
    const { link } = service.buildPrompt(payment);
    const query = { ...queryOf(link), to: '@attacker' };

    expect(service.verify(query)).toEqual({ valid: false, reason: 'bad_signature' });
  });

  it('rejects an edited amount', () => {
    const { link } = service.buildPrompt(payment);
    const query = { ...queryOf(link), amount: '5000' };

    expect(service.verify(query)).toEqual({ valid: false, reason: 'bad_signature' });
  });

  it('rejects a link with no signature', () => {
    const { link } = service.buildPrompt(payment);
    const { sig, ...unsigned } = queryOf(link);

    expect(service.verify(unsigned)).toEqual({ valid: false, reason: 'missing_signature' });
  });

  it('rejects a signature borrowed from a different payment', () => {
    const other = service.buildPrompt({ ...payment, amount: 5000 });
    const mine = queryOf(service.buildPrompt(payment).link);

    expect(service.verify({ ...mine, sig: queryOf(other.link).sig })).toEqual({
      valid: false,
      reason: 'bad_signature',
    });
  });

  it('rejects an expired link even when the signature is intact', () => {
    const { link } = service.buildPrompt(payment);
    const query = queryOf(link);

    // Re-sign an already-past expiry, so the only defect is the clock. Editing
    // `expires` alone would fail on the signature and prove nothing.
    const past = Math.floor(Date.now() / 1000) - 60;
    const resigned = queryOf(service.buildPrompt(payment).link);
    resigned.expires = String(past);
    const canonical = new URLSearchParams();
    ['amount', 'expires', 'to', 'token']
      .sort()
      .forEach((k) => canonical.append(k, resigned[k]));
    const crypto = require('crypto');
    resigned.sig = crypto
      .createHmac('sha256', EFFECTIVE_DEEPLINK_SECRET)
      .update(canonical.toString())
      .digest('hex');

    expect(service.verify(resigned)).toEqual({ valid: false, reason: 'expired' });
    // Sanity: the unmodified link is still good, so the case above isolates expiry.
    expect(service.verify(query)).toEqual({ valid: true });
  });

  it('round-trips an envelope link, which carries a count and no recipient', () => {
    const { link } = service.buildPrompt({
      token: 'USDC',
      amount: 50,
      count: 5,
      action: 'envelope',
      reason: 'no_session_key',
    });

    expect(link).toContain('/keys?');
    expect(service.verify(queryOf(link))).toEqual({ valid: true });
  });

  it('rejects an edited claimer count on an envelope link', () => {
    const { link } = service.buildPrompt({
      token: 'USDC',
      amount: 50,
      count: 5,
      action: 'envelope',
      reason: 'over_limit',
    });

    expect(link).toContain('/envelopes?');
    expect(service.verify({ ...queryOf(link), count: '500' })).toEqual({
      valid: false,
      reason: 'bad_signature',
    });
  });

  it('ignores unsigned decoration rather than failing on it', () => {
    const { link } = service.buildPrompt(payment);
    // `escalated` is presentation and deliberately outside the signature.
    expect(service.verify({ ...queryOf(link), escalated: '1' })).toEqual({ valid: true });
  });
});
