import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type LeaderboardPeriod = 'week' | 'month' | 'all';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  /** Referees who completed wallet creation — the metric that actually counts. */
  activations: number;
  /** Referees who reached the fully-retained D7 milestone. */
  retained: number;
  points: number;
}

@Injectable()
export class ReferralLeaderboardService {
  private readonly logger = new Logger(ReferralLeaderboardService.name);
  private static readonly CACHE_TTL_MS = 60_000;

  private readonly cache = new Map<string, { value: LeaderboardEntry[]; expiresAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  /** Start of the requested window, or null for all-time. */
  private windowStart(period: LeaderboardPeriod): Date | null {
    const now = new Date();
    if (period === 'week') {
      // ISO week: rewind to the most recent Monday 00:00 UTC.
      const day = now.getUTCDay();
      const daysSinceMonday = (day + 6) % 7;
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday),
      );
      return start;
    }
    if (period === 'month') {
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    }
    return null;
  }

  async getLeaderboard(
    period: LeaderboardPeriod = 'week',
    limit = 100,
  ): Promise<{ period: LeaderboardPeriod; entries: LeaderboardEntry[] }> {
    const cacheKey = `${period}:${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { period, entries: cached.value };
    }

    const since = this.windowStart(period);

    // Only referrals that reached wallet creation count — raw signups are noise.
    const referrals = await this.prisma.referral.findMany({
      where: {
        walletCreated: true,
        ...(since ? { walletCreatedAt: { gte: since } } : {}),
      },
      select: {
        referrerId: true,
        points: true,
        depositRetainedD7: true,
      },
    });

    const byReferrer = new Map<
      string,
      { activations: number; retained: number; points: number }
    >();
    for (const referral of referrals) {
      const entry = byReferrer.get(referral.referrerId) ?? {
        activations: 0,
        retained: 0,
        points: 0,
      };
      entry.activations += 1;
      if (referral.depositRetainedD7) entry.retained += 1;
      entry.points += referral.points;
      byReferrer.set(referral.referrerId, entry);
    }

    const ranked = [...byReferrer.entries()]
      .sort((a, b) => b[1].activations - a[1].activations || b[1].points - a[1].points)
      .slice(0, limit);

    if (ranked.length === 0) {
      this.cache.set(cacheKey, { value: [], expiresAt: Date.now() + ReferralLeaderboardService.CACHE_TTL_MS });
      return { period, entries: [] };
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: ranked.map(([id]) => id) } },
      select: { id: true, username: true },
    });
    const usernames = new Map(users.map((u) => [u.id, u.username]));

    const entries: LeaderboardEntry[] = ranked.map(([userId, stats], index) => ({
      rank: index + 1,
      userId,
      username: usernames.get(userId) || `user_${userId.slice(0, 6)}`,
      activations: stats.activations,
      retained: stats.retained,
      points: stats.points,
    }));

    this.cache.set(cacheKey, {
      value: entries,
      expiresAt: Date.now() + ReferralLeaderboardService.CACHE_TTL_MS,
    });
    return { period, entries };
  }

  /** Top N referrers for the current week — used by the weekly badge job. */
  async getWeeklyTop(n: number): Promise<LeaderboardEntry[]> {
    const { entries } = await this.getLeaderboard('week', Math.max(n, 1));
    return entries.slice(0, n);
  }
}
