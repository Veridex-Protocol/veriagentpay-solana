import { Module } from '@nestjs/common';
import { PublicStatsController } from './public-stats.controller';
import { PublicStatsService } from './public-stats.service';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * Public platform counters. Kept separate from {@link MetricsModule} so it does
 * not collide with the Prometheus scrape endpoint mounted at `/metrics`.
 */
@Module({
  imports: [PrismaModule],
  controllers: [PublicStatsController],
  providers: [PublicStatsService],
  exports: [PublicStatsService],
})
export class PublicStatsModule {}
