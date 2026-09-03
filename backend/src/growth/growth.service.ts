import { Inject, Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { NOTIFICATIONS_STORE, type NotificationStore } from '../common/service-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { getAppBaseUrl } from '../config/app-url.config';
import {
  calculateInteractionStreakUpdate,
  QUALIFYING_STREAK_ACTIONS,
  QUALIFYING_STREAK_ACTIVITY_ACTIONS,
} from './interaction-streak.utils';

@Injectable()
export class GrowthService {
  private readonly logger = new Logger(GrowthService.name);

  constructor(
    @Inject(NOTIFICATIONS_STORE)
    private readonly notificationsService: NotificationStore,
    private readonly prisma: PrismaService,
  ) {}

  // --- 1. Public Red Envelope Drops ---
  async createPublicEnvelope(creatorId: string, dto: { token?: string; totalAmount: number; maxClaims: number }) {
    if (!dto.totalAmount || dto.totalAmount <= 0) throw new BadRequestException('Total amount must be > 0');
    const maxClaims = Math.min(1000, Math.max(1, dto.maxClaims || 100));
    const token = (dto.token || 'USDC').toUpperCase();

    const envelope = await this.prisma.publicEnvelope.create({
      data: {
        creatorId,
        token,
        totalAmount: dto.totalAmount,
        remainingBalance: dto.totalAmount,
        maxClaims,
        remainingClaims: maxClaims,
        status: 'ACTIVE',
      },
    });

    const id = envelope.id;
    const baseUrl = getAppBaseUrl();
    const deepLink = `${baseUrl}/claim/envelope?id=${id}`;

    return {
      success: true,
      envelope,
      deepLink,
      shareMessages: {
        telegram: `https://t.me/share/url?url=${encodeURIComponent(deepLink)}&text=${encodeURIComponent('🧧 Claim your free Red Envelope drop on VeriAgent Pay!')}`,
        whatsapp: `https://wa.me/?text=${encodeURIComponent(`🧧 Claim your free Red Envelope drop on VeriAgent Pay! ${deepLink}`)}`,
        rawText: `🧧 Claim your free Red Envelope drop on VeriAgent Pay! ${deepLink}`,
      },
    };
  }

  async getPublicEnvelope(id: string) {
    const envelope = await this.prisma.publicEnvelope.findUnique({ where: { id } });
    if (!envelope) {
      throw new NotFoundException(`Public envelope "${id}" not found`);
    }
    return envelope;
  }

  async claimPublicEnvelope(id: string, claimerAddress: string) {
    const env = await this.getPublicEnvelope(id);
    if (env.remainingClaims <= 0 || env.remainingBalance <= 0) {
      throw new BadRequestException('Public envelope drop fully claimed');
    }

    const existingClaim = await this.prisma.publicEnvelopeClaim.findUnique({
      where: { envelopeId_claimerAddress: { envelopeId: id, claimerAddress } },
    });
    if (existingClaim) {
      throw new BadRequestException('You have already claimed from this envelope');
    }

    const claimAmount = parseFloat(
      Math.min(env.remainingBalance, Math.max(0.5, (env.remainingBalance / env.remainingClaims) * (Math.random() * 0.8 + 0.6))).toFixed(2)
    );

    const remainingBalance = Math.max(0, env.remainingBalance - claimAmount);
    const remainingClaims = Math.max(0, env.remainingClaims - 1);

    try {
      // The conditional update is the concurrency guard: two simultaneous
      // claimers cannot both decrement from the same starting balance.
      const [updated] = await this.prisma.$transaction([
        this.prisma.publicEnvelope.updateMany({
          where: { id, remainingClaims: env.remainingClaims },
          data: {
            remainingBalance,
            remainingClaims,
            status: remainingClaims === 0 ? 'COMPLETED' : 'ACTIVE',
          },
        }),
        this.prisma.publicEnvelopeClaim.create({
          data: { envelopeId: id, claimerAddress, amount: claimAmount },
        }),
      ]);

      if (updated.count !== 1) {
        throw new BadRequestException('Envelope was claimed concurrently. Please try again.');
      }
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException('You have already claimed from this envelope');
      }
      throw error;
    }

    return {
      success: true,
      claimedAmount: claimAmount,
      token: env.token,
      remainingClaims,
    };
  }

  // --- 2. KOL/Community Yield Vaults & White-Label ---
  async createManagedVault(creatorId: string, dto: { name: string; symbol: string; token?: string; performanceFeeBps: number }) {
    if (!dto.name || !dto.symbol) throw new BadRequestException('Vault name and symbol required');
    const fee = Math.min(5000, Math.max(0, dto.performanceFeeBps || 2000));

    const vault = await this.prisma.managedVault.create({
      data: {
        name: dto.name,
        symbol: dto.symbol,
        managerAddress: creatorId,
        token: (dto.token || 'USDC').toUpperCase(),
        apy: 16.8,
        performanceFeeBps: fee,
        totalDeposits: 0,
      },
    });

    return {
      success: true,
      vault: { ...vault, manager: vault.managerAddress },
      shareLink: `${getAppBaseUrl()}/vaults/managed/${vault.id}`,
    };
  }

  async getManagedVaults() {
    const vaults = await this.prisma.managedVault.findMany({ orderBy: { apy: 'desc' } });
    return vaults.map((v) => ({ ...v, manager: v.managerAddress }));
  }

  // --- 3. Airdrop & "Deploy & Earn" Claim Flow ---
  async checkAirdropEligibility(wallet: string) {
    const alreadyClaimed = Boolean(
      await this.prisma.airdropClaim.findUnique({ where: { wallet } }),
    );

    return {
      wallet,
      eligible: false,
      rewardAmount: 0,
      token: 'VERI',
      requirement: 'Deposit $50 into any Yield Vault to unlock vested airdrop reward',
      alreadyClaimed,
      status: 'COMING_SOON',
    };
  }

  async claimAirdrop(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { smartWallet: true },
    });
    if (!user?.smartWallet?.address) {
      throw new BadRequestException('A registered smart wallet is required to claim');
    }
    const cutoff = new Date(process.env.AIRDROP_CAMPAIGN_CUTOFF || 'invalid');
    if (Number.isNaN(cutoff.getTime())) {
      throw new BadRequestException('Airdrop campaign is not configured');
    }
    if (user.createdAt > cutoff) throw new BadRequestException('Account not eligible for this airdrop');

    const unlockDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    try {
      const claim = await this.prisma.airdropClaim.create({
        data: { userId, wallet: user.smartWallet.address, rewardAmount: 250.0, vestingDays: 30, unlockDate },
      });
      return { success: true, claim };
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException('Airdrop already claimed');
      }
      throw error;
    }
  }

  // --- 4. Interaction Streak & Points System ---
  /**
   * Streaks are stored in the `InteractionStreak` table. Any qualifying
   * user-initiated action (bot command, payment, envelope, etc.) extends the
   * streak once per calendar day.
   */
  async recordInteraction(userId: string, interactionType: string) {
    // Only qualifying actions count toward the streak.
    if (!QUALIFYING_STREAK_ACTIONS.has(interactionType)) {
      return this.getInteractionStreak(userId);
    }

    const existing = await this.prisma.interactionStreak.findUnique({ where: { userId } });
    const now = new Date();

    if (!existing) {
      await this.prisma.interactionStreak.create({
        data: { userId, currentStreak: 1, longestStreak: 1, lastActiveAt: now, lastInteractionType: interactionType },
      });
      return this.getInteractionStreak(userId);
    }

    const update = calculateInteractionStreakUpdate(existing, now);
    if (update) {
      await this.prisma.interactionStreak.update({
        where: { userId },
        data: {
          currentStreak: update.currentStreak,
          longestStreak: update.longestStreak,
          lastActiveAt: update.lastActiveAt,
          lastInteractionType: interactionType,
          ...(update.gracePassUsed ? { lastGracePassUsedAt: update.lastGracePassUsedAt } : {}),
        },
      });
    }

    return this.getInteractionStreak(userId);
  }

  /**
   * Resolves a wallet address (or a raw user id) to a User id.
   * Returns null when no account matches.
   */
  async resolveUserIdByWallet(identifier?: string): Promise<string | null> {
    if (!identifier) return null;

    const byId = await this.prisma.user.findUnique({ where: { id: identifier } });
    if (byId) return byId.id;

    const byWallet = await this.prisma.user.findFirst({
      where: { smartWallet: { address: { equals: identifier, mode: 'insensitive' } } },
      select: { id: true },
    });
    return byWallet?.id ?? null;
  }

  async getInteractionStreak(userId: string) {
    const streak = await this.prisma.interactionStreak.findUnique({ where: { userId } });
    if (!streak) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        totalBonusPoints: 0,
        lastActiveDate: null,
        lastInteractionType: null,
        history: [] as string[],
      };
    }

    // Activity history for the last 30 days powers the streak calendar.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const activities = await this.prisma.userActivityLog.findMany({
      where: {
        userId,
        createdAt: { gte: since },
        action: { in: [...QUALIFYING_STREAK_ACTIVITY_ACTIONS] },
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const history = [
      ...new Set(activities.map((a) => a.createdAt.toISOString().split('T')[0])),
    ];

    return {
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      // Bonus points scale with streak length: 5 per day held.
      totalBonusPoints: streak.currentStreak * 5,
      lastActiveDate: streak.lastActiveAt.toISOString().split('T')[0],
      lastInteractionType: streak.lastInteractionType ?? null,
      gracePassAvailable:
        !streak.lastGracePassUsedAt ||
        streak.lastGracePassUsedAt.getUTCFullYear() !== new Date().getUTCFullYear() ||
        streak.lastGracePassUsedAt.getUTCMonth() !== new Date().getUTCMonth(),
      gracePassLastUsedAt: streak.lastGracePassUsedAt?.toISOString() ?? null,
      history,
    };
  }

  // --- 5. Yield Leaderboard ---
  async getLeaderboard() {
    const sorted = await this.getManagedVaults();

    return {
      topVaults: sorted.map((v, index) => ({
        rank: index + 1,
        ...v,
        badge: index === 0 ? '🏆 Top Yield Champion' : index === 1 ? '🥈 Runner Up' : '🥉 Bronze Strategy',
      })),
      showdownPrizePool: 0,
    };
  }

  // --- 6. Merchant Payment Links ---
  async generateMerchantLink(dto: { to: string; amount: number; token?: string; note?: string }) {
    if (!dto.to || !dto.amount) throw new BadRequestException('Recipient address and amount required');
    const token = (dto.token || 'USDC').toUpperCase();
    const params = new URLSearchParams({
      to: dto.to,
      amount: dto.amount.toString(),
      token,
      note: dto.note || 'Invoice Payment',
    });

    const checkoutUrl = `${getAppBaseUrl()}/pay?${params.toString()}`;
    return { success: true, checkoutUrl, qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(checkoutUrl)}` };
  }

  // --- 8. Ambassador Badges ---
  async getAmbassadorProfile(ambassadorId: string) {
    return {
      ambassadorId,
      referralCount: 0,
      totalEarnedUsd: 0,
      soulboundBadges: [],
    };
  }
}
