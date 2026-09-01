import { Inject, Injectable } from '@nestjs/common';
import { GrowthService } from './growth.service';
import { BadgesService } from '../badges/badges.service';
import { REFERRAL_SERVICE, ReferralCodeIssuer } from '../common/service-contracts';

@Injectable()
export class UserGrowthStatsService {
  constructor(
    private readonly growthService: GrowthService,
    private readonly badgesService: BadgesService,
    // Injected by token rather than by class — see `service-contracts.ts`.
    @Inject(REFERRAL_SERVICE)
    private readonly referralService: ReferralCodeIssuer
  ) { }

  async getUserStats(userId: string) {
    const rankInfo = await this.badgesService.getUserRank(userId);
    const badgesInfo = await this.badgesService.getUserBadges(userId);
    const streak = await this.growthService.getInteractionStreak(userId);
    const ambassador = await this.growthService.getAmbassadorProfile(userId);
    // The issued code, not one derived from the user id: a derived code matches
    // no `ReferralCode` row, so any invite carrying it is attributed to nobody.
    const inviteCode = await this.referralService.getOrCreateReferralCode(userId);

    return {
      userId,
      rank: rankInfo.globalRank,
      percentile: rankInfo.percentile,
      reputationPoints: rankInfo.reputationPoints,
      totalReferred: rankInfo.totalReferred,
      streakDays: streak.currentStreak,
      streakBonusPoints: streak.totalBonusPoints,
      totalBadgesUnlocked: badgesInfo.totalEarned,
      ambassadorEarnedUsd: ambassador.totalEarnedUsd,
      inviteCode,
      inviteUrl: this.referralService.buildShareUrl(inviteCode, 'growth-stats'),
    };
  }
}
