import {
  Injectable,
  Logger,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request } from 'express';
import * as crypto from 'crypto';
import nacl from 'tweetnacl';
import { safeEqual } from '../common/crypto.util';
import {
  TELEGRAM_WEBHOOK_SECRET,
  WHATSAPP_APP_SECRET,
  WHATSAPP_VERIFY_TOKEN,
  DISCORD_PUBLIC_KEY,
  SLACK_SIGNING_SECRET,
} from '../config/secrets';

/**
 * Authenticity checks for inbound platform webhooks.
 *
 * Every one of these endpoints previously accepted an unsigned request body and
 * derived the acting user from a field inside it — so forging an `update` with
 * someone else's numeric id was full impersonation, including the ability to
 * spend their funds through bot commands.
 *
 * Two invariants hold across all four:
 *
 *  - **Verification runs over the raw body**, never a re-serialization.
 *    `JSON.stringify(req.body)` does not reproduce the bytes the platform
 *    signed (key order, whitespace, unicode escaping all differ), so an HMAC
 *    computed over it would reject genuine traffic and tempt a "skip if it
 *    doesn't match" workaround.
 *  - **A missing signature is a rejection, not a skip.** An unconfigured
 *    platform refuses its webhooks rather than accepting them unverified.
 *
 * @see docs/audit/11th-august-2026-1.md — SEC-007
 */
@Injectable()
export class WebhookVerifierService {
  private readonly logger = new Logger(WebhookVerifierService.name);

  /** The exact bytes the platform signed. */
  private rawBody(req: Request): Buffer {
    const raw = (req as any).rawBody;
    if (!Buffer.isBuffer(raw)) {
      // `rawBody: true` is set in main.ts; if it is ever removed, fail closed
      // rather than silently falling back to a re-serialized body.
      throw new ServiceUnavailableException('Raw request body unavailable for signature verification');
    }
    return raw;
  }

  /**
   * Telegram: a shared secret echoed in a header, registered via `setWebhook`
   * with `secret_token=<TELEGRAM_WEBHOOK_SECRET>`.
   */
  verifyTelegram(req: Request): void {
    if (!TELEGRAM_WEBHOOK_SECRET) {
      throw new ServiceUnavailableException('Telegram webhook secret is not configured');
    }
    const provided = req.headers['x-telegram-bot-api-secret-token'];
    if (!safeEqual(typeof provided === 'string' ? provided : undefined, TELEGRAM_WEBHOOK_SECRET)) {
      this.logger.warn('Rejected Telegram webhook: invalid or missing secret token');
      throw new UnauthorizedException('Invalid Telegram webhook secret');
    }
  }

  /** WhatsApp Cloud API: HMAC-SHA256 of the raw body under the Meta app secret. */
  verifyWhatsApp(req: Request): void {
    if (!WHATSAPP_APP_SECRET) {
      throw new ServiceUnavailableException('WhatsApp app secret is not configured');
    }
    const provided = req.headers['x-hub-signature-256'];
    if (typeof provided !== 'string') {
      throw new UnauthorizedException('Missing X-Hub-Signature-256');
    }

    const expected =
      'sha256=' +
      crypto.createHmac('sha256', WHATSAPP_APP_SECRET).update(this.rawBody(req)).digest('hex');

    if (!safeEqual(provided, expected)) {
      this.logger.warn('Rejected WhatsApp webhook: signature mismatch');
      throw new UnauthorizedException('Invalid X-Hub-Signature-256');
    }
  }

  /** The GET handshake Meta performs when a webhook URL is registered. */
  verifyWhatsAppHandshake(mode: string, token: string): boolean {
    if (!WHATSAPP_VERIFY_TOKEN) {
      throw new ServiceUnavailableException('WhatsApp verify token is not configured');
    }
    return mode === 'subscribe' && safeEqual(token, WHATSAPP_VERIFY_TOKEN);
  }

  /**
   * Discord: Ed25519 over `timestamp || rawBody`.
   *
   * Discord actively probes this — an application that answers the PING without
   * verifying is rejected at registration time.
   */
  verifyDiscord(req: Request): void {
    if (!DISCORD_PUBLIC_KEY) {
      throw new ServiceUnavailableException('Discord public key is not configured');
    }
    const signature = req.headers['x-signature-ed25519'];
    const timestamp = req.headers['x-signature-timestamp'];
    if (typeof signature !== 'string' || typeof timestamp !== 'string') {
      throw new UnauthorizedException('Missing Discord signature headers');
    }

    let verified = false;
    try {
      verified = nacl.sign.detached.verify(
        Buffer.concat([Buffer.from(timestamp, 'utf8'), this.rawBody(req)]),
        Buffer.from(signature, 'hex'),
        Buffer.from(DISCORD_PUBLIC_KEY, 'hex'),
      );
    } catch (e: any) {
      // Malformed hex in either header lands here.
      this.logger.warn(`Discord signature verification error: ${e.message}`);
      verified = false;
    }

    if (!verified) {
      this.logger.warn('Rejected Discord interaction: invalid Ed25519 signature');
      throw new UnauthorizedException('Invalid Discord signature');
    }
  }

  /**
   * Slack: `v0=` HMAC-SHA256 over `v0:timestamp:rawBody`, with a 5-minute
   * timestamp window to bound replay.
   */
  verifySlack(req: Request): void {
    if (!SLACK_SIGNING_SECRET) {
      throw new ServiceUnavailableException('Slack signing secret is not configured');
    }
    const timestamp = req.headers['x-slack-request-timestamp'];
    const provided = req.headers['x-slack-signature'];
    if (typeof timestamp !== 'string' || typeof provided !== 'string') {
      throw new UnauthorizedException('Missing Slack signature headers');
    }

    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(age) || age > 300) {
      throw new UnauthorizedException('Slack request timestamp outside tolerance');
    }

    const base = `v0:${timestamp}:${this.rawBody(req).toString('utf8')}`;
    const expected =
      'v0=' + crypto.createHmac('sha256', SLACK_SIGNING_SECRET).update(base).digest('hex');

    if (!safeEqual(provided, expected)) {
      this.logger.warn('Rejected Slack request: signature mismatch');
      throw new UnauthorizedException('Invalid Slack signature');
    }
  }
}
