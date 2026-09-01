import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdminFeaturesService {
  constructor(private readonly prisma: PrismaService) {}

  // --- 6. Red Envelopes ---
  async getEnvelopes(status?: string) {
    const where: any = {};
    if (status && status !== 'ALL') where.status = status;

    const envelopes = await this.prisma.redEnvelope.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        creator: { select: { email: true, username: true } },
        claims: true,
      },
    });

    return envelopes;
  }

  async getEnvelopeById(id: string) {
    const envelope = await this.prisma.redEnvelope.findUnique({
      where: { id },
      include: {
        creator: { select: { email: true, username: true } },
        claims: true,
      },
    });

    if (!envelope) throw new NotFoundException(`Red envelope with ID ${id} not found`);
    return envelope;
  }

  async getSponsoredEnvelopeRevenue() {
    const envelopes = await this.prisma.redEnvelope.findMany({
      include: { claims: true },
    });

    const totalAmount = envelopes.reduce((sum, e) => sum + Number(e.totalAmount || 0), 0);
    const feeRevenue = totalAmount * 0.08; // 8.0% corporate sponsored fee

    return {
      sponsoredCampaignsCount: envelopes.length,
      totalVolumeUsd: totalAmount,
      protocolFeeRevenueUsd: feeRevenue,
      feePercentage: '8.0%',
    };
  }

  // --- 7. Bill Splits & Subscriptions ---
  async getSplits() {
    return this.prisma.billSplit.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { email: true, username: true } },
        participants: { include: { user: { select: { email: true } } } },
      },
    });
  }

  async getSubscriptions() {
    return this.prisma.subscription.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        subscriber: { select: { email: true, username: true } },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  // --- 8. Referrals, Badges & Leaderboard ---
  async getReferrals() {
    const referrals = await this.prisma.referral.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        referrer: { select: { email: true, username: true } },
        referee: { select: { email: true, username: true } },
      },
    });

    const topReferrers = await this.prisma.user.findMany({
      take: 10,
      orderBy: { reputationPoints: 'desc' },
      select: { id: true, email: true, username: true, reputationPoints: true },
    });

    return {
      referrals,
      topReferrers,
    };
  }

  async getBadges() {
    const userBadges = await this.prisma.userBadge.findMany();
    const badgeCounts: Record<string, number> = {};

    for (const ub of userBadges) {
      badgeCounts[ub.badgeId] = (badgeCounts[ub.badgeId] || 0) + 1;
    }

    const defaultBadges = [
      { id: 'b-hk2026-pioneer', code: 'HK2026_PIONEER', name: 'Hong Kong Pioneer 2026', description: 'Joined through the Bitcoin Asia Hong Kong campaign during the claim window' },
      { id: 'b-yield-pioneer', code: 'YIELD_PIONEER', name: 'Yield Pioneer', description: 'Deposited into AI Yield Vaults' },
      { id: 'b-top-ref', code: 'TOP_REFERRER', name: 'Top Referrer', description: 'Invited 5+ active users' },
      { id: 'b-social-master', code: 'SOCIAL_MASTER', name: 'Social Master', description: 'Claimed 10+ Red Envelopes' },
      { id: 'b-credit-pillar', code: 'CREDIT_PILLAR', name: 'Credit Pillar', description: 'Maintained 100% Group Loan Repayment Rate' },
    ];

    return defaultBadges.map((b) => ({
      ...b,
      awardedCount: badgeCounts[b.id] || badgeCounts[b.code] || 0,
    }));
  }

  /** Admin-only recipient export, including the persisted NFT delivery lifecycle. */
  async getBadgeRecipients(badgeId: string) {
    const recipients = await this.prisma.userBadge.findMany({
      where: { badgeId },
      orderBy: { unlockedAt: 'asc' },
      select: {
        id: true,
        badgeId: true,
        unlockedAt: true,
        nftStatus: true,
        nftContractAddress: true,
        nftTokenId: true,
        nftTxHash: true,
        mintedAt: true,
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            telegramId: true,
            signupSrc: true,
            signupCampaign: true,
            smartWallet: { select: { address: true } },
          },
        },
      },
    });
    return { badgeId, total: recipients.length, recipients };
  }

  async getLeaderboard() {
    return this.prisma.user.findMany({
      take: 100,
      orderBy: { reputationPoints: 'desc' },
      select: {
        id: true,
        email: true,
        username: true,
        reputationPoints: true,
        createdAt: true,
        smartWallet: { select: { address: true } },
      },
    });
  }
}
