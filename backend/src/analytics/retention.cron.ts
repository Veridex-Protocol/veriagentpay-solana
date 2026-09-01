import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { FunnelEventsService } from './funnel-events.service';

/** Cohort day offsets we report retention for. */
const RETENTION_COHORTS = [1, 7, 14, 30] as const;

/**
 * Marks each signup cohort's still-active members so D1/D7/D14/D30 retention
 * can be measured. Without this job no retention metric is computable.
 */
@Injectable()
export class RetentionCron {
  private readonly logger = new Logger(RetentionCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly funnelEvents: FunnelEventsService,
  ) {}

  /** Runs daily at 02:00 UTC. */
  @Cron('0 2 * * *', { name: 'retention-cohorts', timeZone: 'UTC' })
  async checkRetention() {
    for (const dayN of RETENTION_COHORTS) {
      try {
        await this.processCohort(dayN);
      } catch (error: any) {
        this.logger.error(`Retention cohort D${dayN} failed: ${error.message}`);
      }
    }
  }

  /**
   * A user counts as retained at D{n} when they signed up exactly n days ago
   * and have logged any activity in the last 24 hours.
   */
  private async processCohort(dayN: number) {
    const now = new Date();
    const cohortDay = new Date(now.getTime() - dayN * 24 * 60 * 60 * 1000);
    const cohortStart = new Date(
      Date.UTC(cohortDay.getUTCFullYear(), cohortDay.getUTCMonth(), cohortDay.getUTCDate()),
    );
    const cohortEnd = new Date(cohortStart.getTime() + 24 * 60 * 60 * 1000);
    const activeSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const cohortUsers = await this.prisma.user.findMany({
      where: { createdAt: { gte: cohortStart, lt: cohortEnd } },
      select: { id: true, signupSrc: true, signupCampaign: true },
    });

    if (cohortUsers.length === 0) return;

    // One grouped query instead of N per-user lookups.
    const activeGroups = await this.prisma.userActivityLog.groupBy({
      by: ['userId'],
      where: {
        userId: { in: cohortUsers.map((u) => u.id) },
        createdAt: { gte: activeSince },
      },
    });
    const activeIds = new Set(activeGroups.map((g) => g.userId));

    let marked = 0;
    for (const user of cohortUsers) {
      if (!activeIds.has(user.id)) continue;
      const recorded = await this.funnelEvents.track(`retention.d${dayN}_active`, {
        userId: user.id,
        attribution: { src: user.signupSrc ?? undefined, campaign: user.signupCampaign ?? undefined },
        metadata: { dayN },
        dedupeKey: `retention.d${dayN}:${user.id}`,
      });
      if (recorded) marked++;
    }

    this.logger.log(
      `Retention D${dayN}: cohort=${cohortUsers.length} active=${activeIds.size} newlyMarked=${marked}`,
    );
  }
}
