import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Canonical funnel event names. Keep in sync with the growth dashboard query. */
export const FUNNEL_EVENTS = {
  CAMPAIGN_DELIVERED: 'campaign_delivered',
  CAMPAIGN_CLICKED: 'campaign_clicked',
  ACTIVATE_PAGE_VIEWED: 'activate_page_viewed',
  TELEGRAM_DEEPLINK_CLICKED: 'telegram_deeplink_clicked',
  PASSKEY_STARTED: 'passkey_started',
  PASSKEY_COMPLETED: 'passkey_completed',
  WALLET_VERIFIED: 'wallet_verified',
  PAYMENT_CLAIMED: 'payment_claimed',
  WALLET_ACTIVATED: 'wallet_activated',
  FIRST_SEND: 'first_send',
  PAY_IT_FORWARD: 'pay_it_forward',
  REFERRAL_LINK_SHARED: 'referral_link_shared',
  REFERRAL_ACTIVATED: 'referral_activated',
  CAMPAIGN_BADGE_AWARDED: 'campaign_badge_awarded',
  STREAK_MILESTONE: 'streak_milestone',
  WEEKLY_WRAPPED_SENT: 'weekly_wrapped_sent',
} as const;

export interface FunnelAttribution {
  src?: string;
  campaign?: string;
  partner?: string;
  channel?: string;
  platform?: string;
  [key: string]: unknown;
}

/**
 * Append-only growth funnel telemetry.
 *
 * Every method is fire-and-forget safe: analytics failures are logged but never
 * propagate into the user-facing flow that triggered them.
 */
@Injectable()
export class FunnelEventsService {
  private readonly logger = new Logger(FunnelEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records one funnel event.
   *
   * @param dedupeKey when supplied, the event is recorded at most once for that
   *   key — use it for "first ever" milestones and daily retention marks.
   */
  async track(
    event: string,
    options: {
      userId?: string;
      attribution?: FunnelAttribution;
      metadata?: Record<string, unknown>;
      dedupeKey?: string;
    } = {},
  ): Promise<boolean> {
    const { userId, attribution = {}, metadata, dedupeKey } = options;
    const { src, campaign, partner, channel, ...extra } = attribution;

    try {
      // `createMany` + skipDuplicates rather than `create`: a repeat milestone
      // is the expected case, and letting it raise made Prisma log the unique
      // violation at error level on every ordinary duplicate.
      const { count } = await this.prisma.funnelEvent.createMany({
        data: [
          {
            event,
            userId: userId ?? null,
            src: src ?? null,
            campaign: campaign ?? null,
            partner: partner ?? null,
            channel: channel ?? null,
            dedupeKey: dedupeKey ?? null,
            metadata:
              metadata || Object.keys(extra).length
                ? ({ ...extra, ...(metadata ?? {}) } as Prisma.InputJsonValue)
                : undefined,
          },
        ],
        skipDuplicates: true,
      });
      return count > 0;
    } catch (error) {
      // A unique violation on dedupeKey means the milestone already fired.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      this.logger.warn(
        `Failed to record funnel event "${event}": ${(error as Error).message}`,
      );
      return false;
    }
  }

  /** Wallets seeded by a campaign injection. Counted in bulk, not per user. */
  async trackCampaignDelivered(
    campaign: string,
    count: number,
    attribution: FunnelAttribution = {},
  ) {
    return this.track(FUNNEL_EVENTS.CAMPAIGN_DELIVERED, {
      attribution: { ...attribution, campaign },
      metadata: { count },
    });
  }

  /** A campaign or referral link was opened. */
  async trackCampaignClicked(attribution: FunnelAttribution, userId?: string) {
    return this.track(FUNNEL_EVENTS.CAMPAIGN_CLICKED, { userId, attribution });
  }

  /** A pending payment/escrow link was successfully claimed. */
  async trackPaymentClaimed(
    userId: string,
    shortlinkCode: string,
    attribution: FunnelAttribution = {},
  ) {
    return this.track(FUNNEL_EVENTS.PAYMENT_CLAIMED, {
      userId,
      attribution,
      metadata: { shortlinkCode },
      dedupeKey: `${FUNNEL_EVENTS.PAYMENT_CLAIMED}:${shortlinkCode}`,
    });
  }

  /** Passkey registered and smart wallet created. Fires once per user. */
  async trackWalletVerified(userId: string, attribution: FunnelAttribution = {}) {
    return this.track(FUNNEL_EVENTS.WALLET_VERIFIED, {
      userId,
      attribution,
      dedupeKey: `${FUNNEL_EVENTS.WALLET_VERIFIED}:${userId}`,
    });
  }

  /**
   * The user's first value-moving action (send, deposit, or claim).
   * Fires once per user — this is the activation metric.
   */
  async trackWalletActivated(
    userId: string,
    firstActionType: string,
    metadata: Record<string, unknown> = {},
  ) {
    return this.track(FUNNEL_EVENTS.WALLET_ACTIVATED, {
      userId,
      metadata: { firstActionType, ...metadata },
      dedupeKey: `${FUNNEL_EVENTS.WALLET_ACTIVATED}:${userId}`,
    });
  }

  /** Marks a user as active in a retention cohort. Idempotent per user per day. */
  async trackRetention(userId: string, dayN: number) {
    return this.track(`retention.d${dayN}_active`, {
      userId,
      metadata: { dayN },
      dedupeKey: `retention.d${dayN}:${userId}`,
    });
  }

  /** A referee reached the wallet-created milestone, crediting their referrer. */
  async trackReferralActivated(referrerId: string, refereeId: string) {
    return this.track(FUNNEL_EVENTS.REFERRAL_ACTIVATED, {
      userId: referrerId,
      metadata: { refereeId },
      dedupeKey: `${FUNNEL_EVENTS.REFERRAL_ACTIVATED}:${refereeId}`,
    });
  }

  /** A user created their own envelope after claiming one — the viral loop closing. */
  async trackPayItForward(userId: string, sourceEnvelopeId: string) {
    return this.track(FUNNEL_EVENTS.PAY_IT_FORWARD, {
      userId,
      metadata: { sourceEnvelopeId },
    });
  }

  /**
   * Weekly growth review: conversion counts grouped by acquisition source.
   */
  async getFunnelSummary(sinceDays = 7) {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.funnelEvent.groupBy({
      by: ['src', 'campaign', 'event'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });

    const summary = new Map<string, Record<string, number> & { src: string; campaign: string }>();
    for (const row of rows) {
      const key = `${row.src ?? 'unknown'}|${row.campaign ?? 'none'}`;
      const bucket =
        summary.get(key) ??
        ({ src: row.src ?? 'unknown', campaign: row.campaign ?? 'none' } as any);
      bucket[row.event] = row._count._all;
      summary.set(key, bucket);
    }

    return [...summary.values()].map((bucket) => {
      const verified = bucket[FUNNEL_EVENTS.WALLET_VERIFIED] ?? 0;
      const activated = bucket[FUNNEL_EVENTS.WALLET_ACTIVATED] ?? 0;
      const shared = bucket[FUNNEL_EVENTS.REFERRAL_LINK_SHARED] ?? 0;
      return {
        ...bucket,
        // k-factor: invites shared per activated user.
        kFactor: activated > 0 ? Number((shared / activated).toFixed(2)) : 0,
        activationRate: verified > 0 ? Number((activated / verified).toFixed(3)) : 0,
      };
    });
  }
}
