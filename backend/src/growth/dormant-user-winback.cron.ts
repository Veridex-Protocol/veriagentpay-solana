import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_SERVICE, type UserNotifier } from '../common/service-contracts';
import { getAppBaseUrl } from '../config/app-url.config';

const INACTIVITY_DAYS = 14;
const BATCH_SIZE = 100;
const WINBACK_NOTIFICATION_TYPE = 'dormant_win_back';

/**
 * Re-engages users after 14 days without product activity.
 *
 * A win-back is sent at most once per inactivity spell: if a user returns and
 * later goes quiet again, their more recent activity makes them eligible again.
 */
@Injectable()
export class DormantUserWinbackCron {
  private readonly logger = new Logger(DormantUserWinbackCron.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_SERVICE)
    private readonly notifications: UserNotifier,
  ) {}

  /** Daily at 10:00 WAT. */
  @Cron('0 10 * * *', { name: 'dormant-user-winback', timeZone: 'Africa/Lagos' })
  async sendDormantUserWinbacks() {
    const inactiveSince = new Date(Date.now() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000);
    let cursor: string | undefined;
    let eligible = 0;
    let sent = 0;

    while (true) {
      const users = await this.prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          createdAt: { lte: inactiveSince },
          // Accounts with no activity are included; accounts active in the
          // last 14 days are never contacted by this job.
          activityLogs: { none: { createdAt: { gte: inactiveSince } } },
        },
        select: { id: true, createdAt: true },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (users.length === 0) break;

      const userIds = users.map((user) => user.id);
      const [lastActivity, lastWinback] = await Promise.all([
        this.prisma.userActivityLog.groupBy({
          by: ['userId'],
          where: { userId: { in: userIds } },
          _max: { createdAt: true },
        }),
        this.prisma.notificationLog.groupBy({
          by: ['userId'],
          where: { userId: { in: userIds }, notificationType: WINBACK_NOTIFICATION_TYPE },
          _max: { sentAt: true },
        }),
      ]);
      const lastActivityByUser = new Map(lastActivity.map((row) => [row.userId, row._max.createdAt]));
      const lastWinbackByUser = new Map(lastWinback.map((row) => [row.userId, row._max.sentAt]));

      for (const user of users) {
        const activityAt = lastActivityByUser.get(user.id) ?? user.createdAt;
        const winbackAt = lastWinbackByUser.get(user.id);
        if (winbackAt && winbackAt >= activityAt) continue;

        eligible++;
        try {
          await this.notifications.notifyUser({
            userId: user.id,
            type: 'admin_alert',
            title: 'We saved your spot 👋',
            body: 'It’s been a little while. Come back to send, save, or claim a Red Envelope in seconds.',
            link: `${getAppBaseUrl()}/dashboard`,
            metadata: { campaign: WINBACK_NOTIFICATION_TYPE, inactivityDays: INACTIVITY_DAYS },
          });
          // The notification service records its own delivery log; this
          // campaign marker lets this cron distinguish a return visit from an
          // earlier win-back message.
          await this.prisma.notificationLog.create({
            data: {
              userId: user.id,
              category: 'reputation',
              notificationType: WINBACK_NOTIFICATION_TYPE,
              metadata: { inactivityDays: INACTIVITY_DAYS },
            },
          });
          sent++;
        } catch (error: any) {
          this.logger.warn(`Dormant user win-back failed for ${user.id}: ${error.message}`);
        }
      }

      cursor = users[users.length - 1].id;
      if (users.length < BATCH_SIZE) break;
    }

    this.logger.log(`Dormant user win-back: eligible=${eligible} delivered=${sent}`);
  }
}
