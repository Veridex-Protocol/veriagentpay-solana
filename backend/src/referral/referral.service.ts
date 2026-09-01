import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { UserActivityAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import { getAppBaseUrl } from '../config/app-url.config';
import { NOTIFICATION_SERVICE, type UserNotifier } from '../common/service-contracts';
import { BADGES_SERVICE, type BadgeAwarder } from '../common/service-contracts';
import { ActivityService } from '../activity/activity.service';

/**
 * Staged referral rewards.
 *
 * Points are released as the referee proves real usage rather than all at once
 * on signup, so a farm of throwaway accounts earns nothing.
 */
export const REFERRAL_REWARDS = {
  /** Referrer, once the referee finishes passkey + wallet creation. */
  WALLET_CREATED: 25,
  /** Referee welcome bonus, paid at the same milestone. */
  REFEREE_WELCOME: 100,
  /** Referrer, once the referee completes a qualifying first send. */
  FIRST_SEND: 25,
  /** Referrer, once the referee's deposit has been held for 7 days. */
  DEPOSIT_RETAINED_D7: 50,
} as const;

/** A first send must clear this USD value before it counts as activation. */
export const MIN_QUALIFYING_SEND_USD = 5;

/** Anti-Sybil guardrails. */
export const REFERRAL_LIMITS = {
  /** Max referrals a single user may register per rolling 24h window. */
  MAX_PER_DAY: 10,
  /** A referee created within this window of the referrer is treated as a ring. */
  MIN_ACCOUNT_AGE_GAP_MS: 24 * 60 * 60 * 1000,
  /** Days a deposit must be held before the retention milestone pays out. */
  RETENTION_DAYS: 7,
} as const;

export interface ReferralAttribution {
  src?: string;
  campaign?: string;
  partner?: string;
  channel?: string;
}

export type ReferralRejectionReason =
  | 'unknown_code'
  | 'self_referral'
  | 'already_referred'
  | 'expired'
  | 'suspended'
  | 'duplicate_device'
  | 'account_age_gap'
  | 'velocity_limit';

export interface ReferralResult {
  accepted: boolean;
  reason?: ReferralRejectionReason;
}

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_SERVICE)
    private readonly unifiedNotificationService: UserNotifier,
    // Injected by token rather than by class: importing `BadgesService` here,
    // which imports this file back, is a module cycle that `forwardRef` cannot
    // break — see `service-contracts.ts`.
    @Inject(BADGES_SERVICE)
    private readonly badgesService?: BadgeAwarder,
    private readonly activityService?: ActivityService,
  ) {}

  /**
   * Generates or retrieves a unique referral code for a user.
   */
  async getOrCreateReferralCode(userId: string): Promise<string> {
    const existing = await this.prisma.referralCode.findUnique({ where: { userId } });
    if (existing) return existing.code;

    // Retry on the (astronomically unlikely) code collision rather than 500ing.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = `VERI-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      try {
        const created = await this.prisma.referralCode.create({ data: { userId, code } });
        return created.code;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          // Either the code collided or another request created this user's code first.
          const raced = await this.prisma.referralCode.findUnique({ where: { userId } });
          if (raced) return raced.code;
          continue;
        }
        throw error;
      }
    }
    throw new Error('Unable to allocate a unique referral code');
  }

  /**
   * Stage 1 — records the referral relationship at signup. Awards **no** points.
   *
   * Points begin flowing at {@link markWalletCreated}. Returns a structured
   * result so callers can log why an attribution was rejected.
   */
  async processReferral(
    referrerCode: string,
    refereeUserId: string,
    attribution: ReferralAttribution = {},
  ): Promise<ReferralResult> {
    const refCode = await this.prisma.referralCode.findUnique({
      where: { code: referrerCode.trim().toUpperCase() },
      include: { user: true },
    });

    if (!refCode) {
      return { accepted: false, reason: 'unknown_code' };
    }

    // Click counts are tracked even for rejected attributions — they measure reach.
    await this.prisma.referralCode
      .update({ where: { id: refCode.id }, data: { clicks: { increment: 1 } } })
      .catch(() => undefined);

    if (refCode.userId === refereeUserId) {
      return { accepted: false, reason: 'self_referral' };
    }

    const existingReferral = await this.prisma.referral.findUnique({
      where: { refereeId: refereeUserId },
    });
    if (existingReferral) {
      return { accepted: false, reason: 'already_referred' };
    }

    const rejection = await this.checkAntiSybil(refCode.userId, refereeUserId);
    if (rejection) {
      this.logger.warn(
        `Referral rejected (${rejection}): referrer=${refCode.userId} referee=${refereeUserId}`,
      );
      return { accepted: false, reason: rejection };
    }

    try {
      await this.prisma.referral.create({
        data: {
          referrerId: refCode.userId,
          refereeId: refereeUserId,
          points: 0,
          src: attribution.src,
          campaign: attribution.campaign,
          partner: attribution.partner,
          channel: attribution.channel,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Concurrent attribution for the same referee — first writer wins.
        return { accepted: false, reason: 'already_referred' };
      }
      throw error;
    }

    await this.activityService
      ?.record({
        userIdentifier: refereeUserId,
        action: UserActivityAction.REFERRAL_REGISTERED,
        amount: 0,
        metadata: { referrerId: refCode.userId, code: referrerCode, ...attribution },
      })
      .catch(() => {});

    this.logger.log(
      `Referral registered (stage 1, 0 pts): referrer=${refCode.userId} referee=${refereeUserId}`,
    );
    return { accepted: true };
  }

  /**
   * Returns a rejection reason when the pairing looks like self-dealing, or
   * null when the referral may proceed.
   */
  private async checkAntiSybil(
    referrerId: string,
    refereeId: string,
  ): Promise<ReferralRejectionReason | null> {
    const [referrer, referee] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: referrerId },
        select: { id: true, createdAt: true, deviceFingerprint: true },
      }),
      this.prisma.user.findUnique({
        where: { id: refereeId },
        select: { id: true, createdAt: true, deviceFingerprint: true },
      }),
    ]);

    if (!referrer || !referee) return 'unknown_code';

    // Same physical device on both ends of the referral.
    if (
      referrer.deviceFingerprint &&
      referee.deviceFingerprint &&
      referrer.deviceFingerprint === referee.deviceFingerprint
    ) {
      return 'duplicate_device';
    }

    // A referrer account minted moments before the referee is a ring, not a friend.
    const ageGapMs = referee.createdAt.getTime() - referrer.createdAt.getTime();
    if (ageGapMs < REFERRAL_LIMITS.MIN_ACCOUNT_AGE_GAP_MS) {
      return 'account_age_gap';
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCount = await this.prisma.referral.count({
      where: { referrerId, createdAt: { gte: since } },
    });
    if (recentCount >= REFERRAL_LIMITS.MAX_PER_DAY) {
      return 'velocity_limit';
    }

    return null;
  }

  /**
   * Stage 2 — the referee finished passkey + wallet creation.
   * Awards the referrer {@link REFERRAL_REWARDS.WALLET_CREATED} and pays the
   * referee their welcome bonus. Idempotent.
   */
  async markWalletCreated(refereeUserId: string): Promise<boolean> {
    const referral = await this.prisma.referral.findUnique({
      where: { refereeId: refereeUserId },
    });
    if (!referral || referral.walletCreated) return false;

    // Conditional update doubles as the idempotency lock under concurrency.
    const claimed = await this.prisma.referral.updateMany({
      where: { id: referral.id, walletCreated: false },
      data: {
        walletCreated: true,
        walletCreatedAt: new Date(),
        points: { increment: REFERRAL_REWARDS.WALLET_CREATED },
      },
    });
    if (claimed.count !== 1) return false;

    await this.prisma.$transaction([
      this.prisma.rewardPoint.create({
        data: {
          userId: referral.referrerId,
          points: REFERRAL_REWARDS.WALLET_CREATED,
          reason: 'REFERRAL_WALLET_CREATED',
        },
      }),
      this.prisma.rewardPoint.create({
        data: {
          userId: refereeUserId,
          points: REFERRAL_REWARDS.REFEREE_WELCOME,
          reason: 'REFERRAL_SIGNUP_BONUS',
        },
      }),
    ]);

    await this.activityService
      ?.record({
        userIdentifier: referral.referrerId,
        action: UserActivityAction.REFERRAL_REWARDED,
        amount: REFERRAL_REWARDS.WALLET_CREATED,
        metadata: { refereeId: refereeUserId, milestone: 'wallet_created' },
      })
      .catch(() => {});

    this.notify(
      referral.referrerId,
      '🎁 Referral milestone!',
      `Your invite created their wallet. +${REFERRAL_REWARDS.WALLET_CREATED} VERI Points.`,
      REFERRAL_REWARDS.WALLET_CREATED,
      '/referrals',
    );
    this.notify(
      refereeUserId,
      '🎁 Welcome bonus!',
      `Welcome to VeriAgent Pay! +${REFERRAL_REWARDS.REFEREE_WELCOME} VERI Points to get you started.`,
      REFERRAL_REWARDS.REFEREE_WELCOME,
      '/dashboard',
    );

    this.badgesService
      ?.checkAndAwardBadges(referral.referrerId)
      .catch((err) => this.logger.warn(`Badge check failed: ${err.message}`));

    this.logger.log(
      `Referral stage 2: referrer=${referral.referrerId} +${REFERRAL_REWARDS.WALLET_CREATED}`,
    );
    return true;
  }

  /**
   * Stage 3 — the referee completed a qualifying first send (≥ $5).
   * Awards the referrer {@link REFERRAL_REWARDS.FIRST_SEND}. Idempotent.
   */
  async markFirstSend(refereeUserId: string, amountUsd: number): Promise<boolean> {
    if (amountUsd < MIN_QUALIFYING_SEND_USD) return false;

    const referral = await this.prisma.referral.findUnique({
      where: { refereeId: refereeUserId },
    });
    if (!referral || referral.firstSendCompleted) return false;

    // The wallet-creation milestone must land first so points stay ordered.
    if (!referral.walletCreated) {
      await this.markWalletCreated(refereeUserId);
    }

    const claimed = await this.prisma.referral.updateMany({
      where: { id: referral.id, firstSendCompleted: false },
      data: {
        firstSendCompleted: true,
        firstSendAt: new Date(),
        points: { increment: REFERRAL_REWARDS.FIRST_SEND },
      },
    });
    if (claimed.count !== 1) return false;

    await this.prisma.rewardPoint.create({
      data: {
        userId: referral.referrerId,
        points: REFERRAL_REWARDS.FIRST_SEND,
        reason: 'REFERRAL_FIRST_SEND',
      },
    });

    await this.activityService
      ?.record({
        userIdentifier: referral.referrerId,
        action: UserActivityAction.REFERRAL_REWARDED,
        amount: REFERRAL_REWARDS.FIRST_SEND,
        metadata: { refereeId: refereeUserId, milestone: 'first_send', amountUsd },
      })
      .catch(() => {});

    this.notify(
      referral.referrerId,
      '🚀 Your invite is active!',
      `They just sent their first payment. +${REFERRAL_REWARDS.FIRST_SEND} VERI Points.`,
      REFERRAL_REWARDS.FIRST_SEND,
      '/referrals',
    );

    this.logger.log(
      `Referral stage 3: referrer=${referral.referrerId} +${REFERRAL_REWARDS.FIRST_SEND}`,
    );
    return true;
  }

  /**
   * Stage 4 — the referee has held a deposit for 7 days.
   * Driven by {@link ReferralMilestoneCron}. Idempotent.
   */
  async markDepositRetainedD7(refereeUserId: string): Promise<boolean> {
    const referral = await this.prisma.referral.findUnique({
      where: { refereeId: refereeUserId },
    });
    if (!referral || referral.depositRetainedD7) return false;

    const claimed = await this.prisma.referral.updateMany({
      where: { id: referral.id, depositRetainedD7: false },
      data: {
        depositRetainedD7: true,
        milestoneCompletedAt: new Date(),
        points: { increment: REFERRAL_REWARDS.DEPOSIT_RETAINED_D7 },
      },
    });
    if (claimed.count !== 1) return false;

    await this.prisma.rewardPoint.create({
      data: {
        userId: referral.referrerId,
        points: REFERRAL_REWARDS.DEPOSIT_RETAINED_D7,
        reason: 'REFERRAL_DEPOSIT_RETAINED_D7',
      },
    });

    await this.activityService
      ?.record({
        userIdentifier: referral.referrerId,
        action: UserActivityAction.REFERRAL_REWARDED,
        amount: REFERRAL_REWARDS.DEPOSIT_RETAINED_D7,
        metadata: { refereeId: refereeUserId, milestone: 'deposit_retained_d7' },
      })
      .catch(() => {});

    this.notify(
      referral.referrerId,
      '💎 Referral fully activated!',
      `Your invite kept their savings for 7 days. +${REFERRAL_REWARDS.DEPOSIT_RETAINED_D7} VERI Points.`,
      REFERRAL_REWARDS.DEPOSIT_RETAINED_D7,
      '/referrals',
    );

    this.badgesService
      ?.checkAndAwardBadges(referral.referrerId)
      .catch((err) => this.logger.warn(`Badge check failed: ${err.message}`));

    this.logger.log(
      `Referral stage 4: referrer=${referral.referrerId} +${REFERRAL_REWARDS.DEPOSIT_RETAINED_D7}`,
    );
    return true;
  }

  /**
   * Records the device fingerprint used at signup so future referrals from the
   * same device can be rejected. Only written once — never overwritten, so a
   * user cannot clear it by signing in elsewhere.
   */
  async recordDeviceFingerprint(userId: string, fingerprint: string): Promise<void> {
    if (!fingerprint) return;
    await this.prisma.user
      .updateMany({
        where: { id: userId, deviceFingerprint: null },
        data: { deviceFingerprint: fingerprint },
      })
      .catch((err) => this.logger.warn(`Failed to record device fingerprint: ${err.message}`));
  }

  /**
   * Fetches referral status and progress breakdown for a user.
   */
  async getUserReferralStats(userId: string) {
    const code = await this.getOrCreateReferralCode(userId);

    const [totalPointsResult, totalReferrals, activatedReferrals, referralPoints] =
      await Promise.all([
        this.prisma.rewardPoint.aggregate({ where: { userId }, _sum: { points: true } }),
        this.prisma.referral.count({ where: { referrerId: userId } }),
        this.prisma.referral.count({ where: { referrerId: userId, walletCreated: true } }),
        this.prisma.referral.aggregate({
          where: { referrerId: userId },
          _sum: { points: true },
        }),
      ]);

    const shareUrl = this.buildShareUrl(code, 'referral');

    return {
      // `code` and `referralCode` are both returned: bot drivers read `code`,
      // the web dashboard reads `referralCode`.
      code,
      referralCode: code,
      shareUrl,
      totalReferrals,
      activatedReferrals,
      pendingReferrals: totalReferrals - activatedReferrals,
      referralPoints: referralPoints._sum.points || 0,
      totalPoints: totalPointsResult._sum.points || 0,
    };
  }

  /**
   * Everything the web referral page renders: the same code the share card
   * shows, its share URL, and the referred-friend list.
   *
   * Kept separate from {@link getUserReferralStats} because that one is on the
   * hot path for every bot `/referral` reply and should not pay for the joined
   * referee lookup.
   */
  async getReferralDashboard(userId: string) {
    const code = await this.getOrCreateReferralCode(userId);

    const referrals = await this.prisma.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      include: { referee: { select: { username: true, email: true, id: true } } },
    });

    const referredUsers = referrals.map((referral) => {
      const referee = referral.referee;
      const handle = referee?.username
        ? (referee.username.startsWith('@') ? referee.username : `@${referee.username}`)
        : referee?.email?.split('@')[0]
          ? `@${referee.email.split('@')[0]}`
          : `@user-${referral.refereeId.slice(0, 6)}`;

      return {
        name: handle,
        // Mirrors the staged-reward ladder: nothing is "active" until the
        // referee actually created a wallet.
        status: referral.walletCreated ? 'Active' : 'Pending',
        date: referral.createdAt.toISOString().slice(0, 10),
        reward: `${referral.points} VERI`,
      };
    });

    return {
      code,
      referralCode: code,
      shareUrl: this.buildShareUrl(code, 'referral'),
      totalEarned: referrals.reduce((sum, referral) => sum + referral.points, 0),
      totalReferrals: referrals.length,
      activatedReferrals: referrals.filter((referral) => referral.walletCreated).length,
      referredUsers,
    };
  }

  /** Builds an attributed invite URL pointing at the Telegram-first activation page. */
  buildShareUrl(code: string, src: string, campaign = 'referral'): string {
    const params = new URLSearchParams({ ref: code, src, campaign });
    return `${getAppBaseUrl()}/activate?${params.toString()}`;
  }

  private notify(userId: string, title: string, body: string, amount: number, path: string) {
    this.unifiedNotificationService
      .notifyUser({
        userId,
        type: 'referral_reward',
        title,
        body,
        amount,
        link: `${getAppBaseUrl()}${path}`,
        metadata: { points: amount },
      })
      .catch((err) => this.logger.warn(`Failed to send referral notification: ${err.message}`));
  }
}
