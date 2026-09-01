import { Controller, Get, Header } from '@nestjs/common';
import { PublicStatsService, PublicStats } from './public-stats.service';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Public, unauthenticated platform counters.
 * Consumed by the `/activate` landing page live wallet counter.
 */
// Aggregate, non-identifying platform statistics rendered on the landing page.
@Public()
@Controller('api/metrics')
export class PublicStatsController {
  constructor(private readonly publicStatsService: PublicStatsService) {}

  @Get('public-stats')
  @Header('Cache-Control', 'public, max-age=30')
  async getPublicStats(): Promise<PublicStats> {
    return this.publicStatsService.getStats();
  }

  @Get('total-wallets')
  @Header('Cache-Control', 'public, max-age=30')
  async getTotalWallets(): Promise<{ totalWallets: number; updatedAt: string }> {
    const stats = await this.publicStatsService.getStats();
    return { totalWallets: stats.totalWallets, updatedAt: stats.updatedAt };
  }
}
