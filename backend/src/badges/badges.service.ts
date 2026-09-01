import { Injectable, Logger, Inject, forwardRef, NotFoundException } from '@nestjs/common';
import { UserActivityAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getAppBaseUrl } from '../config/app-url.config';
import { NOTIFICATION_SERVICE, type UserNotifier } from '../common/service-contracts';
import { ActivityService } from '../activity/activity.service';
import { FunnelEventsService, FUNNEL_EVENTS } from '../analytics/funnel-events.service';
import { REFERRAL_SERVICE, type ReferralCodeIssuer } from '../common/service-contracts';

const HK2026_BADGE_ID = 'b-hk2026-pioneer';
const HK2026_WINDOW_START = () => new Date(process.env.NEXT_PUBLIC_HK2026_START || '2026-08-27T01:00:00Z');
const HK2026_WINDOW_END = () => new Date(process.env.NEXT_PUBLIC_HK2026_END || '2026-08-29T10:00:00Z');

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  unlocked: boolean;
}

@Injectable()
export class BadgesService {
  private readonly logger = new Logger(BadgesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_SERVICE)
    private readonly unifiedNotificationService: UserNotifier,
    @Inject(forwardRef(() => ActivityService))
    private readonly activityService?: ActivityService,
    private readonly funnelEvents?: FunnelEventsService,
    // Injected by token rather than by class: importing `ReferralService`
    // here, which imports this file back, is a module cycle that `forwardRef`
    // cannot break — see `service-contracts.ts`.
    @Inject(REFERRAL_SERVICE)
    private readonly referralService?: ReferralCodeIssuer,
  ) {}

  private readonly badgeCatalog: BadgeDefinition[] = [
    {
      id: 'b-top-ref',
      name: 'Top Referrer 🌟',
      description: 'Referred over 15 active friends to VeriAgent Pay',
      category: 'REFERRAL',
      icon: '🌟',
      color: 'from-amber-500 to-yellow-400',
      unlocked: true,
    },
    {
      id: 'b-high-rep',
      name: 'Reputation Legend ⭐',
      description: 'Earned 50+ reputation points from on-time P2P repayments',
      category: 'REPUTATION',
      icon: '⭐',
      color: 'from-emerald-500 to-teal-400',
      unlocked: true,
    },
    {
      id: 'b-yield-pioneer',
      name: 'Yield Pioneer 🚀',
      description: 'Deposited into automated AI Yield Vaults with zkTLS proofs',
      category: 'VAULT',
      icon: '🚀',
      color: 'from-purple-500 to-indigo-400',
      unlocked: true,
    },
    {
      id: 'b-launch-supporter',
      name: 'Launch Day Supporter 🛡️',
      category: 'COMMUNITY',
      description: 'Joined VeriAgent Pay during early mainnet launch',
      icon: '🛡️',
      color: 'from-blue-500 to-cyan-400',
      unlocked: true,
    },
    {
      id: HK2026_BADGE_ID,
      name: 'Hong Kong Pioneer 2026 🏅',
      category: 'COMMUNITY',
      description: 'Activated or claimed through the VeriAgent Pay Bitcoin Asia Hong Kong campaign',
      icon: '🏅',
      color: 'from-amber-400 to-emerald-400',
      unlocked: false,
    },
    {
      id: 'b-tx-master',
      name: '1000 TX Master ⚡',
      category: 'ACTIVITY',
      description: 'Executed over 1,000 gasless passkey transactions',
      icon: '⚡',
      color: 'from-pink-500 to-rose-400',
      unlocked: false,
    },
  ];

  async getUserBadges(userId: string) {
    const user = await this.findUser(userId);

    let hasVaultDeposit = false;
    let txCount = 0;

    const deposits = await this.prisma.userActivityLog.count({
      where: { userId: user.id, action: 'VAULT_DEPOSIT' },
    });
    hasVaultDeposit = deposits > 0;

    txCount = await this.prisma.userActivityLog.count({ where: { userId: user.id } });

    const totalReferred = await this.prisma.referral.count({
      where: { referrerId: user.id },
    }).catch(() => 0);

    const reputationPoints = user.reputationPoints || 0;

    const persistedBadgeIds = await this.getUserUnlockedBadges(user.id);
    const badges = this.badgeCatalog.map((b) => {
      let unlocked = persistedBadgeIds.includes(b.id);
      if (b.id === 'b-launch-supporter') {
        unlocked = true;
      } else if (b.id === 'b-top-ref') {
        unlocked = unlocked || totalReferred > 15;
      } else if (b.id === 'b-high-rep') {
        unlocked = unlocked || reputationPoints >= 50;
      } else if (b.id === 'b-yield-pioneer') {
        unlocked = unlocked || hasVaultDeposit;
      } else if (b.id === 'b-tx-master') {
        unlocked = unlocked || txCount >= 1000;
      }

      return { ...b, unlocked };
    });

    const totalEarned = badges.filter((b) => b.unlocked).length;

    return {
      userIdentifier: user.id,
      totalEarned,
      badges,
    };
  }

  async getLeaderboard(limit = 100) {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        username: true,
        reputationPoints: true,
        _count: {
          select: {
            referralsSent: true,
          },
        },
      },
    });

    const calculated = users.map((u) => {
      return {
        id: u.id,
        handle: u.username ? `@${u.username.replace(/^@/, '')}` : 'Anonymous User',
        reputationPoints: u.reputationPoints,
        totalReferred: u._count.referralsSent,
        score: u.reputationPoints + u._count.referralsSent * 10,
      };
    });

    calculated.sort((a, b) => b.score - a.score);

    const rankings = calculated.slice(0, limit).map((c, index) => ({
      id: c.id,
      rank: index + 1,
      handle: c.handle,
      reputationPoints: c.reputationPoints,
      totalReferred: c.totalReferred,
      badgeIcon: index === 0 ? '🏆' : index === 1 ? '🥇' : index === 2 ? '🥈' : '⭐',
      score: c.score,
    }));

    return {
      totalUsers: calculated.length,
      rankings,
    };
  }

  async getUserRank(userId: string) {
    const targetUser = await this.findUser(userId);

    const leaderboard = await this.getLeaderboard(1000);
    const rankings = leaderboard.rankings;

    const userIndex = rankings.findIndex((r) => r.id === targetUser.id);

    const totalUsers = leaderboard.totalUsers;
    const rank = userIndex !== -1 ? rankings[userIndex].rank : null;
    const points = targetUser.reputationPoints;
    const referred = userIndex !== -1 ? rankings[userIndex].totalReferred : 0;

    const percentile = rank && totalUsers > 0
      ? `Top ${Math.max(1, Math.min(100, Math.ceil((rank / totalUsers) * 100)))}%`
      : null;

    // Resolve all unlocked badges for the user
    let userBadges: any = null;
    let unlockedBadges: any[] = [];
    try {
      userBadges = await this.getUserBadges(targetUser.id);
      unlockedBadges = userBadges.badges.filter((b: any) => b.unlocked);
    } catch (err: any) {
      this.logger.warn(`Failed to fetch user badges for rank calculation: ${err.message}`);
    }

    let primaryBadge: string | null = null;
    if (referred > 15) {
      primaryBadge = 'Top Referrer 🌟';
    } else if (points >= 50) {
      primaryBadge = 'Reputation Legend ⭐';
    } else if (unlockedBadges.length > 0) {
      const topBadge = unlockedBadges.find(b => b.id === 'b-high-rep')
        || unlockedBadges.find(b => b.id === 'b-top-ref')
        || unlockedBadges.find(b => b.id === 'b-yield-pioneer')
        || unlockedBadges.find(b => b.id === 'b-launch-supporter')
        || unlockedBadges[0];
      primaryBadge = topBadge.name;
    }

    return {
      userIdentifier: targetUser.id,
      globalRank: rank,
      percentile,
      reputationPoints: points,
      totalReferred: referred,
      primaryBadge,
      unlockedBadgesCount: unlockedBadges.length,
    };
  }

  async getShareCardData(userIdentifier: string) {
    const user = await this.findUser(userIdentifier);
    const rankInfo = await this.getUserRank(user.id);
    const userBadges = await this.getUserBadges(user.id);
    const unlockedBadges = userBadges.badges.filter((b: any) => b.unlocked);

    const primaryBadge = rankInfo.primaryBadge || (unlockedBadges[0] ? unlockedBadges[0].name : 'Launch Day Supporter 🛡️');
    const primaryBadgeIcon = unlockedBadges.find(b => b.name === primaryBadge)?.icon || '🛡️';

    const inviteCode = this.referralService
      ? await this.referralService.getOrCreateReferralCode(user.id)
      : null;
    const inviteUrl =
      inviteCode && this.referralService
        ? this.referralService.buildShareUrl(inviteCode, 'share-card')
        : null;
    const displayName = user.username
      ? (user.username.startsWith('@') ? user.username : `@${user.username}`)
      : (user.email?.split('@')[0] || `wallet-${user.id.slice(0, 8)}`);

    return {
      userIdentifier: user.id,
      displayName,
      globalRank: rankInfo.globalRank,
      badgeTitle: primaryBadge,
      badgeIcon: primaryBadgeIcon,
      unlockedBadgesCount: unlockedBadges.length,
      unlockedBadges: unlockedBadges.map(b => ({ id: b.id, name: b.name, icon: b.icon, color: b.color, description: b.description })),
      totalReferred: rankInfo.totalReferred,
      reputationPoints: rankInfo.reputationPoints,
      inviteCode,
      inviteUrl,
      qrCodeDataUrl: inviteUrl ? this.generateQrDataUrl(inviteUrl) : null,
      brandLogo: 'VeriAgent Pay 🛡️',
      shareText: inviteUrl
        ? `Join me on VeriAgent Pay. ${inviteUrl}`
        : null,
    };
  }

  async getInviteUrl(userId: string): Promise<string> {
    const user = await this.findUser(userId);
    const code = this.referralService
      ? await this.referralService.getOrCreateReferralCode(user.id)
      : null;
    if (!code) throw new NotFoundException('Referral codes are unavailable');
    return this.referralService!.buildShareUrl(code, 'invite-qr');
  }

  private async findUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User profile not found');
    return user;
  }

  generateQrDataUrl(text: string): string {
    // Generate inline SVG Data URI for QR Code preview
    const encoded = encodeURIComponent(text);
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 100 100"><rect width="100" height="100" fill="%230f172a"/><path d="M10 10h30v30H10zM60 10h30v30H60zM10 60h30v30H10zM70 70h10v10H70zM20 20h10v10H20zM70 20h10v10H70zM20 70h10v10H20z" fill="%2310b981"/></svg>`;
  }

  /**
   * Check and award badges to a user based on their activity
   * Call this after significant events (transfers, referrals, loans, etc.)
   */
  async checkAndAwardBadges(userId: string): Promise<string[]> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        this.logger.warn(`User ${userId} not found for badge check`);
        return [];
      }

      // Get unlocked badges
      const existingBadges: any[] = await this.prisma.$queryRaw`
        SELECT "badgeId" FROM "UserBadge" WHERE "userId" = ${userId}
      `;
      const unlockedBadgeIds = existingBadges.map(b => b.badgeId);
      const newlyUnlockedBadges: string[] = [];

      // Get user stats separately
      const referralCount = await this.prisma.referral.count({
        where: { referrerId: userId },
      });

      const activityLogs = await this.prisma.userActivityLog.findMany({
        where: { userId },
        select: { action: true },
      });

      const totalReferred = referralCount;
      const reputationPoints = user.reputationPoints;
      const txCount = activityLogs.length;
      const vaultDeposits = activityLogs.filter(log => log.action === 'VAULT_DEPOSIT').length;

      // Check each badge
      const badgesToCheck = [
        { id: 'b-top-ref', condition: totalReferred > 15, name: 'Top Referrer 🌟' },
        { id: 'b-high-rep', condition: reputationPoints >= 50, name: 'Reputation Legend ⭐' },
        { id: 'b-yield-pioneer', condition: vaultDeposits > 0, name: 'Yield Pioneer 🚀' },
        { id: 'b-launch-supporter', condition: true, name: 'Launch Day Supporter 🛡️' },
        { id: 'b-tx-master', condition: txCount >= 1000, name: '1000 TX Master ⚡' },
      ];

      for (const badge of badgesToCheck) {
        if (badge.condition && !unlockedBadgeIds.includes(badge.id)) {
          // Award new badge
          try {
            const badgeUuid = crypto.randomUUID();
            await this.prisma.$executeRaw`
              INSERT INTO "UserBadge" ("id", "userId", "badgeId", "unlockedAt")
              VALUES (${badgeUuid}, ${userId}, ${badge.id}, NOW())
              ON CONFLICT ("userId", "badgeId") DO NOTHING
            `;

            newlyUnlockedBadges.push(badge.id);

            // Send unified notification
            this.unifiedNotificationService.notifyUser({
              userId,
              type: 'badge_earned',
              title: `🏆 Badge Unlocked: ${badge.name}!`,
              body: `Congratulations! You've earned the ${badge.name} badge!`,
              link: `${getAppBaseUrl()}/badges`,
              metadata: { badgeId: badge.id, badgeName: badge.name },
            }).catch(err => this.logger.warn(`Failed to send badge notification: ${err.message}`));

            await this.activityService?.record({
              userIdentifier: userId,
              action: UserActivityAction.BADGE_EARNED,
              metadata: { badgeId: badge.id, badgeName: badge.name },
            }).catch(() => {});

            this.logger.log(`Badge ${badge.id} awarded to user ${userId}`);
          } catch (err: any) {
            // Unique constraint violation means already awarded (race condition)
            if (!err.message.includes('unique')) {
              this.logger.error(`Failed to award badge ${badge.id} to ${userId}: ${err.message}`);
            }
          }
        }
      }

      return newlyUnlockedBadges;
    } catch (error: any) {
      this.logger.error(`Error checking badges for ${userId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Get persisted badges from database
   */
  async getUserUnlockedBadges(userId: string): Promise<string[]> {
    try {
      const badges: any[] = await this.prisma.$queryRaw`
        SELECT "badgeId" FROM "UserBadge" WHERE "userId" = ${userId}
      `;
      return badges.map(b => b.badgeId);
    } catch (error: any) {
      this.logger.warn(`Failed to fetch badges for ${userId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Awards the conference badge exactly once. The UserBadge row is the durable
   * allowlist for a future NFT mint, while FunnelEvent preserves campaign and
   * source attribution for reporting.
   */
  async awardHk2026PioneerBadge(
    userId: string,
    source: 'telegram_deeplink' | 'onboarding',
    now = new Date(),
  ): Promise<{ awarded: boolean; reason?: 'outside_window' | 'user_not_found' | 'already_awarded' }> {
    if (now < HK2026_WINDOW_START() || now > HK2026_WINDOW_END()) {
      return { awarded: false, reason: 'outside_window' };
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return { awarded: false, reason: 'user_not_found' };

    const result = await this.prisma.userBadge.createMany({
      data: [{ id: crypto.randomUUID(), userId, badgeId: HK2026_BADGE_ID, unlockedAt: now }],
      skipDuplicates: true,
    });
    if (result.count === 0) return { awarded: false, reason: 'already_awarded' };

    const badgeName = 'Hong Kong Pioneer 2026 🏅';
    await Promise.allSettled([
      this.unifiedNotificationService.notifyUser({
        userId,
        type: 'badge_earned',
        title: '🏅 Hong Kong Pioneer badge unlocked',
        body: 'Your Bitcoin Asia 2026 Pioneer badge is now attached to your VeriAgent profile.',
        link: `${getAppBaseUrl()}/badges`,
        metadata: { badgeId: HK2026_BADGE_ID, badgeName, campaign: 'hk2026', source },
      }),
      this.activityService?.record({
        userIdentifier: userId,
        action: UserActivityAction.BADGE_EARNED,
        metadata: { badgeId: HK2026_BADGE_ID, badgeName, campaign: 'hk2026', source },
      }) ?? Promise.resolve(),
      this.funnelEvents?.track(FUNNEL_EVENTS.CAMPAIGN_BADGE_AWARDED, {
        userId,
        attribution: { src: source, campaign: 'hk2026', channel: 'conference' },
        metadata: { badgeId: HK2026_BADGE_ID },
        dedupeKey: `${FUNNEL_EVENTS.CAMPAIGN_BADGE_AWARDED}:${HK2026_BADGE_ID}:${userId}`,
      }) ?? Promise.resolve(),
    ]);

    this.logger.log(`Badge ${HK2026_BADGE_ID} awarded to user ${userId} via ${source}`);
    return { awarded: true };
  }
}
