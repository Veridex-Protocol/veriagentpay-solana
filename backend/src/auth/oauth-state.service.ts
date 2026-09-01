import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { RedisService } from '../core/redis.service';

/**
 * Single-use CSRF state for the OAuth redirect flows.
 *
 * `state` was previously taken from the query string, handed to the provider,
 * and on return destructured but never checked. That is OAuth CSRF: an attacker
 * completes the provider handshake themselves, then walks a victim through the
 * callback so the attacker's Discord or Slack identity is linked to the
 * victim's account — or the victim's identity to the attacker's session.
 *
 * The value is minted here, held server-side, and consumed exactly once.
 *
 * @see docs/security-remaining-issues.md — BE-H-03
 */
@Injectable()
export class OAuthStateService {
  private readonly logger = new Logger(OAuthStateService.name);

  /** Long enough that a callback survives a slow consent screen, short enough to bound replay. */
  private static readonly TTL_MS = 10 * 60 * 1000;

  constructor(private readonly redis: RedisService) {}

  private key(provider: string, state: string): string {
    return `oauth:state:${provider}:${state}`;
  }

  /**
   * Sanitizes returnTo to ensure defense-in-depth against open redirect and header injection.
   * Rejects non-relative paths, protocol-relative paths ('//'), and control characters.
   */
  private sanitizeReturnTo(returnTo?: string | null): string | null {
    if (!returnTo || typeof returnTo !== 'string') return null;
    const trimmed = returnTo.trim();
    if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !/[\r\n\x00-\x1f]/.test(trimmed)) {
      return trimmed;
    }
    return null;
  }

  /** Mint a state value and remember it. */
  async issue(provider: string, returnTo?: string): Promise<string> {
    const state = crypto.randomBytes(32).toString('base64url');
    const safeReturnTo = this.sanitizeReturnTo(returnTo);
    await this.redis.setJson(
      this.key(provider, state),
      { provider, returnTo: safeReturnTo, issuedAt: Date.now() },
      OAuthStateService.TTL_MS,
    );
    return state;
  }

  /**
   * Verify and consume a state value atomically.
   *
   * @returns the stored context, or `null` when the state is absent, expired, or
   *          already used. Callers must treat `null` as a failed handshake.
   * @dev Atomic GETDEL avoids TOCTOU race in multi-replica deployments.
   */
  async consume(provider: string, state?: string): Promise<{ returnTo: string | null } | null> {
    if (!state || typeof state !== 'string') return null;

    const key = this.key(provider, state);
    const stored = await this.redis.takeJson<{ provider: string; returnTo: string | null }>(key);
    if (!stored || stored.provider !== provider) return null;

    return { returnTo: stored.returnTo };
  }
}
