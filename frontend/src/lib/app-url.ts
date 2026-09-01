/**
 * Centralized app base URL resolver for the frontend.
 *
 * On the client we always trust `window.location.origin` so share links match
 * whatever host the user is actually on. On the server we fall back to the
 * configured public URL, and finally to the production domain, never a
 * devtunnel or localhost URL.
 */

export const PRODUCTION_APP_URL = 'https://veriagentpay.xyz';

/** Sanitizes malformed values such as the historic `https://https://host` typo. */
function normalize(raw: string | undefined): string | null {
  if (!raw) return null;
  let value = raw.trim().replace(/\/+$/, '');
  if (!value) return null;

  // Collapse accidental repeated schemes: "https://https://host" -> "https://host"
  while (/^https?:\/\/https?:\/\//i.test(value)) {
    value = value.replace(/^https?:\/\//i, '');
  }

  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  try {
    // eslint-disable-next-line no-new
    new URL(value);
  } catch {
    return null;
  }
  return value;
}

export function getAppBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return normalize(process.env.NEXT_PUBLIC_APP_URL) ?? PRODUCTION_APP_URL;
}

/** Builds an absolute URL for a path within the app. */
export function appUrl(path = '/'): string {
  const base = getAppBaseUrl();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Telegram bot username without the leading @. */
export function getTelegramBotUsername(): string {
  return (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'VeriAgentPayBot').replace(/^@/, '');
}

/** Builds a Telegram deep link with an optional `start` payload. */
export function telegramDeepLink(startPayload?: string): string {
  const base = `https://t.me/${getTelegramBotUsername()}`;
  return startPayload ? `${base}?start=${encodeURIComponent(startPayload)}` : base;
}

/** Attribution params appended to every shareable link so growth can be measured. */
export interface LinkAttribution {
  ref?: string;
  src?: string;
  campaign?: string;
  partner?: string;
  channel?: string;
}

export function withAttribution(url: string, attribution: LinkAttribution): string {
  const entries = Object.entries(attribution).filter(([, v]) => Boolean(v)) as [string, string][];
  if (entries.length === 0) return url;

  try {
    const parsed = new URL(url, getAppBaseUrl());
    for (const [key, value] of entries) {
      parsed.searchParams.set(key, value);
    }
    return parsed.toString();
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    const query = entries
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return `${url}${separator}${query}`;
  }
}
