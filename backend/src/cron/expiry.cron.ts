import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ShortLinksService } from '../shortlinks/shortlinks.service';
import { EscrowService } from '../escrow/escrow.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../core/redis.service';
import { PLATFORM_SERVICE, type PlatformMessenger } from '../common/service-contracts';

@Injectable()
export class ExpiryCron {
  private readonly logger = new Logger(ExpiryCron.name);

  constructor(
    private readonly shortLinksService: ShortLinksService,
    private readonly escrowService: EscrowService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(PLATFORM_SERVICE)
    private readonly platformService: PlatformMessenger,
  ) {}

  /** Notify linked social accounts once when an active session key enters its final 24 hours. */
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiringSessionKeys() {
    const acquired = await this.redis.claimOnce('cron:expiry-keys', 3500);
    if (!acquired) return;
    const now = new Date();
    const warningCutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const keys = await this.prisma.sessionKey.findMany({
      where: {
        revokedAt: null,
        expiryNoticeSentAt: null,
        expiryAt: { gt: now, lte: warningCutoff },
      },
      include: { user: true },
    });

    for (const key of keys) {
      try {
        const user = key.user;
        const username = user.username || `user_${user.id.slice(0, 8)}`;
        const link = this.platformService.generateSignedDeepLink('/keys', {
          userId: user.id,
          username,
          renewSessionKey: key.id,
        });
        const hours = Math.max(1, Math.ceil((key.expiryAt.getTime() - Date.now()) / 3_600_000));
        const message = `⚠️ *Session Key Expiring Soon*\n\n` +
          `Your session key expires in about ${hours} hour${hours === 1 ? '' : 's'}. ` +
          `Its current daily safety limit is $${Number(key.dailyLimitUSD).toFixed(2)} and its per-payment limit is $${Number(key.perTxLimitUSD).toFixed(2)}.\n\n` +
          `Open Session Keys, revoke the old key when you are ready, and enroll a replacement. You can choose higher limits during enrollment.\n\n` +
          `👉 [Renew Session Key](${link})`;

        const targets: Array<[string, string | null]> = [
          ['telegram', user.telegramChatId || user.telegramId],
          ['whatsapp', user.whatsappId],
          ['discord', user.discordId],
          ['slack', user.slackId],
        ];
        const results = await Promise.all(
          targets.filter((entry): entry is [string, string] => Boolean(entry[1]))
            .map(([platform, id]) => this.platformService.sendDirectMessage(platform, id, message)),
        );
        if (results.some(Boolean)) {
          await this.prisma.sessionKey.update({ where: { id: key.id }, data: { expiryNoticeSentAt: new Date() } });
        }
      } catch (error: any) {
        this.logger.warn(`Failed to notify session-key expiry for ${key.id}: ${error.message}`);
      }
    }
  }

  /**
   * Daily cron job to sweep expired active short links
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpiredLinksSweep() {
    this.logger.log('Starting daily expired short links sweep...');
    try {
      const [native, other] = await Promise.all([
        this.escrowService.sweepExpired(),
        this.shortLinksService.sweepExpired(),
      ]);
      this.logger.log(`Swept ${native.length + other.length} expired short links.`);
    } catch (e: any) {
      this.logger.error(`Error sweeping expired short links: ${e.message}`, e.stack);
    }
  }
}
