import * as crypto from 'crypto';

/**
 * Placeholder platform ids for accounts that exist before their owner has ever
 * contacted us on that platform.
 *
 * An escrow recipient is created from a handle alone — the sender only typed
 * `@someone`, and no bot API resolves a handle to a numeric id for a user who
 * has never messaged the bot. Those accounts are parked under
 * `pending:<handle>` until `IdentityService.resolveUser` adopts them on the
 * owner's first authenticated contact.
 *
 * The prefix is deliberately impossible to confuse with a real id (numeric on
 * Telegram/Discord, phone numbers on WhatsApp, `U…` on Slack), so a genuine
 * account can never be mistaken for an adoptable one.
 */
export const PROVISIONAL_ID_PREFIX = 'pending:';

/** Builds the placeholder id for a handle. */
export function provisionalPlatformId(handle: string): string {
  // This value is later matched to the platform-provided username in order to
  // adopt a pre-registration recipient. Preserve case so handles such as
  // `@TheAldorax` cannot be silently rewritten or merged with another case.
  return `${PROVISIONAL_ID_PREFIX}${handle.replace(/^@/, '')}`;
}

/**
 * True when an id is a placeholder rather than a real platform id.
 *
 * Delivery code must check this before calling a platform API: the value is
 * not a routable chat, and sending to it only produces `chat not found`.
 */
export function isProvisionalPlatformId(id?: string | null): boolean {
  return !!id && id.startsWith(PROVISIONAL_ID_PREFIX);
}

/**
 * Namespace for a self-serve web signup — someone who arrived at the site
 * directly rather than through a bot deep link or a claim link, and so has no
 * platform identity at all.
 *
 * Unlike `pending:`, this is not a handle waiting to be matched: nobody has
 * asserted anything about who this person is. The id is random precisely so it
 * can never collide with, and therefore never be aimed at, an existing
 * account. It becomes the wallet's derivation salt, so it is permanent for the
 * life of the account even after a real platform is linked on top.
 */
export const WEB_ID_PREFIX = 'web:';

/** Mints a fresh, unguessable id for a self-serve web signup. */
export function webPlatformId(): string {
  return `${WEB_ID_PREFIX}${crypto.randomUUID()}`;
}

/** True when an account was created through self-serve web signup. */
export function isWebPlatformId(id?: string | null): boolean {
  return !!id && id.startsWith(WEB_ID_PREFIX);
}

/**
 * A web signup has no handle to go by, so it gets a generated one. It is a
 * stand-in, not a chosen name: `IdentityService.linkAccount` replaces it with
 * the real handle the moment a platform asserts one.
 */
const WEB_USERNAME_PATTERN = /^web_[0-9a-f]{10}$/;

export function webPlaceholderUsername(): string {
  return `web_${crypto.randomBytes(5).toString('hex')}`;
}

/**
 * True only for a handle this module generated. A username someone chose that
 * merely starts with `web_` will not match the full shape, so a real handle is
 * never mistaken for a placeholder and silently overwritten.
 */
export function isWebPlaceholderUsername(username?: string | null): boolean {
  return !!username && WEB_USERNAME_PATTERN.test(username);
}
