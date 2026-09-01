import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReputationService {
  private readonly logger = new Logger(ReputationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Award reputation points for various activities
   * Points are designed to be engaging but not excessive
   */
  private readonly POINT_REWARDS = {
    // Transfer activities (small but frequent)
    TRANSFER_SMALL: 2,        // Under $10
    TRANSFER_MEDIUM: 5,       // $10-$100
    TRANSFER_LARGE: 10,       // $100-$1000
    TRANSFER_WHALE: 20,       // $1000+

    // Vault activities (medium rewards for longer commitment)
    VAULT_DEPOSIT_SMALL: 15,  // Under $50
    VAULT_DEPOSIT_MEDIUM: 30, // $50-$500
    VAULT_DEPOSIT_LARGE: 50,  // $500+
    VAULT_WITHDRAWAL: 5,      // Small reward for any withdrawal

    // Social activities (encourage viral growth)
    RED_ENVELOPE_CLAIM: 8,
    RED_ENVELOPE_CREATE: 15,
    SUBSCRIPTION_PAYMENT: 12,
    BILL_SPLIT_CREATE: 10,
    BILL_SPLIT_PAYMENT: 8,

    // Pool activities (highest rewards for trust-based lending)
    POOL_DEPOSIT: 25,
    POOL_LOAN_REPAY_ONTIME: 10,
    POOL_LOAN_REPAY_LATE: 3,

    // Referral activities
    REFERRAL_SIGNUP: 50,      // When referee completes first transaction
    REFERRAL_BONUS: 100,      // When referee deposits $50+

    // Streak bonuses (multiplicative rewards for consistency)
    DAILY_STREAK_MULTIPLIER: 5,  // currentStreak × 5
    WEEKLY_ACTIVE_BONUS: 20,     // Active 5+ days in a week

    // Session key usage (passive daily reward)
    SESSION_KEY_DAILY_BONUS: 3,  // Per day of active session key

    // Achievement milestones
    FIRST_TRANSACTION: 25,
    TENTH_TRANSACTION: 50,
    HUNDREDTH_TRANSACTION: 200,
    FIRST_VAULT_DEPOSIT: 30,
    BADGE_EARNED: 50,
  };

  /**
   * Award points for a transfer based on amount
   */
  async awardTransferPoints(userId: string, amountUSD: number, txHash: string): Promise<number> {
    let points = 0;
    let reason = '';

    if (amountUSD < 10) {
      points = this.POINT_REWARDS.TRANSFER_SMALL;
      reason = 'TRANSFER_SMALL';
    } else if (amountUSD < 100) {
      points = this.POINT_REWARDS.TRANSFER_MEDIUM;
      reason = 'TRANSFER_MEDIUM';
    } else if (amountUSD < 1000) {
      points = this.POINT_REWARDS.TRANSFER_LARGE;
      reason = 'TRANSFER_LARGE';
    } else {
      points = this.POINT_REWARDS.TRANSFER_WHALE;
      reason = 'TRANSFER_WHALE';
    }

    await this.addPoints(userId, points, reason, txHash);
    await this.checkTransactionMilestones(userId);
    return points;
  }

  /**
   * Award points for vault deposit
   */
  async awardVaultDepositPoints(userId: string, amountUSD: number, txHash: string): Promise<number> {
    let points = 0;
    let reason = '';

    if (amountUSD < 50) {
      points = this.POINT_REWARDS.VAULT_DEPOSIT_SMALL;
      reason = 'VAULT_DEPOSIT_SMALL';
    } else if (amountUSD < 500) {
      points = this.POINT_REWARDS.VAULT_DEPOSIT_MEDIUM;
      reason = 'VAULT_DEPOSIT_MEDIUM';
    } else {
      points = this.POINT_REWARDS.VAULT_DEPOSIT_LARGE;
      reason = 'VAULT_DEPOSIT_LARGE';
    }

    await this.addPoints(userId, points, reason, txHash);
    await this.checkFirstVaultDeposit(userId);
    return points;
  }

  /**
   * Award points for vault withdrawal
   */
  async awardVaultWithdrawalPoints(userId: string, txHash: string): Promise<number> {
    const points = this.POINT_REWARDS.VAULT_WITHDRAWAL;
    await this.addPoints(userId, points, 'VAULT_WITHDRAWAL', txHash);
    return points;
  }

  /**
   * Award points for red envelope activities
   */
  async awardRedEnvelopeClaimPoints(userId: string): Promise<number> {
    const points = this.POINT_REWARDS.RED_ENVELOPE_CLAIM;
    await this.addPoints(userId, points, 'RED_ENVELOPE_CLAIM');
    return points;
  }

  async awardRedEnvelopeCreatePoints(userId: string): Promise<number> {
    const points = this.POINT_REWARDS.RED_ENVELOPE_CREATE;
    await this.addPoints(userId, points, 'RED_ENVELOPE_CREATE');
    return points;
  }

  /**
   * Award points for subscription payment
   */
  async awardSubscriptionPaymentPoints(userId: string, txHash: string): Promise<number> {
    const points = this.POINT_REWARDS.SUBSCRIPTION_PAYMENT;
    await this.addPoints(userId, points, 'SUBSCRIPTION_PAYMENT', txHash);
    return points;
  }

  /**
   * Award points for bill split activities
   */
  async awardBillSplitCreatePoints(userId: string): Promise<number> {
    const points = this.POINT_REWARDS.BILL_SPLIT_CREATE;
    await this.addPoints(userId, points, 'BILL_SPLIT_CREATE');
    return points;
  }

  async awardBillSplitPaymentPoints(userId: string, txHash: string): Promise<number> {
    const points = this.POINT_REWARDS.BILL_SPLIT_PAYMENT;
    await this.addPoints(userId, points, 'BILL_SPLIT_PAYMENT', txHash);
    return points;
  }

  /**
   * Award points for pool activities
   */
  async awardPoolDepositPoints(userId: string, txHash: string): Promise<number> {
    const points = this.POINT_REWARDS.POOL_DEPOSIT;
    await this.addPoints(userId, points, 'POOL_DEPOSIT', txHash);
    return points;
  }

  /**
   * Award points for streak maintenance
   */
  async awardStreakBonus(userId: string, currentStreak: number): Promise<number> {
    const points = currentStreak * this.POINT_REWARDS.DAILY_STREAK_MULTIPLIER;
    await this.addPoints(userId, points, `DAILY_STREAK_${currentStreak}`);
    return points;
  }

  /**
   * Award points for session key usage (called daily by cron)
   */
  async awardSessionKeyDailyBonus(userId: string): Promise<number> {
    const points = this.POINT_REWARDS.SESSION_KEY_DAILY_BONUS;
    await this.addPoints(userId, points, 'SESSION_KEY_DAILY_BONUS');
    return points;
  }

  /**
   * Award points for badge earned
   */
  async awardBadgePoints(userId: string, badgeId: string): Promise<number> {
    const points = this.POINT_REWARDS.BADGE_EARNED;
    await this.addPoints(userId, points, `BADGE_EARNED_${badgeId}`);
    return points;
  }

  /**
   * Core method to add points and update user reputation
   */
  private async addPoints(userId: string, points: number, reason: string, txHash?: string) {
    if (points <= 0) return;

    try {
      // Add reward point record
      await this.prisma.rewardPoint.create({
        data: {
          userId,
          points,
          reason,
          txHash: txHash || null,
        },
      });

      // Update user's total reputation points
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          reputationPoints: { increment: points },
        },
      });

      this.logger.log(`[Reputation] Awarded ${points} points to user ${userId} for ${reason}`);
    } catch (err: any) {
      this.logger.error(`[Reputation] Failed to award points: ${err.message}`);
    }
  }

  /**
   * Check and award transaction milestone bonuses
   */
  private async checkTransactionMilestones(userId: string) {
    const txCount = await this.prisma.userActivityLog.count({
      where: { userId, action: 'TRANSFER_SENT' },
    });

    if (txCount === 1) {
      await this.addPoints(userId, this.POINT_REWARDS.FIRST_TRANSACTION, 'FIRST_TRANSACTION');
    } else if (txCount === 10) {
      await this.addPoints(userId, this.POINT_REWARDS.TENTH_TRANSACTION, 'TENTH_TRANSACTION');
    } else if (txCount === 100) {
      await this.addPoints(userId, this.POINT_REWARDS.HUNDREDTH_TRANSACTION, 'HUNDREDTH_TRANSACTION');
    }
  }

  /**
   * Check and award first vault deposit bonus
   */
  private async checkFirstVaultDeposit(userId: string) {
    const depositCount = await this.prisma.vaultDeposit.count({
      where: { userId },
    });

    if (depositCount === 1) {
      await this.addPoints(userId, this.POINT_REWARDS.FIRST_VAULT_DEPOSIT, 'FIRST_VAULT_DEPOSIT');
    }
  }

  /**
   * Get user's reputation summary
   */
  async getUserReputationSummary(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { reputationPoints: true },
    });

    const rewardPoints = await this.prisma.rewardPoint.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const totalEarned = await this.prisma.rewardPoint.aggregate({
      where: { userId },
      _sum: { points: true },
    });

    return {
      totalPoints: user?.reputationPoints || 0,
      totalEarned: totalEarned._sum.points || 0,
      recentRewards: rewardPoints,
    };
  }
}
