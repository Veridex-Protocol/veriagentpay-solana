import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReferralService, REFERRAL_LIMITS } from './referral.service';

/**
 * Releases the stage-4 referral reward once a referee has genuinely held a
 * deposit for {@link REFERRAL_LIMITS.RETENTION_DAYS} days.
 *
 * "Held" means their cumulative deposits still exceed their cumulative
 * withdrawals — depositing and immediately pulling the funds back out does not
 * qualify.
 */
@Injectable()
export class ReferralMilestoneCron {
  private readonly logger = new Logger(ReferralMilestoneCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly referralService: ReferralService,
  ) {}

  /** Runs daily at 03:00 UTC, after the retention cohort job. */
  @Cron('0 3 * * *', { name: 'referral-d7-retention', timeZone: 'UTC' })
  async awardRetainedDepositMilestones() {
    const cutoff = new Date(Date.now() - REFERRAL_LIMITS.RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const candidates = await this.prisma.referral.findMany({
      where: {
        depositRetainedD7: false,
        walletCreated: true,
      },
      select: { id: true, refereeId: true, referrerId: true },
    });

    if (candidates.length === 0) return;

    let awarded = 0;
    for (const referral of candidates) {
      try {
        if (await this.hasRetainedDeposit(referral.refereeId, cutoff)) {
          if (await this.referralService.markDepositRetainedD7(referral.refereeId)) {
            awarded++;
          }
        }
      } catch (error: any) {
        this.logger.error(
          `D7 milestone check failed for referee=${referral.refereeId}: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `Referral D7 retention sweep: ${candidates.length} candidates, ${awarded} milestones awarded`,
    );
  }

  /**
   * True when the user made a deposit on or before `cutoff` and their net
   * balance (deposits − withdrawals) is still positive.
   */
  private async hasRetainedDeposit(userId: string, cutoff: Date): Promise<boolean> {
    const seedDeposit = await this.prisma.vaultDeposit.findFirst({
      where: { userId, createdAt: { lte: cutoff } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!seedDeposit) return false;

    const [deposited, withdrawn] = await Promise.all([
      this.prisma.vaultDeposit.aggregate({ where: { userId }, _sum: { amount: true } }),
      this.prisma.vaultWithdrawal.aggregate({ where: { userId }, _sum: { amount: true } }),
    ]);

    const net = new Prisma.Decimal(deposited._sum.amount ?? 0).minus(
      new Prisma.Decimal(withdrawn._sum.amount ?? 0),
    );
    return net.greaterThan(0);
  }
}
