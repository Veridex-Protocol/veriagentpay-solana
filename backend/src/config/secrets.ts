/**
 * Centralized secret loading.
 *
 * Every secret in the platform is read from here and nowhere else. The point is
 * to remove a class of silent failure: previously each call site carried its own
 * `process.env.X || '<literal>'` fallback, so a missing environment variable
 * meant the service kept running under a key that is printed in the repository
 * rather than failing.
 *
 * These are module-level constants, so a misconfigured deployment throws during
 * import — the process refuses to start instead of serving traffic with a
 * publicly-known signing key.
 *
 * @see docs/audit/11th-august-2026-1.md — SEC-008
 */

/**
 * Reads a required secret, or throws with an actionable message.
 *
 * @param name       Environment variable name.
 * @param minLength  Minimum acceptable length. Signing keys should be >= 32
 *                   characters of real entropy (`openssl rand -hex 32`).
 */
function required(name: string, minLength = 32): string {
  const value = process.env[name];
  if (!value || value.length < minLength) {
    throw new Error(
      `${name} must be set to at least ${minLength} characters. ` +
        `Generate one with: openssl rand -hex 32`,
    );
  }
  return value;
}

/**
 * Reads an optional secret. Used only for integrations that are legitimately
 * absent in some deployments (a bot that is not configured for this instance).
 *
 * Consumers MUST fail closed when the value is undefined — never fall back to a
 * default. A missing WhatsApp app secret means WhatsApp webhooks are refused,
 * not that they are accepted unverified.
 */
function optional(name: string, minLength = 16): string | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  if (value.length < minLength) {
    throw new Error(`${name} is set but shorter than ${minLength} characters; refusing to use it.`);
  }
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core authentication
// ─────────────────────────────────────────────────────────────────────────────

/** Signs and verifies user access tokens. */
export const JWT_SECRET = required('JWT_SECRET');

/**
 * Signs and verifies admin tokens.
 *
 * Deliberately independent of {@link JWT_SECRET}: the previous derivation
 * (`JWT_SECRET + '_admin'`) meant a compromise of one was a compromise of both.
 */
export const ADMIN_JWT_SECRET = required('ADMIN_JWT_SECRET');

/** HMACs the signed onboarding/deep links produced by PlatformService. */
export const DEEPLINK_SECRET = required('DEEPLINK_SECRET');

/** HMACs bot inline-button action payloads (approve/reject). */
export const INTERACTIVE_ACTION_SECRET = required('INTERACTIVE_ACTION_SECRET');

/**
 * KMS key that wraps the per-record data keys encrypting session private keys.
 *
 * Preferred over {@link SESSION_KEY_MASTER_SECRET}. With a local master secret,
 * this process holds material that recovers every user's session key — and it
 * holds {@link RELAYER_PRIVATE_KEY} too, so one compromise yields both, offline
 * and unlogged. Under KMS the wrapping key never enters the process: an
 * attacker can still request decryptions while they hold the IAM credentials,
 * but each one is a CloudTrail event that can be alarmed and rate-limited, and
 * revocation is a key-policy change rather than a redeploy.
 */
export const SESSION_KEY_KMS_KEY_ID = process.env.SESSION_KEY_KMS_KEY_ID || undefined;

/** Region for the session-key CMK. Falls back to the SDK's own resolution. */
export const SESSION_KEY_KMS_REGION = process.env.AWS_REGION || process.env.SESSION_KEY_KMS_REGION || undefined;

/**
 * Legacy local wrapping key for session data keys.
 *
 * Optional now that KMS can do the wrapping, but it must stay configured until
 * every stored row has been re-wrapped — rows written before the migration can
 * only be read with it. `scripts/backfill-session-keys-kms.ts` reports how many
 * remain.
 */
export const SESSION_KEY_MASTER_SECRET = optional('SESSION_KEY_MASTER_SECRET', 32);

// ─────────────────────────────────────────────────────────────────────────────
// Admin login
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Google OAuth client id used to verify admin ID tokens.
 *
 * Required: admin login has no other credential path, so an unset value would
 * leave the admin panel unreachable rather than insecure — which is the correct
 * failure direction.
 */
export const GOOGLE_OAUTH_CLIENT_ID = required('GOOGLE_OAUTH_CLIENT_ID', 10);

// ─────────────────────────────────────────────────────────────────────────────
// Platform webhook verification
// ─────────────────────────────────────────────────────────────────────────────

/** Compared against Telegram's `X-Telegram-Bot-Api-Secret-Token` header. */
export const TELEGRAM_WEBHOOK_SECRET = optional('TELEGRAM_WEBHOOK_SECRET', 32);

/** Meta app secret; keys the `X-Hub-Signature-256` HMAC on WhatsApp webhooks. */
export const WHATSAPP_APP_SECRET = optional('WHATSAPP_APP_SECRET', 16);

/** Token echoed during Meta's GET webhook handshake. */
export const WHATSAPP_VERIFY_TOKEN = optional('WHATSAPP_VERIFY_TOKEN', 16);

/** Discord application public key; verifies Ed25519 interaction signatures. */
export const DISCORD_PUBLIC_KEY = optional('DISCORD_PUBLIC_KEY', 32);

/** Slack signing secret; keys the `v0=` request HMAC. */
export const SLACK_SIGNING_SECRET = optional('SLACK_SIGNING_SECRET', 16);

// ─────────────────────────────────────────────────────────────────────────────
// Chain
// ─────────────────────────────────────────────────────────────────────────────

/**
 * KMS key the relayer signs with. Alias or ARN.
 *
 * Preferred over {@link RELAYER_PRIVATE_KEY}: the private key never enters this
 * process, every signature is a CloudTrail event, and access is revoked with a
 * key policy rather than a redeploy. The material is *imported* rather than
 * generated so it stays portable — `PayVaultFactory.deployer` is immutable, so
 * a forced address change would mean a new factory and a passkey-authorised
 * ownership rotation on every existing vault.
 */
export const RELAYER_KMS_KEY_ID = process.env.RELAYER_KMS_KEY_ID || undefined;

/**
 * Relayer EOA key. `0x` + 64 hex characters.
 *
 * Optional once {@link RELAYER_KMS_KEY_ID} is set, and it should be *removed*
 * after the migration — leaving it in place means the key is still on the host,
 * which is the thing moving to KMS was meant to stop.
 */
export const RELAYER_PRIVATE_KEY = RELAYER_KMS_KEY_ID
  ? optional('RELAYER_PRIVATE_KEY', 66)
  : required('RELAYER_PRIVATE_KEY', 66);

/**
 * Signs USD prices for `SignedPriceOracle`.
 *
 * Must differ from the relayer — `Deploy.s.sol` hard-requires it — so a relayer
 * compromise cannot also lift every USD spending ceiling. Optional: the USD
 * layer ships inert, and an absent signer leaves prices unpublished, which
 * disables the ceiling rather than halting payments (ADR-008).
 */
export const PRICE_SIGNER_KMS_KEY_ID = process.env.PRICE_SIGNER_KMS_KEY_ID || undefined;

/**
 * Raw price-signer key. Local development only.
 *
 * Optional once {@link PRICE_SIGNER_KMS_KEY_ID} is set, and it should be
 * removed from testnet and mainnet after the import — a raw key on the host is
 * what moving to KMS exists to eliminate.
 */
export const PRICE_ORACLE_SIGNER_PRIVATE_KEY = optional('PRICE_ORACLE_SIGNER_PRIVATE_KEY', 66);

/** Deployed `SignedPriceOracle`. Without it there is nowhere to publish. */
export const PRICE_ORACLE_ADDRESS = process.env.PRICE_ORACLE_ADDRESS || undefined;

/**
 * Asserts that every required secret is present.
 *
 * Importing this module already performs the checks; this exists so `main.ts`
 * can force evaluation before Nest starts wiring modules, turning a late
 * failure deep in DI into a clear message at boot.
 */
export function assertSecretsLoaded(): void {
  // Referencing the constants is enough — they threw at import time if invalid.
  const loaded = [
    JWT_SECRET,
    ADMIN_JWT_SECRET,
    DEEPLINK_SECRET,
    INTERACTIVE_ACTION_SECRET,
    GOOGLE_OAUTH_CLIENT_ID,
  ];
  if (loaded.some((value) => !value)) {
    throw new Error('Secret validation failed after load. This should be unreachable.');
  }

  // The relayer must be able to sign, by one mechanism or the other. Listing
  // RELAYER_PRIVATE_KEY as unconditionally required would break the very
  // deployment this migration produces: KMS configured, local key removed.
  if (!RELAYER_KMS_KEY_ID && !RELAYER_PRIVATE_KEY) {
    throw new Error(
      'Set RELAYER_KMS_KEY_ID (preferred) or RELAYER_PRIVATE_KEY. Without one ' +
        'the relayer cannot sign and no transaction can be submitted.',
    );
  }

  // Session data keys must be wrapped by something. Either mechanism alone is
  // a valid configuration — KMS for production, the local secret for a
  // developer machine — but neither means session private keys would be stored
  // with nothing protecting them, so refuse to start.
  if (!SESSION_KEY_KMS_KEY_ID && !SESSION_KEY_MASTER_SECRET) {
    throw new Error(
      'Set SESSION_KEY_KMS_KEY_ID (preferred) or SESSION_KEY_MASTER_SECRET. ' +
        'Without one, session private keys have no wrapping key. ' +
        'Keep SESSION_KEY_MASTER_SECRET set alongside KMS until the backfill ' +
        'has re-wrapped every existing row.',
    );
  }
}
