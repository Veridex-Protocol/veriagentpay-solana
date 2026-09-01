import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PointsLedgerEntry {
  userId: string;
  pointsEarned: number;
  activityType: string;
  description: string;
  timestamp: Date;
}

@Injectable()
export class PointsService {
  private readonly logger = new Logger(PointsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Awards off-chain VERI Points to a user for platform engagement
   */
  async awardPoints(
    userId: string,
    activityType: 'REFERRAL' | 'SEND_TRANSFER' | 'VAULT_DEPOSIT' | 'LOGIN_STREAK' | 'INTERACTION_STREAK' | 'GROUP_LENDING' | 'RED_ENVELOPE' | 'KYC_COMPLETE',
    customPoints?: number,
    description?: string
  ): Promise<{ userId: string; totalPoints: number; pointsAwarded: number }> {
    const pointsMap: Record<string, number> = {
      REFERRAL: 100,
      SEND_TRANSFER: 50,
      VAULT_DEPOSIT: 200,
      LOGIN_STREAK: 25,
      INTERACTION_STREAK: 25,
      GROUP_LENDING: 150,
      RED_ENVELOPE: 10,
      KYC_COMPLETE: 75,
    };

    const pointsEarned = customPoints !== undefined ? customPoints : (pointsMap[activityType] || 10);

    // Save directly into dedicated RewardPoint table for robust persistent storage
    await this.prisma.rewardPoint.create({
      data: {
        userId,
        points: pointsEarned,
        reason: `VERI_POINTS_${activityType}`,
      },
    });

    // Also log audit event for traceability
    await this.prisma.auditEvent.create({
      data: {
        userId,
        action: `VERI_POINTS_AWARDED_${activityType}`,
        details: {
          pointsEarned,
          activityType,
          description: description || `Earned ${pointsEarned} VERI Points for ${activityType}`,
        },
        status: 'SUCCESS',
      },
    });

    const userPoints = await this.getUserPointsTotal(userId);

    this.logger.log(`Awarded ${pointsEarned} VERI Points to user ${userId} for ${activityType}. Total: ${userPoints}`);

    return {
      userId,
      totalPoints: userPoints,
      pointsAwarded: pointsEarned,
    };
  }

  /**
   * Calculates total off-chain VERI Points accumulated by a user from RewardPoint records
   */
  async getUserPointsTotal(userId: string): Promise<number> {
    const rewards = await this.prisma.rewardPoint.findMany({
      where: { userId },
    });

    let total = 0;
    for (const r of rewards) {
      total += r.points;
    }
    return total;
  }

  /**
   * Returns points summary and upcoming TGE conversion preview
   */
  async getUserPointsSummary(userId: string) {
    const totalPoints = await this.getUserPointsTotal(userId);
    return {
      userId,
      veriPoints: totalPoints,
      estimatedTokenConversion: totalPoints, // 1:1 conversion ratio at TGE
      tgeStatus: 'PHASE_0_POINTS_ACCUMULATION',
      conversionNote: 'These off-chain VERI Points will convert 1:1 to on-chain $VERI tokens at TGE (Month 6).',
    };
  }
}
