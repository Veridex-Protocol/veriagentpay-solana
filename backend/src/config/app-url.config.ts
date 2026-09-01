/**
 * Centralized production app base URL resolver.
 *
 * Reads from environment (PUBLIC_APP_URL takes precedence) and strips any
 * trailing slash so callers can safely concatenate paths. Defaults to the
 * production domain so we never accidentally leak a devtunnel URL.
 */

const PRODUCTION_APP_URL = 'https://veriagentpay.xyz';

/** Hostnames that must never be served to end users in production. */
const NON_PRODUCTION_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /\.devtunnels\.ms$/i,
  /\.ngrok(-free)?\.(io|app|dev)$/i,
  /\.loca\.lt$/i,
  /\.trycloudflare\.com$/i,
];

function assertProductionSafe(raw: string): void {
  if (process.env.NODE_ENV !== 'production') return;

  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    throw new Error(
      `[app-url.config] Invalid app base URL "${raw}". Set PUBLIC_APP_URL to a fully qualified https URL.`,
    );
  }

  if (NON_PRODUCTION_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
    throw new Error(
      `[app-url.config] Refusing to boot: app base URL "${raw}" resolves to a non-production host ` +
        `("${host}"). Set PUBLIC_APP_URL to the production domain (e.g. ${PRODUCTION_APP_URL}).`,
    );
  }

  if (!raw.startsWith('https://')) {
    throw new Error(
      `[app-url.config] Refusing to boot: app base URL "${raw}" must use https in production.`,
    );
  }
}

export function getAppBaseUrl(): string {
  const raw =
    process.env.PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.FRONTEND_URL ||
    PRODUCTION_APP_URL;

  const normalized = raw.replace(/\/$/, '');
  assertProductionSafe(normalized);
  return normalized;
}

/**
 * Relying Party ID used for WebAuthn/passkey ceremonies.
 * Must be the registrable domain suffix of the origin serving the page.
 */
export function getRpId(): string {
  if (process.env.RP_ID) return process.env.RP_ID;
  try {
    return new URL(getAppBaseUrl()).hostname;
  } catch {
    return 'veriagentpay.xyz';
  }
}

/** Telegram bot username without the leading @. */
export function getTelegramBotUsername(): string {
  return (process.env.TELEGRAM_BOT_USERNAME || 'VeriAgentPayBot').replace(/^@/, '');
}

/** Builds a Telegram deep link with an optional start payload. */
export function getTelegramDeepLink(startPayload?: string): string {
  const base = `https://t.me/${getTelegramBotUsername()}`;
  return startPayload ? `${base}?start=${encodeURIComponent(startPayload)}` : base;
}
