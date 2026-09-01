/**
 * Which social platforms this deployment actually serves.
 *
 * Telegram is the only surface with full payment parity: `/pay` routes to
 * on-chain transfers only in the Telegram driver, and `/envelope` is
 * unimplemented on Discord and Slack. Leaving those bots reachable advertises
 * commands that silently do the wrong thing or nothing at all, so the default
 * is Telegram-only and the rest must be opted into explicitly.
 *
 * Override with a comma-separated `ENABLED_PLATFORMS` (e.g.
 * `ENABLED_PLATFORMS=telegram,whatsapp`). Re-enabling a platform is a config
 * change, not a code change — no driver was deleted.
 *
 * @see docs/final-pre-launch-gap-analysis-and-plan.md — C-014, C-015
 */

export const SUPPORTED_PLATFORMS = ['telegram', 'whatsapp', 'discord', 'slack'] as const;

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

/** Platforms served when `ENABLED_PLATFORMS` is unset. */
const DEFAULT_ENABLED_PLATFORMS: readonly SupportedPlatform[] = ['telegram'];

function parseEnabledPlatforms(): Set<SupportedPlatform> {
  const raw = process.env.ENABLED_PLATFORMS?.trim();
  if (!raw) return new Set(DEFAULT_ENABLED_PLATFORMS);

  const requested = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  const unknown = requested.filter(
    (entry) => !SUPPORTED_PLATFORMS.includes(entry as SupportedPlatform),
  );
  if (unknown.length) {
    throw new Error(
      `[platforms.config] Unknown platform(s) in ENABLED_PLATFORMS: ${unknown.join(', ')}. ` +
        `Supported: ${SUPPORTED_PLATFORMS.join(', ')}.`,
    );
  }

  return new Set(requested as SupportedPlatform[]);
}

let cached: Set<SupportedPlatform> | null = null;

function enabledPlatforms(): Set<SupportedPlatform> {
  if (!cached) cached = parseEnabledPlatforms();
  return cached;
}

/** True when this deployment should accept traffic for `platform`. */
export function isPlatformEnabled(platform: SupportedPlatform): boolean {
  return enabledPlatforms().has(platform);
}

/** Enabled platforms, for startup logging and health output. */
export function getEnabledPlatforms(): SupportedPlatform[] {
  return SUPPORTED_PLATFORMS.filter((platform) => enabledPlatforms().has(platform));
}

/** Test seam: clears the memoized parse so env changes take effect. */
export function resetPlatformConfigCache(): void {
  cached = null;
}
