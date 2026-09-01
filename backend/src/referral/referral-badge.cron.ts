import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ReferralLeaderboardService } from './referral-leaderboard.service';
import { NOTIFICATION_SERVICE, type UserNotifier } from '../common/service-contracts';
import { getAppBaseUrl } from '../config/app-url.config';

/** Badge ids awarded to the weekly top-3 referrers, by placing. */
const WEEKLY_REFERRER_BADGES = [
  { badgeId: 'b-weekly-ref-1', name: 'Weekly #1 Referrer 🥇' },
  { badgeId: 'b-weekly-ref-2', name: 'Weekly #2 Referrer 🥈' },
  { badgeId: 'b-weekly-ref-3', name: 'Weekly #3 Referrer 🥉' },
];

@Injectable()
export class ReferralBadgeCron {
  private readonly logger = new Logger(ReferralBadgeCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderboardService: ReferralLeaderboardService,
    @Inject(NOTIFICATION_SERVICE)
    private readonly notifications: UserNotifier,
  ) {}

  /**
   * Runs Mondays at 07:00 UTC — after the week has rolled over, so it awards
   * the standings for the week that just closed.
   */
  @Cron('0 7 * * 1', { name: 'weekly-referrer-badges', timeZone: 'UTC' })
  async awardWeeklyReferrerBadges() {
    // The leaderboard's "week" window resets on Monday 00:00 UTC, so at 07:00
    // Monday we must look back at the *previous* week explicitly.
    const top = await this.getPreviousWeekTop(WEEKLY_REFERRER_BADGES.length);
    if (top.length === 0) {
      this.logger.log('Weekly referrer badges: no qualifying referrers last week');
      return;
    }

    for (let i = 0; i < top.length; i++) {
      const entry = top[i];
      const badge = WEEKLY_REFERRER_BADGES[i];
      try {
        await this.prisma.userBadge.upsert({
          where: { userId_badgeId: { userId: entry.userId, badgeId: badge.badgeId } },
          update: {},
          create: { userId: entry.userId, badgeId: badge.badgeId },
        });

        this.notifications
          .notifyUser({
            userId: entry.userId,
            type: 'badge_earned',
            title: `🏆 ${badge.name}`,
            body: `You finished #${i + 1} last week with ${entry.activations} activated invites.`,
            link: `${getAppBaseUrl()}/badges`,
            metadata: { badgeId: badge.badgeId, rank: i + 1, activations: entry.activations },
          })
          .catch((err) => this.logger.warn(`Badge notification failed: ${err.message}`));

        this.logger.log(
          `Awarded ${badge.badgeId} to ${entry.userId} (${entry.activations} activations)`,
        );
      } catch (error: any) {
        this.logger.error(`Failed to award ${badge.badgeId} to ${entry.userId}: ${error.message}`);
      }
    }
  }

  /** Ranks referrers by activations that landed during the previous ISO week. */
  private async getPreviousWeekTop(n: number) {
    const now = new Date();
    const daysSinceMonday = (now.getUTCDay() + 6) % 7;
    const thisMonday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday),
    );
    const lastMonday = new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000);

    const referrals = await this.prisma.referral.findMany({
      where: {
        walletCreated: true,
        walletCreatedAt: { gte: lastMonday, lt: thisMonday },
      },
      select: { referrerId: true, points: true },
    });

    const tally = new Map<string, { activations: number; points: number }>();
    for (const r of referrals) {
      const entry = tally.get(r.referrerId) ?? { activations: 0, points: 0 };
      entry.activations += 1;
      entry.points += r.points;
      tally.set(r.referrerId, entry);
    }

    return [...tally.entries()]
      .sort((a, b) => b[1].activations - a[1].activations || b[1].points - a[1].points)
      .slice(0, n)
      .map(([userId, stats]) => ({ userId, ...stats }));
  }
}
