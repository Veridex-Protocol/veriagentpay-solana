import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PublicStats {
  totalWallets: number;
  activatedWallets: number;
  totalTransactions: number;
  envelopesClaimed: number;
  updatedAt: string;
}

/**
 * Aggregates non-sensitive platform counters for public surfaces such as the
 * `/activate` landing page live wallet counter.
 *
 * Results are cached in-process so a viral landing page cannot hammer the DB.
 */
@Injectable()
export class PublicStatsService {
  private readonly logger = new Logger(PublicStatsService.name);
  private static readonly CACHE_TTL_MS = 30_000;

  private cache: { value: PublicStats; expiresAt: number } | null = null;
  private inFlight: Promise<PublicStats> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getStats(): Promise<PublicStats> {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.value;
    }
    // Collapse concurrent misses onto a single query batch.
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.computeStats()
      .then((value) => {
        this.cache = { value, expiresAt: Date.now() + PublicStatsService.CACHE_TTL_MS };
        return value;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }

  private async computeStats(): Promise<PublicStats> {
    try {
      const [totalWallets, activatedWallets, totalTransactions, envelopesClaimed] =
        await Promise.all([
          this.prisma.smartWallet.count(),
          this.prisma.smartWallet.count({ where: { isDeployed: true } }),
          this.prisma.userActivityLog.count(),
          this.prisma.envelopeClaim.count(),
        ]);

      return {
        totalWallets,
        activatedWallets,
        totalTransactions,
        envelopesClaimed,
        updatedAt: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`Failed to compute public stats: ${error.message}`);
      // Serve the last known good value rather than breaking the landing page.
      if (this.cache) return this.cache.value;
      return {
        totalWallets: 0,
        activatedWallets: 0,
        totalTransactions: 0,
        envelopesClaimed: 0,
        updatedAt: new Date().toISOString(),
      };
    }
  }
}
