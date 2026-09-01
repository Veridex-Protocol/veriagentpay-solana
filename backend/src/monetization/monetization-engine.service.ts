import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface RevenueCollectionResult {
  collectionId: string;
  source: 'VAULT_PERFORMANCE_FEE' | 'FIAT_RAMP_MARGIN' | 'SUBSCRIPTION_FEE' | 'MERCHANT_PROCESSING' | 'GROUP_LENDING_FEE';
  amountUSDC: number;
  treasuryShareUSDC: number; // 40%
  stakerRewardPoolUSDC: number; // 35% (accumulated off-chain until token launch)
  buybackPoolUSDC: number; // 25% (accumulated off-chain until token launch)
  timestamp: Date;
}

@Injectable()
export class MonetizationEngineService {
  private readonly logger = new Logger(MonetizationEngineService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Collects pure stablecoin revenue (USDC) from high-value actions,
   * applying the 40/35/25 distribution split.
   */
  async collectRevenue(
    source: 'VAULT_PERFORMANCE_FEE' | 'FIAT_RAMP_MARGIN' | 'SUBSCRIPTION_FEE' | 'MERCHANT_PROCESSING' | 'GROUP_LENDING_FEE',
    amountUSDC: number,
    userId?: string,
    metadata?: Record<string, any>
  ): Promise<RevenueCollectionResult> {
    if (amountUSDC <= 0) {
      throw new Error('Revenue collection amount must be greater than zero');
    }

    const treasuryShare = amountUSDC * 0.40;
    const stakerRewardPool = amountUSDC * 0.35;
    const buybackPool = amountUSDC * 0.25;

    // Record revenue collection in audit / transaction ledger
    const targetUserId = userId || await this.getDefaultUserId();
    const collection = await this.prisma.auditEvent.create({
      data: {
        userId: targetUserId,
        action: `REVENUE_COLLECTED_${source}`,
        details: {
          source,
          amountUSDC,
          treasuryShareUSDC: treasuryShare,
          stakerRewardPoolUSDC: stakerRewardPool,
          buybackPoolUSDC: buybackPool,
          metadata: metadata || {},
        },
        status: 'SUCCESS',
      },
    });

    this.logger.log(`Collected $${amountUSDC.toFixed(2)} USDC from ${source}. Treasury: $${treasuryShare.toFixed(2)}, Staker Pool: $${stakerRewardPool.toFixed(2)}, Buyback Pool: $${buybackPool.toFixed(2)}`);

    return {
      collectionId: collection.id,
      source,
      amountUSDC,
      treasuryShareUSDC: treasuryShare,
      stakerRewardPoolUSDC: stakerRewardPool,
      buybackPoolUSDC: buybackPool,
      timestamp: collection.timestamp,
    };
  }

  private async getDefaultUserId(): Promise<string> {
    let user = await this.prisma.user.findFirst();
    if (!user) {
      user = await this.prisma.user.create({
        data: { username: 'system_treasury' },
      });
    }
    return user.id;
  }

  /**
   * Retrieves summary of accumulated protocol revenue collected in stablecoins prior to token TGE.
   */
  async getRevenueSummary() {
    const collections = await this.prisma.auditEvent.findMany({
      where: {
        action: { startsWith: 'REVENUE_COLLECTED_' },
      },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });

    let totalGrossUSDC = 0;
    let totalTreasuryUSDC = 0;
    let totalStakerPoolUSDC = 0;
    let totalBuybackPoolUSDC = 0;

    const breakdown: Record<string, number> = {};

    for (const c of collections) {
      const details = c.details as any;
      if (details && typeof details.amountUSDC === 'number') {
        totalGrossUSDC += details.amountUSDC;
        totalTreasuryUSDC += details.treasuryShareUSDC || 0;
        totalStakerPoolUSDC += details.stakerRewardPoolUSDC || 0;
        totalBuybackPoolUSDC += details.buybackPoolUSDC || 0;

        const src = details.source || 'UNKNOWN';
        breakdown[src] = (breakdown[src] || 0) + details.amountUSDC;
      }
    }

    return {
      totalGrossUSDC,
      totalTreasuryUSDC,
      totalStakerPoolUSDC,
      totalBuybackPoolUSDC,
      breakdown,
      transactionCount: collections.length,
    };
  }
}
