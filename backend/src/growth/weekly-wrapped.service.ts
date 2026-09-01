import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, UserActivityAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_SERVICE, type UserNotifier } from '../common/service-contracts';
import { FunnelEventsService } from '../analytics/funnel-events.service';
import { getAppBaseUrl } from '../config/app-url.config';

export interface WeeklyWrapped {
  userId: string;
  sent: number;
  received: number;
  saved: number;
  currentStreak: number;
  longestStreak: number;
  badgeCount: number;
  weekStart: string;
  weekEnd: string;
}

/**
 * Builds and delivers the Monday "Weekly Wrapped" recap — a retention loop that
 * gives users a reason to reopen the bot and a shareable artifact.
 */
@Injectable()
export class WeeklyWrappedService {
  private readonly logger = new Logger(WeeklyWrappedService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_SERVICE)
    private readonly notifications: UserNotifier,
    private readonly funnelEvents: FunnelEventsService,
  ) {}

  /** Monday 08:00 UTC. */
  @Cron('0 8 * * 1', { name: 'weekly-wrapped', timeZone: 'UTC' })
  async sendWeeklyWrapped() {
    const { weekStart, weekEnd } = this.previousWeekBounds();

    // Only users who did something last week get a recap — an empty card is noise.
    const activeUserIds = await this.prisma.userActivityLog.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: weekStart, lt: weekEnd } },
    });

    if (activeUserIds.length === 0) {
      this.logger.log('Weekly Wrapped: no active users last week');
      return;
    }

    let sent = 0;
    for (const { userId } of activeUserIds) {
      if (!userId) continue;
      try {
        const wrapped = await this.buildWrapped(userId, weekStart, weekEnd);
        if (wrapped.sent + wrapped.received === 0 && wrapped.saved === 0) continue;

        await this.notifications.notifyUser({
          userId,
          type: 'admin_alert',
          title: '📊 Your VeriAgent week',
          body: this.formatCard(wrapped),
          link: `${getAppBaseUrl()}/streaks`,
          metadata: { wrapped: wrapped as unknown as Record<string, unknown> },
        });

        await this.funnelEvents.track('weekly_wrapped_sent', {
          userId,
          dedupeKey: `weekly_wrapped:${userId}:${wrapped.weekStart}`,
          metadata: { sent: wrapped.sent, saved: wrapped.saved },
        });
        sent++;
      } catch (error: any) {
        this.logger.warn(`Weekly Wrapped failed for ${userId}: ${error.message}`);
      }
    }

    this.logger.log(`Weekly Wrapped: delivered ${sent}/${activeUserIds.length} recaps`);
  }

  /** Monday 00:00 UTC of the week that just closed, and the following Monday. */
  private previousWeekBounds(): { weekStart: Date; weekEnd: Date } {
    const now = new Date();
    const daysSinceMonday = (now.getUTCDay() + 6) % 7;
    const thisMonday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday),
    );
    return {
      weekStart: new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000),
      weekEnd: thisMonday,
    };
  }

  /** Aggregates a single user's activity for the given window. */
  async buildWrapped(userId: string, weekStart: Date, weekEnd: Date): Promise<WeeklyWrapped> {
    const window = { gte: weekStart, lt: weekEnd };

    const [sent, received, deposits, streak, badgeCount] = await Promise.all([
      this.prisma.userActivityLog.count({
        where: { userId, action: UserActivityAction.TRANSFER_SENT, createdAt: window },
      }),
      this.prisma.userActivityLog.count({
        where: { userId, action: UserActivityAction.TRANSFER_RECEIVED, createdAt: window },
      }),
      this.prisma.vaultDeposit.aggregate({
        where: { userId, createdAt: window },
        _sum: { amount: true },
      }),
      this.prisma.interactionStreak.findUnique({ where: { userId } }),
      this.prisma.userBadge.count({ where: { userId } }),
    ]);

    return {
      userId,
      sent,
      received,
      saved: Number(new Prisma.Decimal(deposits._sum.amount ?? 0).toFixed(2)),
      currentStreak: streak?.currentStreak ?? 0,
      longestStreak: streak?.longestStreak ?? 0,
      badgeCount,
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: weekEnd.toISOString().split('T')[0],
    };
  }

  /** Renders the recap for chat surfaces. */
  formatCard(w: WeeklyWrapped): string {
    const lines = [
      `Sent: ${w.sent} payment${w.sent === 1 ? '' : 's'} | Received: ${w.received}`,
      `Saved: ${w.saved} USDC`,
      `Streak: ${w.currentStreak} day${w.currentStreak === 1 ? '' : 's'}${
        w.currentStreak >= 7 ? ' 🔥' : ''
      } (best: ${w.longestStreak})`,
    ];
    if (w.badgeCount > 0) lines.push(`Badges: ${w.badgeCount}`);
    return lines.join('\n');
  }

  /** On-demand recap for the current week, used by the /streaks page. */
  async getCurrentWeekWrapped(userId: string): Promise<WeeklyWrapped> {
    const now = new Date();
    const daysSinceMonday = (now.getUTCDay() + 6) % 7;
    const weekStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday),
    );
    return this.buildWrapped(userId, weekStart, now);
  }
}
